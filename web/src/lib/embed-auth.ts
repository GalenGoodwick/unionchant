import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

type EmbedUser = {
  id: string
  email: string
  name: string | null
}

type EmbedAuthSuccess = {
  authenticated: true
  user: EmbedUser
  communityId: string
}

type EmbedAuthFailure = {
  authenticated: false
  response: NextResponse
}

export async function createEmbedToken(userId: string, communityId: string): Promise<string> {
  const rawToken = `uc_et_${crypto.randomBytes(16).toString('hex')}`
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

  await prisma.embedToken.create({
    data: {
      token: tokenHash,
      userId,
      communityId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    },
  })

  return rawToken
}

export async function verifyEmbedToken(req: NextRequest): Promise<EmbedAuthSuccess | EmbedAuthFailure> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer uc_et_')) {
    return {
      authenticated: false,
      response: NextResponse.json({ error: 'Missing or invalid embed token' }, { status: 401 }),
    }
  }

  const rawToken = authHeader.slice(7) // Remove "Bearer "
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

  const embedToken = await prisma.embedToken.findUnique({
    where: { token: tokenHash },
    include: {
      user: { select: { id: true, email: true, name: true, status: true } },
    },
  })

  if (!embedToken) {
    return {
      authenticated: false,
      response: NextResponse.json({ error: 'Invalid embed token' }, { status: 401 }),
    }
  }

  if (embedToken.expiresAt < new Date()) {
    // Clean up expired token
    prisma.embedToken.delete({ where: { id: embedToken.id } }).catch(() => {})
    return {
      authenticated: false,
      response: NextResponse.json({ error: 'Embed token expired' }, { status: 401 }),
    }
  }

  if (embedToken.user.status !== 'ACTIVE') {
    return {
      authenticated: false,
      response: NextResponse.json({ error: 'Account suspended' }, { status: 403 }),
    }
  }

  return {
    authenticated: true,
    user: embedToken.user,
    communityId: embedToken.communityId,
  }
}
