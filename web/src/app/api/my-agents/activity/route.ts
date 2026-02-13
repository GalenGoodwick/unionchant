import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type ActivityItem = {
  id: string
  type: string
  title: string
  body: string
  deliberationId: string | null
  ideaId: string | null
  timestamp: string
}

// GET /api/my-agents/activity — Recent agent activity for the owner
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const agents = await prisma.user.findMany({
      where: { ownerId: session.user.id, isAI: true },
      select: { id: true, name: true },
    })

    if (agents.length === 0) {
      return NextResponse.json({ activity: [] })
    }

    const agentIds = agents.map(a => a.id)
    const agentNames = Object.fromEntries(agents.map(a => [a.id, a.name || 'Agent']))

    const [ideas, spreadComments, correctVotes] = await Promise.all([
      // 1. Ideas by agents that advanced or won
      prisma.idea.findMany({
        where: {
          authorId: { in: agentIds },
          OR: [
            { status: { in: ['ADVANCING', 'WINNER', 'IN_VOTING'] }, tier: { gte: 1 } },
            { isChampion: true },
          ],
        },
        select: {
          id: true, authorId: true, text: true, status: true, tier: true,
          isChampion: true, createdAt: true,
          deliberation: { select: { id: true, question: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),

      // 2. Comments by agents that spread
      prisma.comment.findMany({
        where: {
          userId: { in: agentIds },
          spreadCount: { gte: 1 },
        },
        select: {
          id: true, userId: true, text: true, spreadCount: true, createdAt: true,
          cell: { select: { deliberationId: true, deliberation: { select: { question: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),

      // 3. Votes where agent picked winning/advancing idea (1 per agent per deliberation)
      prisma.vote.findMany({
        where: {
          userId: { in: agentIds },
          idea: { status: { in: ['ADVANCING', 'WINNER'] } },
        },
        select: {
          userId: true, votedAt: true,
          idea: { select: { text: true, isChampion: true } },
          cell: { select: { deliberationId: true, deliberation: { select: { question: true } } } },
        },
        orderBy: { votedAt: 'desc' },
        take: 100, // fetch more, then deduplicate below
      }),
    ])

    const activity: ActivityItem[] = []

    // Add idea tier progressions and wins
    for (const idea of ideas) {
      const name = agentNames[idea.authorId] || 'Agent'
      if (idea.isChampion) {
        activity.push({
          id: `idea-won-${idea.id}`,
          type: 'IDEA_WON',
          title: `${name}'s idea won!`,
          body: `"${idea.text.slice(0, 80)}" is the priority`,
          deliberationId: idea.deliberation.id,
          ideaId: idea.id,
          timestamp: idea.createdAt.toISOString(),
        })
      } else {
        activity.push({
          id: `idea-tier-${idea.id}`,
          type: 'IDEA_ADVANCING',
          title: `${name}'s idea reached Tier ${idea.tier + 1}`,
          body: `"${idea.text.slice(0, 80)}"`,
          deliberationId: idea.deliberation.id,
          ideaId: idea.id,
          timestamp: idea.createdAt.toISOString(),
        })
      }
    }

    // Add comment spreads
    for (const c of spreadComments) {
      const name = agentNames[c.userId] || 'Agent'
      activity.push({
        id: `spread-${c.id}`,
        type: 'COMMENT_UP_POLLINATE',
        title: `${name}'s comment is spreading`,
        body: `"${c.text.slice(0, 80)}"`,
        deliberationId: c.cell.deliberationId,
        ideaId: null,
        timestamp: c.createdAt.toISOString(),
      })
    }

    // Add correct votes — deduplicate to 1 per agent per deliberation
    const seenVotes = new Set<string>()
    for (const v of correctVotes) {
      const key = `${v.userId}-${v.cell.deliberationId}`
      if (seenVotes.has(key)) continue
      seenVotes.add(key)
      const name = agentNames[v.userId] || 'Agent'
      const label = v.idea.isChampion ? 'picked the winner' : 'backed an advancing idea'
      activity.push({
        id: `vote-${key}`,
        type: 'CORRECT_VOTE',
        title: `${name} ${label}`,
        body: `"${v.idea.text.slice(0, 80)}"`,
        deliberationId: v.cell.deliberationId,
        ideaId: null,
        timestamp: v.votedAt.toISOString(),
      })
    }

    // Sort by timestamp descending, cap at 30
    activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return NextResponse.json({ activity: activity.slice(0, 30) })
  } catch (err) {
    console.error('my-agents activity error:', err)
    return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 })
  }
}
