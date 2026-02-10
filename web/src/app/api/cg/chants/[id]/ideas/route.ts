import { NextRequest, NextResponse } from 'next/server'
import { verifyCGAuth } from '../../../auth'
import { resolveCGUser } from '@/lib/cg-user'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'
import { startVotingPhase, tryCreateContinuousFlowCell } from '@/lib/voting'

// POST /api/cg/chants/[id]/ideas — Submit an idea via CG plugin
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyCGAuth(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params
    const body = await req.json()
    const { cgUserId, cgUsername, cgImageUrl, text } = body

    if (!cgUserId || !cgUsername || !text?.trim()) {
      return NextResponse.json({ error: 'cgUserId, cgUsername, and text are required' }, { status: 400 })
    }

    if (text.trim().length > 500) {
      return NextResponse.json({ error: 'Idea too long (max 500 characters)' }, { status: 400 })
    }

    const moderation = moderateContent(text)
    if (!moderation.allowed) {
      return NextResponse.json({ error: moderation.reason }, { status: 400 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.phase === 'COMPLETED') {
      return NextResponse.json({ error: 'Chant has ended' }, { status: 400 })
    }

    if (deliberation.submissionsClosed) {
      return NextResponse.json({ error: 'Submissions are closed' }, { status: 400 })
    }

    const allowedPhases = ['SUBMISSION', 'ACCUMULATING']
    if (deliberation.continuousFlow && deliberation.phase === 'VOTING') {
      allowedPhases.push('VOTING')
    }

    if (!allowedPhases.includes(deliberation.phase)) {
      return NextResponse.json({ error: 'Chant is not accepting ideas right now' }, { status: 400 })
    }

    const user = await resolveCGUser(cgUserId, cgUsername, cgImageUrl)

    // Auto-join as member
    await prisma.deliberationMember.upsert({
      where: { deliberationId_userId: { deliberationId: id, userId: user.id } },
      update: { lastActiveAt: new Date() },
      create: { deliberationId: id, userId: user.id, role: 'PARTICIPANT' },
    })

    if (deliberation.communityId) {
      await prisma.communityMember.upsert({
        where: { communityId_userId: { communityId: deliberation.communityId, userId: user.id } },
        update: { lastActiveAt: new Date() },
        create: { communityId: deliberation.communityId, userId: user.id, role: 'MEMBER' },
      })
    }

    // Check existing idea (skip if multipleIdeasAllowed)
    if (!deliberation.multipleIdeasAllowed) {
      const isAccumulated = deliberation.phase === 'ACCUMULATING'
      const isContinuousVoting = deliberation.continuousFlow && deliberation.phase === 'VOTING'
      if (!isAccumulated && !isContinuousVoting) {
        // SUBMISSION phase: one idea per user
        const existing = await prisma.idea.findFirst({
          where: { deliberationId: id, authorId: user.id, isNew: false },
        })
        if (existing) {
          return NextResponse.json({ error: 'You have already submitted an idea' }, { status: 400 })
        }
      } else if (isContinuousVoting) {
        // Continuous flow: one SUBMITTED idea at a time
        const existing = await prisma.idea.findFirst({
          where: { deliberationId: id, authorId: user.id, status: 'SUBMITTED' },
        })
        if (existing) {
          return NextResponse.json({ error: 'You already have an idea waiting for a cell' }, { status: 400 })
        }
      } else {
        const existingChallenger = await prisma.idea.findFirst({
          where: { deliberationId: id, authorId: user.id, isNew: true, status: 'PENDING' },
        })
        if (existingChallenger) {
          return NextResponse.json({ error: 'You have already submitted a challenger idea' }, { status: 400 })
        }
      }
    }

    // Check for duplicate text
    const normalizedText = text.trim().toLowerCase()
    const existingIdeas = await prisma.idea.findMany({
      where: { deliberationId: id },
      select: { text: true },
    })
    if (existingIdeas.some((i: { text: string }) => i.text.trim().toLowerCase() === normalizedText)) {
      return NextResponse.json({ error: 'This idea has already been submitted' }, { status: 400 })
    }

    const idea = await prisma.idea.create({
      data: {
        deliberationId: id,
        authorId: user.id,
        text: text.trim(),
        isNew: isAccumulated,
        status: isAccumulated ? 'PENDING' : 'SUBMITTED',
      },
    })

    // Check if idea goal is met (SUBMISSION → auto-start voting)
    if (deliberation.phase === 'SUBMISSION' && deliberation.ideaGoal) {
      const ideaCount = await prisma.idea.count({
        where: { deliberationId: id, status: 'SUBMITTED' },
      })
      if (ideaCount >= deliberation.ideaGoal) {
        try {
          await startVotingPhase(id)
        } catch (err) {
          console.error('Failed to auto-start voting on idea goal:', err)
        }
      }
    }

    // Continuous flow: try to create new cells from unassigned ideas
    if (isContinuousVoting) {
      try {
        await tryCreateContinuousFlowCell(id)
      } catch (err) {
        console.error('Failed to create continuous flow cell:', err)
      }
    }

    return NextResponse.json({
      id: idea.id,
      text: idea.text,
      status: idea.status,
    }, { status: 201 })
  } catch (error) {
    console.error('Error submitting CG idea:', error)
    return NextResponse.json({ error: 'Failed to submit idea' }, { status: 500 })
  }
}
