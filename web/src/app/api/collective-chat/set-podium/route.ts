import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'
import { invalidatePodiumCache } from '@/lib/podium-cache'

// POST /api/collective-chat/set-podium — Create a podium post from a collective chat message
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Sign in to write a post' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, name: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await req.json()
    const { title, content, deliberationId } = body

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    if (title.trim().length > 200) {
      return NextResponse.json({ error: 'Title too long (max 200 characters)' }, { status: 400 })
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    if (content.trim().length > 10000) {
      return NextResponse.json({ error: 'Content too long (max 10,000 characters)' }, { status: 400 })
    }

    // Content moderation
    const titleCheck = moderateContent(title.trim())
    if (!titleCheck.allowed) {
      return NextResponse.json({ error: `Title: ${titleCheck.reason}` }, { status: 400 })
    }

    const bodyCheck = moderateContent(content.trim())
    if (!bodyCheck.allowed) {
      return NextResponse.json({ error: `Content: ${bodyCheck.reason}` }, { status: 400 })
    }

    // Validate linked deliberation if provided
    if (deliberationId) {
      const delib = await prisma.deliberation.findUnique({
        where: { id: deliberationId },
        select: { id: true },
      })
      if (!delib) {
        return NextResponse.json({ error: 'Linked chant not found' }, { status: 404 })
      }
    }

    // Create the podium post
    const podium = await prisma.podium.create({
      data: {
        title: title.trim(),
        body: content.trim(),
        authorId: user.id,
        deliberationId: deliberationId || null,
      },
    })

    invalidatePodiumCache()

    return NextResponse.json({
      podium: { id: podium.id, title: podium.title },
    })
  } catch (error) {
    console.error('[Set Podium] POST error:', error)
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 })
  }
}
