import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'
import { getCommunityMemberRole } from '@/lib/community'
import { checkRateLimit, getChatStrike, incrementChatStrike, resetChatStrike, resetRateWindow } from '@/lib/rate-limit'
import { verifyCaptcha } from '@/lib/captcha'

// GET /api/communities/[slug]/chat — List messages (members only)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const community = await prisma.community.findUnique({ where: { slug }, select: { id: true } })
    if (!community) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: user.id } },
    })
    if (!membership) {
      return NextResponse.json({ error: 'Members only' }, { status: 403 })
    }

    const before = req.nextUrl.searchParams.get('before')
    const limit = 50

    const messages = await prisma.groupMessage.findMany({
      where: {
        communityId: community.id,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    })

    const hasMore = messages.length > limit
    const result = messages.slice(0, limit).reverse()

    return NextResponse.json({ messages: result, hasMore })
  } catch (error) {
    console.error('Group chat GET error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST /api/communities/[slug]/chat — Send message (members only)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const community = await prisma.community.findUnique({ where: { slug }, select: { id: true } })
    if (!community) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: user.id } },
    })
    if (!membership) {
      return NextResponse.json({ error: 'Members only' }, { status: 403 })
    }

    const body = await req.json()
    const { text, captchaToken } = body

    // If CAPTCHA token provided, verify it and reset limits
    if (captchaToken) {
      const captchaResult = await verifyCaptcha(captchaToken, user.id)
      if (captchaResult.success) {
        resetChatStrike(user.id)
        resetRateWindow('comment', user.id)
      } else {
        return NextResponse.json({ error: 'CAPTCHA verification failed' }, { status: 400 })
      }
    }

    // Rate limit: reuse 'comment' config (10/min)
    if (await checkRateLimit('comment', user.id)) {
      const { strike, mutedUntil } = incrementChatStrike(user.id)
      if (mutedUntil) {
        return NextResponse.json({
          error: 'MUTED',
          mutedUntil,
          message: 'You have been temporarily muted.',
        }, { status: 429 })
      }
      return NextResponse.json({
        error: 'CAPTCHA_REQUIRED',
        strike,
        message: 'Please verify you are human.',
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
        communityId: community.id,
        userId: user.id,
        text: trimmed,
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    })

    return NextResponse.json(message)
  } catch (error) {
    console.error('Group chat POST error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// DELETE /api/communities/[slug]/chat — Purge all messages (owner/admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const role = await getCommunityMemberRole(slug, user.id)
    if (role !== 'OWNER' && role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only owners and admins can purge chat' }, { status: 403 })
    }

    const community = await prisma.community.findUnique({ where: { slug }, select: { id: true } })
    if (!community) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    const result = await prisma.groupMessage.deleteMany({ where: { communityId: community.id } })

    return NextResponse.json({ success: true, deleted: result.count })
  } catch (error) {
    console.error('Group chat purge error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
