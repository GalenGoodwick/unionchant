import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'
import { checkRateLimit, incrementChatStrike } from '@/lib/rate-limit'

// GET /api/podiums/[id]/comments — List comments on a podium post
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const podium = await prisma.podium.findUnique({ where: { id }, select: { id: true } })
    if (!podium) return NextResponse.json({ error: 'Podium not found' }, { status: 404 })

    const before = req.nextUrl.searchParams.get('before')
    const limit = 50

    const messages = await prisma.groupMessage.findMany({
      where: {
        podiumId: id,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    })

    return NextResponse.json({ comments: messages })
  } catch (error) {
    console.error('Podium comments GET error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST /api/podiums/[id]/comments — Add a comment to a podium post
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const podium = await prisma.podium.findUnique({ where: { id }, select: { id: true } })
    if (!podium) return NextResponse.json({ error: 'Podium not found' }, { status: 404 })

    // Rate limit
    if (await checkRateLimit('comment', user.id)) {
      const { strike, mutedUntil } = incrementChatStrike(user.id)
      if (mutedUntil) {
        return NextResponse.json({ error: 'MUTED', mutedUntil }, { status: 429 })
      }
      return NextResponse.json({ error: 'RATE_LIMITED', strike }, { status: 429 })
    }

    const body = await req.json()
    const { text } = body

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const trimmed = text.trim()
    if (trimmed.length > 2000) {
      return NextResponse.json({ error: 'Message too long (max 2000 characters)' }, { status: 400 })
    }

    const modResult = moderateContent(trimmed)
    if (!modResult.allowed) {
      return NextResponse.json({ error: modResult.reason || 'Message not allowed' }, { status: 400 })
    }

    const message = await prisma.groupMessage.create({
      data: {
        podiumId: id,
        userId: user.id,
        text: trimmed,
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    })

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    console.error('Podium comments POST error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
