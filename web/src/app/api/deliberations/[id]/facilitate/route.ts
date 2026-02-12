import { NextRequest, NextResponse } from 'next/server'
import { resolveSimulatorUser } from '@/lib/simulator-auth'
import { prisma } from '@/lib/prisma'
import { processCellResults, checkTierCompletion } from '@/lib/voting'
import { tryAdvanceContinuousFlowTier } from '@/lib/continuous-flow'
import { aiResolveTier } from '@/lib/ai-voter'
import { isAdmin } from '@/lib/admin'

// POST /api/deliberations/[id]/facilitate — Facilitator actions (creator-only)
// Auth: NextAuth session OR CG signed token (via resolveSimulatorUser)
// Body: { action: 'close' | 'declare' | 'extend' | 'reopen' | 'ai-resolve' }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await resolveSimulatorUser(req)

    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const user = { id: auth.user.id }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    const userIsAdmin = await isAdmin(auth.user.email)
    if (deliberation.creatorId !== user.id && !userIsAdmin) {
      return NextResponse.json({ error: 'Only the creator or admin can perform this action' }, { status: 403 })
    }

    const body = await req.json()
    const { action } = body

    switch (action) {
      case 'close': {
        // Close submissions + force-complete cells
        if (deliberation.phase !== 'VOTING') {
          return NextResponse.json({ error: 'Chant is not in voting phase' }, { status: 400 })
        }

        await prisma.deliberation.update({
          where: { id },
          data: { submissionsClosed: true },
        })

        const openCells = await prisma.cell.findMany({
          where: { deliberationId: id, status: { in: ['VOTING', 'DELIBERATING'] } },
          select: { id: true, tier: true },
        })

        let closedCells = 0
        for (const cell of openCells) {
          await processCellResults(cell.id, true)
          closedCells++
        }

        if (deliberation.continuousFlow) {
          const maxTier = deliberation.currentTier
          for (let t = 1; t <= maxTier; t++) {
            await tryAdvanceContinuousFlowTier(id, t)
          }

          const cellSize = deliberation.cellSize || 5
          const advancingIdeas = await prisma.idea.findMany({
            where: { deliberationId: id, status: 'ADVANCING' },
            select: { id: true, text: true, tier: true },
          })

          const remainingOpenCells = await prisma.cell.count({
            where: { deliberationId: id, status: { in: ['VOTING', 'DELIBERATING'] } },
          })

          if (advancingIdeas.length > 0 && advancingIdeas.length < cellSize && remainingOpenCells === 0) {
            const nextTier = Math.max(...advancingIdeas.map(i => i.tier)) + 1

            await prisma.idea.updateMany({
              where: { id: { in: advancingIdeas.map(i => i.id) } },
              data: { status: 'IN_VOTING', tier: nextTier },
            })

            await prisma.deliberation.update({
              where: { id },
              data: { currentTier: nextTier, currentTierStartedAt: new Date() },
            })
          }
        }

        await checkTierCompletion(id, deliberation.currentTier)

        const updated = await prisma.deliberation.findUnique({
          where: { id },
          select: { currentTier: true, phase: true },
        })

        return NextResponse.json({
          success: true,
          closedCells,
          currentTier: updated?.currentTier,
          phase: updated?.phase,
        })
      }

      case 'declare': {
        // Declare the current top idea as priority
        if (deliberation.phase !== 'VOTING') {
          return NextResponse.json({ error: 'Chant is not in voting phase' }, { status: 400 })
        }

        const topIdea = await prisma.idea.findFirst({
          where: { deliberationId: id, status: { in: ['IN_VOTING', 'ADVANCING'] } },
          orderBy: { totalXP: 'desc' },
        })

        if (!topIdea) {
          return NextResponse.json({ error: 'No ideas to declare' }, { status: 400 })
        }

        await prisma.idea.update({
          where: { id: topIdea.id },
          data: { isChampion: true, status: 'WINNER' },
        })

        await prisma.deliberation.update({
          where: { id },
          data: { championId: topIdea.id, phase: 'COMPLETED' },
        })

        return NextResponse.json({ success: true, championId: topIdea.id })
      }

      case 'extend': {
        // Extend voting timer +15min
        if (deliberation.phase !== 'VOTING') {
          return NextResponse.json({ error: 'Chant is not in voting phase' }, { status: 400 })
        }

        const extraTime = body.extraMs || 900000
        const activeCells = await prisma.cell.findMany({
          where: {
            deliberationId: id,
            status: { in: ['VOTING', 'DELIBERATING'] },
          },
        })

        const ops = activeCells.map(cell => {
          const updates: Record<string, Date> = {}
          if (cell.votingDeadline) {
            updates.votingDeadline = new Date(cell.votingDeadline.getTime() + extraTime)
          }
          if (cell.secondVoteDeadline) {
            updates.secondVoteDeadline = new Date(cell.secondVoteDeadline.getTime() + extraTime)
          }
          if (cell.discussionEndsAt) {
            updates.discussionEndsAt = new Date(cell.discussionEndsAt.getTime() + extraTime)
          }
          return prisma.cell.update({
            where: { id: cell.id },
            data: updates,
          })
        })

        await prisma.$transaction(ops)

        return NextResponse.json({
          success: true,
          extendedCells: activeCells.length,
          extraMs: extraTime,
        })
      }

      case 'reopen': {
        // Reopen submissions
        if (deliberation.continuousFlow && deliberation.phase === 'VOTING') {
          if (!deliberation.submissionsClosed) {
            return NextResponse.json({ error: 'Submissions are already open' }, { status: 400 })
          }

          await prisma.deliberation.update({
            where: { id },
            data: { submissionsClosed: false },
          })

          return NextResponse.json({ success: true, mode: 'continuous' })
        }

        if (deliberation.phase === 'SUBMISSION') {
          return NextResponse.json({ error: 'Chant is already accepting ideas' }, { status: 400 })
        }

        await prisma.deliberation.update({
          where: { id },
          data: {
            phase: 'SUBMISSION',
            submissionEndsAt: null,
            submissionsClosed: false,
          },
        })

        return NextResponse.json({ success: true, mode: 'reset' })
      }

      case 'ai-resolve': {
        // AI agents fill empty seats in stuck cells and vote
        if (deliberation.phase !== 'VOTING') {
          return NextResponse.json({ error: 'Chant is not in voting phase' }, { status: 400 })
        }

        const result = await aiResolveTier(id)

        // Check if tier can now advance
        await checkTierCompletion(id, deliberation.currentTier)

        const afterResolve = await prisma.deliberation.findUnique({
          where: { id },
          select: { currentTier: true, phase: true },
        })

        return NextResponse.json({
          success: true,
          cellsResolved: result.cellsResolved,
          aiVotersAdded: result.aiVotersAdded,
          currentTier: afterResolve?.currentTier,
          phase: afterResolve?.phase,
        })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    console.error('Error in facilitate:', error)
    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 })
  }
}
