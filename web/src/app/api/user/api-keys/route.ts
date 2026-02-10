import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

// GET /api/user/api-keys — List user's API keys
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const keys = await prisma.apiKey.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ keys })
  } catch (err) {
    console.error('List API keys error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/user/api-keys — Create a new API key
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const body = await req.json()
    const { name } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    // Limit to 10 keys per user
    const count = await prisma.apiKey.count({ where: { userId: user.id } })
    if (count >= 10) {
      return NextResponse.json({ error: 'Maximum 10 API keys per account' }, { status: 400 })
    }

    // Generate key: uc_ak_ + 32 random hex chars
    const rawKey = `uc_ak_${crypto.randomBytes(16).toString('hex')}`
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')
    const keyPrefix = rawKey.slice(0, 12) + '...'

    await prisma.apiKey.create({
      data: {
        name: name.trim(),
        keyHash,
        keyPrefix,
        userId: user.id,
      },
    })

    // Return the raw key — shown ONCE, never stored
    return NextResponse.json({ key: rawKey, prefix: keyPrefix })
  } catch (err) {
    console.error('Create API key error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
