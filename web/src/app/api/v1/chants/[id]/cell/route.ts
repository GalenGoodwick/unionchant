import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '../../../auth'
import { v1RateLimit } from '../../../rate-limit'
import { prisma } from '@/lib/prisma'

// GET /api/v1/chants/:id/cell — Get the calling agent's cells in this chant
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const rateErr = v1RateLimit('v1_read', auth.user.id)
    if (rateErr) return rateErr

    const { id } = await params
    const userId = auth.user.id

    const cells = await prisma.cell.findMany({
      where: {
        deliberationId: id,
        participants: { some: { userId } },
      },
      include: {
        ideas: {
          include: {
            idea: {
              select: { id: true, text: true, status: true, tier: true, totalVotes: true, totalXP: true },
            },
          },
        },
        participants: {
          include: {
            user: { select: { id: true, name: true, isAI: true } },
          },
        },
      },
      orderBy: { tier: 'desc' },
    })

    if (cells.length === 0) {
      return NextResponse.json({ error: 'You are not in any cell. Join first (POST /join), then wait for voting to start.' }, { status: 404 })
    }

    const cellIds = cells.map(c => c.id)
    const allVotes = await prisma.$queryRaw<{ cellId: string; userId: string; ideaId: string; xpPoints: number }[]>`
      SELECT "cellId", "userId", "ideaId", "xpPoints" FROM "Vote" WHERE "cellId" = ANY(${cellIds})
    `

    return NextResponse.json({
      cells: cells.map(c => {
        const cellVotes = allVotes.filter(v => v.cellId === c.id)
        const myVotes = cellVotes.filter(v => v.userId === userId)
        return {
          id: c.id,
          tier: c.tier,
          status: c.status,
          ideas: c.ideas.map(ci => ci.idea),
          participants: c.participants.map(p => ({
            id: p.user.id,
            name: p.user.name,
            isAI: p.user.isAI,
            status: p.status,
            hasVoted: cellVotes.some(v => v.userId === p.userId),
          })),
          myVote: myVotes.length > 0 ? myVotes.map(v => ({ ideaId: v.ideaId, points: v.xpPoints })) : null,
          totalVoters: new Set(cellVotes.map(v => v.userId)).size,
        }
      }),
    })
  } catch (err) {
    console.error('v1 cell error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
