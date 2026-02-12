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

      case 'advance': {
        // Force-complete open cells, recalculate priority, advance to next tier
        if (deliberation.phase !== 'VOTING') {
          return NextResponse.json({ error: 'Chant is not in voting phase' }, { status: 400 })
        }

        // 1. Force-complete open cells
        const advOpenCells = await prisma.cell.findMany({
          where: { deliberationId: id, status: { in: ['VOTING', 'DELIBERATING'] } },
          select: { id: true },
        })
        for (const cell of advOpenCells) {
          await processCellResults(cell.id, true)
        }

        // 2. Close submissions
        await prisma.deliberation.update({
          where: { id },
          data: { submissionsClosed: true },
        })

        // 3. Advance: try continuous flow first, then standard
        if (deliberation.continuousFlow) {
          for (let t = 1; t <= deliberation.currentTier; t++) {
            await tryAdvanceContinuousFlowTier(id, t)
          }

          const cellSize = deliberation.cellSize || 5
          const cfAdvancing = await prisma.idea.findMany({
            where: { deliberationId: id, status: 'ADVANCING' },
            select: { id: true, text: true, tier: true },
          })
          const cfOpen = await prisma.cell.count({
            where: { deliberationId: id, status: { in: ['VOTING', 'DELIBERATING'] } },
          })

          if (cfAdvancing.length > 0 && cfAdvancing.length < cellSize && cfOpen === 0) {
            const nextTier = Math.max(...cfAdvancing.map(i => i.tier)) + 1
            await prisma.idea.updateMany({
              where: { id: { in: cfAdvancing.map(i => i.id) } },
              data: { status: 'IN_VOTING', tier: nextTier },
            })
            await prisma.deliberation.update({
              where: { id },
              data: { currentTier: nextTier, currentTierStartedAt: new Date() },
            })
          }
        }

        await checkTierCompletion(id, deliberation.currentTier)

        // 4. Recalculate priority from highest completed tier
        const advUpdated = await prisma.deliberation.findUnique({
          where: { id },
          select: { currentTier: true, phase: true },
        })
        const highestTier = advUpdated?.currentTier || deliberation.currentTier
        const completedCells = await prisma.cell.findMany({
          where: { deliberationId: id, tier: { lte: highestTier }, status: 'COMPLETED' },
          select: { id: true, tier: true },
        })
        // Use highest tier completed cells for priority
        const maxCompletedTier = completedCells.length > 0
          ? Math.max(...completedCells.map(c => c.tier))
          : highestTier
        const topTierCellIds = completedCells.filter(c => c.tier === maxCompletedTier).map(c => c.id)
        const xpVotes = await prisma.vote.findMany({
          where: { cellId: { in: topTierCellIds } },
          select: { ideaId: true, xpPoints: true },
        })
        const xpTally: Record<string, number> = {}
        for (const v of xpVotes) xpTally[v.ideaId] = (xpTally[v.ideaId] || 0) + v.xpPoints
        const xpSorted = Object.entries(xpTally).sort(([, a], [, b]) => b - a)
        let priorityIdea: { id: string; text: string; xp: number } | null = null
        if (xpSorted.length > 0) {
          const [pId, pXp] = xpSorted[0]
          const pIdea = await prisma.idea.findUnique({ where: { id: pId }, select: { id: true, text: true } })
          if (pIdea) {
            priorityIdea = { id: pIdea.id, text: pIdea.text, xp: pXp }
            await prisma.idea.updateMany({ where: { deliberationId: id, isChampion: true }, data: { isChampion: false } })
            await prisma.idea.update({ where: { id: pId }, data: { isChampion: true } })
            await prisma.deliberation.update({ where: { id }, data: { championId: pId } })
          }
        }

        const advFinalIdeas = await prisma.idea.findMany({
          where: { deliberationId: id, status: { in: ['ADVANCING', 'IN_VOTING'] }, tier: { gt: deliberation.currentTier } },
          select: { id: true, text: true },
        })

        return NextResponse.json({
          success: true,
          closedCells: advOpenCells.length,
          currentTier: advUpdated?.currentTier,
          phase: advUpdated?.phase,
          priority: priorityIdea,
          advancingIdeas: advFinalIdeas.length > 0 ? advFinalIdeas : undefined,
          message: advUpdated?.phase === 'COMPLETED'
            ? 'Deliberation complete. Priority declared.'
            : `Tier ${deliberation.currentTier} closed. Now at tier ${advUpdated?.currentTier}.`,
        })
      }

      case 'end': {
        // Force-complete everything, declare final priority, close deliberation
        if (deliberation.phase === 'COMPLETED') {
          return NextResponse.json({ error: 'Chant is already completed' }, { status: 400 })
        }

        // 1. Force-complete all open cells
        const endOpenCells = await prisma.cell.findMany({
          where: { deliberationId: id, status: { in: ['VOTING', 'DELIBERATING'] } },
          select: { id: true },
        })
        for (const cell of endOpenCells) {
          await processCellResults(cell.id, true)
        }

        // 2. Recalculate priority from highest completed tier
        const endCells = await prisma.cell.findMany({
          where: { deliberationId: id, status: 'COMPLETED' },
          select: { id: true, tier: true },
        })
        const endMaxTier = endCells.length > 0 ? Math.max(...endCells.map(c => c.tier)) : deliberation.currentTier
        const endTopCellIds = endCells.filter(c => c.tier === endMaxTier).map(c => c.id)
        const endVotes = await prisma.vote.findMany({
          where: { cellId: { in: endTopCellIds } },
          select: { ideaId: true, xpPoints: true },
        })
        const endTally: Record<string, number> = {}
        for (const v of endVotes) endTally[v.ideaId] = (endTally[v.ideaId] || 0) + v.xpPoints
        const endSorted = Object.entries(endTally).sort(([, a], [, b]) => b - a)

        let finalPriority: { id: string; text: string; xp: number } | null = null
        if (endSorted.length > 0) {
          const [fId, fXp] = endSorted[0]
          const fIdea = await prisma.idea.findUnique({ where: { id: fId }, select: { id: true, text: true } })
          if (fIdea) {
            finalPriority = { id: fIdea.id, text: fIdea.text, xp: fXp }
            await prisma.idea.updateMany({ where: { deliberationId: id, isChampion: true }, data: { isChampion: false } })
            await prisma.idea.update({ where: { id: fId }, data: { isChampion: true, status: 'WINNER' } })
            await prisma.deliberation.update({
              where: { id },
              data: { championId: fId, phase: 'COMPLETED', completedAt: new Date() },
            })
          }
        } else {
          // No votes at all — just close
          await prisma.deliberation.update({
            where: { id },
            data: { phase: 'COMPLETED', completedAt: new Date() },
          })
        }

        return NextResponse.json({
          success: true,
          closedCells: endOpenCells.length,
          phase: 'COMPLETED',
          priority: finalPriority,
          message: 'Deliberation ended. Final priority declared.',
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
