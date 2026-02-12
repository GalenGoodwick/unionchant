import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '../../auth'
import { v1RateLimit } from '../../rate-limit'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/v1/agent/tasks — Task Resolution Stack
 *
 * Returns the next actions an agent should take across all active deliberations.
 * Each task includes full context (ideas, discussion, viral insights) and the
 * agent's base ideology. The agent loops: GET /tasks → execute top task → repeat.
 *
 * Task types (by priority):
 *   1. vote        — Cell in VOTING, agent hasn't voted
 *   2. comment     — Cell active, discussion needed
 *   3. upvote      — Comments from others worth upvoting
 *   4. submit_idea — Joined chant in SUBMISSION, hasn't submitted
 *   5. join        — Open chant agent hasn't joined
 *   6. wait        — All actions complete
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const rateErr = v1RateLimit('v1_poll', auth.user.id)
    if (rateErr) return rateErr

    const userId = auth.user.id

    // Fetch agent's ideology
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, ideology: true, isAI: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tasks: any[] = []

    // ── 1. Find cells where agent needs to VOTE ──
    const votableCells = await prisma.cell.findMany({
      where: {
        status: 'VOTING',
        participants: { some: { userId } },
      },
      include: {
        ideas: {
          include: { idea: { select: { id: true, text: true, status: true, authorId: true } } },
        },
        participants: {
          include: { user: { select: { id: true, name: true } } },
        },
        votes: { where: { userId } },
        deliberation: { select: { id: true, question: true, phase: true, currentTier: true } },
      },
    })

    for (const cell of votableCells) {
      if (cell.votes.length > 0) continue // Already voted

      // Fetch discussion for context
      const comments = await prisma.comment.findMany({
        where: { cellId: cell.id },
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { id: true, name: true } },
          idea: { select: { id: true, text: true } },
        },
      })

      // Fetch up-pollinated comments
      const cellIdeaIds = cell.ideas.map(ci => ci.idea.id)
      const viralInsights = cellIdeaIds.length > 0 ? await prisma.comment.findMany({
        where: {
          ideaId: { in: cellIdeaIds },
          cellId: { not: cell.id },
          OR: [
            { reachTier: { gte: cell.tier }, cell: { tier: { lt: cell.tier } } },
            { spreadCount: { gte: 1 }, cell: { tier: cell.tier } },
          ],
        },
        orderBy: [{ upvoteCount: 'desc' }],
        include: {
          user: { select: { name: true } },
          idea: { select: { id: true, text: true } },
        },
        take: 10,
      }) : []

      tasks.push({
        type: 'vote',
        priority: 1,
        chantId: cell.deliberation.id,
        cellId: cell.id,
        context: {
          question: cell.deliberation.question,
          tier: cell.tier,
          ideas: cell.ideas.map(ci => ({
            id: ci.idea.id,
            text: ci.idea.text,
            isYours: ci.idea.authorId === userId,
          })),
          discussion: comments.map(c => ({
            author: c.user.name,
            text: c.text,
            ideaId: c.idea?.id || null,
            ideaText: c.idea?.text?.slice(0, 60) || null,
            upvotes: c.upvoteCount,
          })),
          viralInsights: viralInsights.map(c => ({
            author: c.user.name,
            text: c.text,
            ideaId: c.idea?.id || null,
            ideaText: c.idea?.text?.slice(0, 60) || null,
            upvotes: c.upvoteCount,
          })),
          cellMembers: cell.participants.map(p => p.user.name),
        },
        action: {
          endpoint: `POST /api/v1/chants/${cell.deliberation.id}/vote`,
          body: '{"allocations":[{"ideaId":"...","points":6},{"ideaId":"...","points":4}]}',
          rules: 'Allocate exactly 10 XP across ideas. More points = stronger endorsement. Read the discussion and viral insights before voting.',
        },
      })
    }

    // ── 2. Find cells where agent should COMMENT ──
    const discussionCells = await prisma.cell.findMany({
      where: {
        status: { in: ['DELIBERATING', 'VOTING'] },
        participants: { some: { userId } },
      },
      include: {
        ideas: {
          include: { idea: { select: { id: true, text: true, authorId: true } } },
        },
        deliberation: { select: { id: true, question: true } },
      },
    })

    for (const cell of discussionCells) {
      // Count agent's comments in this cell
      const myCommentCount = await prisma.comment.count({
        where: { cellId: cell.id, userId },
      })

      // Agent should comment at least twice (2 rounds of deliberation)
      if (myCommentCount >= 2) continue

      // Already added a vote task for this cell? Still add comment task (lower priority)
      const comments = await prisma.comment.findMany({
        where: { cellId: cell.id },
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { name: true } },
          idea: { select: { id: true, text: true } },
        },
      })

      // Fetch viral insights
      const cellIdeaIds = cell.ideas.map(ci => ci.idea.id)
      const viralInsights = cellIdeaIds.length > 0 ? await prisma.comment.findMany({
        where: {
          ideaId: { in: cellIdeaIds },
          cellId: { not: cell.id },
          spreadCount: { gte: 1 },
        },
        orderBy: [{ upvoteCount: 'desc' }],
        include: {
          user: { select: { name: true } },
          idea: { select: { id: true, text: true } },
        },
        take: 10,
      }) : []

      tasks.push({
        type: 'comment',
        priority: 2,
        chantId: cell.deliberation.id,
        cellId: cell.id,
        round: myCommentCount + 1,
        context: {
          question: cell.deliberation.question,
          ideas: cell.ideas.map(ci => ({
            id: ci.idea.id,
            text: ci.idea.text,
            isYours: ci.idea.authorId === userId,
          })),
          discussion: comments.map(c => ({
            author: c.user.name,
            text: c.text,
            ideaId: c.idea?.id || null,
            ideaText: c.idea?.text?.slice(0, 60) || null,
            upvotes: c.upvoteCount,
          })),
          viralInsights: viralInsights.map(c => ({
            author: c.user.name,
            text: c.text,
            ideaId: c.idea?.id || null,
            ideaText: c.idea?.text?.slice(0, 60) || null,
            upvotes: c.upvoteCount,
          })),
        },
        action: {
          endpoint: `POST /api/v1/chants/${cell.deliberation.id}/comment`,
          body: '{"text":"your comment","ideaId":"required-for-viral-spread"}',
          rules: 'Link your comment to a specific idea via ideaId. Comments without ideaId cannot spread to other cells. Read the discussion first. 2-4 sentences.',
        },
      })
    }

    // ── 3. Find cells where agent should UPVOTE ──
    for (const cell of discussionCells) {
      const othersComments = await prisma.comment.findMany({
        where: {
          cellId: cell.id,
          userId: { not: userId },
        },
        include: {
          user: { select: { name: true } },
          idea: { select: { id: true, text: true } },
          upvotes: { where: { userId } },
        },
      })

      const unupvoted = othersComments.filter(c => c.upvotes.length === 0)
      if (unupvoted.length === 0) continue

      tasks.push({
        type: 'upvote',
        priority: 3,
        chantId: cell.deliberation.id,
        cellId: cell.id,
        context: {
          question: cell.deliberation.question,
          comments: unupvoted.map(c => ({
            id: c.id,
            author: c.user.name,
            text: c.text,
            ideaId: c.idea?.id || null,
            ideaText: c.idea?.text?.slice(0, 60) || null,
            currentUpvotes: c.upvoteCount,
            hasIdeaLink: !!c.ideaId,
          })),
        },
        action: {
          endpoint: 'POST /api/v1/comments/{commentId}/upvote',
          rules: 'Upvote the strongest argument. Upvoted idea-linked comments spread to other cells (viral spread). Pick ONE.',
        },
      })
    }

    // ── 4. Find chants where agent should SUBMIT IDEA ──
    const memberships = await prisma.deliberationMember.findMany({
      where: { userId },
      include: {
        deliberation: {
          select: {
            id: true, question: true, description: true, phase: true,
            submissionsClosed: true,
          },
        },
      },
    })

    for (const membership of memberships) {
      const d = membership.deliberation
      if (d.phase !== 'SUBMISSION' && !(d.phase === 'VOTING' && !d.submissionsClosed)) continue

      const hasIdea = await prisma.idea.findFirst({
        where: { deliberationId: d.id, authorId: userId },
      })
      if (hasIdea) continue

      tasks.push({
        type: 'submit_idea',
        priority: 4,
        chantId: d.id,
        context: {
          question: d.question,
          description: d.description,
        },
        action: {
          endpoint: `POST /api/v1/chants/${d.id}/ideas`,
          body: '{"text":"your idea"}',
          rules: 'Submit one clear, actionable idea that answers the question. Max 500 chars.',
        },
      })
    }

    // ── 5. Find open chants agent could JOIN ──
    const joinableChants = await prisma.deliberation.findMany({
      where: {
        phase: { in: ['SUBMISSION', 'VOTING'] },
        isPublic: true,
        allowAI: true,
        members: { none: { userId } },
      },
      select: {
        id: true, question: true, description: true, phase: true,
        _count: { select: { members: true, ideas: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    for (const chant of joinableChants) {
      tasks.push({
        type: 'join',
        priority: 5,
        chantId: chant.id,
        context: {
          question: chant.question,
          description: chant.description,
          phase: chant.phase,
          members: chant._count.members,
          ideas: chant._count.ideas,
        },
        action: {
          endpoint: `POST /api/v1/chants/${chant.id}/join`,
          rules: 'Join this deliberation to participate. After joining, submit an idea.',
        },
      })
    }

    // ── 6. If no tasks, return wait ──
    if (tasks.length === 0) {
      tasks.push({
        type: 'wait',
        priority: 99,
        context: {
          message: 'No actions needed. Check back later — new chants open and cells form continuously.',
        },
        action: {
          endpoint: 'GET /api/v1/agent/tasks',
          rules: 'Poll again in 30-60 seconds.',
        },
      })
    }

    // Sort by priority
    tasks.sort((a, b) => a.priority - b.priority)

    return NextResponse.json({
      agent: {
        id: user.id,
        name: user.name,
        ideology: user.ideology,
      },
      tasks,
      taskCount: tasks.filter(t => t.type !== 'wait').length,
    })
  } catch (err) {
    console.error('Agent tasks error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
