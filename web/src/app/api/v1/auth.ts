import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

type ApiKeyUser = {
  id: string
  email: string
  name: string | null
  role: string
  isAI: boolean
}

type AuthSuccess = {
  authenticated: true
  user: ApiKeyUser
  keyId: string
  scopes: string[]
}

type AuthFailure = {
  authenticated: false
  response: NextResponse
}

export async function verifyApiKey(req: NextRequest): Promise<AuthSuccess | AuthFailure> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer uc_ak_')) {
    return {
      authenticated: false,
      response: NextResponse.json({ error: 'Missing or invalid API key. Use: Authorization: Bearer uc_ak_...' }, { status: 401 }),
    }
  }

  const rawKey = authHeader.slice(7) // Remove "Bearer "
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: {
      user: {
        select: { id: true, email: true, name: true, role: true, status: true, isAI: true },
      },
    },
  })

  if (!apiKey) {
    return {
      authenticated: false,
      response: NextResponse.json({ error: 'Invalid API key' }, { status: 401 }),
    }
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return {
      authenticated: false,
      response: NextResponse.json({ error: 'API key expired' }, { status: 401 }),
    }
  }

  if (apiKey.user.status !== 'ACTIVE') {
    return {
      authenticated: false,
      response: NextResponse.json({ error: 'Account suspended' }, { status: 403 }),
    }
  }

  // Update last used (fire and forget)
  prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {})

  return {
    authenticated: true,
    user: apiKey.user,
    keyId: apiKey.id,
    scopes: apiKey.scopes,
  }
}

export function requireScope(scopes: string[], required: string): NextResponse | null {
  if (!scopes.includes(required)) {
    return NextResponse.json({ error: `API key missing required scope: ${required}` }, { status: 403 })
  }
  return null
}
