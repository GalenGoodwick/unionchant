import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'
import { checkRateLimit, incrementChatStrike } from '@/lib/rate-limit'
import { isTempUser } from '@/lib/auth'

// GET /api/deliberations/[id]/chat — List messages (reuses GroupMessage)
export async function GET(
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

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      select: { id: true, isPublic: true }
    })
    if (!deliberation) return NextResponse.json({ error: 'Space not found' }, { status: 404 })

    // Check access for private spaces
    if (!deliberation.isPublic) {
      const membership = await prisma.deliberationMember.findUnique({
        where: { deliberationId_userId: { deliberationId: id, userId: user.id } }
      })
      if (!membership) {
        return NextResponse.json({ error: 'Members only' }, { status: 403 })
      }
    }

    const before = req.nextUrl.searchParams.get('before')
    const limit = 50

    const messages = await prisma.groupMessage.findMany({
      where: {
        deliberationId: id,
        ...(before ? { createdAt: { lt: new Date(before) } } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        user: { select: { id: true, name: true, image: true } }
      }
    })

    const hasMore = messages.length > limit
    const result = messages.slice(0, limit).reverse()

    return NextResponse.json({ messages: result, hasMore })
  } catch (error) {
    console.error('Space chat GET error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST /api/deliberations/[id]/chat — Send message (reuses GroupMessage)
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

    if (isTempUser(user)) {
      return NextResponse.json({ error: 'Sign in to send messages', code: 'TEMP_ACCOUNT' }, { status: 403 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      select: { id: true, isPublic: true }
    })
    if (!deliberation) return NextResponse.json({ error: 'Space not found' }, { status: 404 })

    // Check access for private spaces
    if (!deliberation.isPublic) {
      const membership = await prisma.deliberationMember.findUnique({
        where: { deliberationId_userId: { deliberationId: id, userId: user.id } }
      })
      if (!membership) {
        return NextResponse.json({ error: 'Members only' }, { status: 403 })
      }
    }

    const body = await req.json()
    const { text } = body

    // Rate limit
    if (await checkRateLimit('comment', user.id)) {
      const { strike, mutedUntil } = incrementChatStrike(user.id)
      prisma.user.update({ where: { id: user.id }, data: { lastChallengePassedAt: null } }).catch(() => {})
      if (mutedUntil) {
        return NextResponse.json({
          error: 'MUTED',
          mutedUntil,
          message: 'You have been temporarily muted.'
        }, { status: 429 })
      }
      return NextResponse.json({
        error: 'RATE_LIMITED',
        strike,
        message: 'Too many messages. Please slow down.'
      }, { status: 429 })
    }

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
        deliberationId: id,
        userId: user.id,
        text: trimmed
      },
      include: {
        user: { select: { id: true, name: true, image: true } }
      }
    })

    return NextResponse.json(message)
  } catch (error) {
    console.error('Space chat POST error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
