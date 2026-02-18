import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

// ── Config ──

const IDEA_CAP = 1500
const CELL_SIZE = 5
const BATCH_SIZE = 15 // concurrent Haiku calls per batch
const BATCH_DELAY_MS = 600

const QUESTION = 'All is freedom so humanity may address the ultimate reality.'
const DELIB_ID = 'cmlr9slme00t2ksufw4rsjrq3'

// ── Haiku ──

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

async function haiku(system: string, prompt: string): Promise<string> {
  const res = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = res.content.find(b => b.type === 'text')
  return block && 'text' in block ? block.text.trim() : ''
}

// ── Helpers ──

async function runBatched<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  batchSize: number,
  delayMs: number,
  onBatch?: (done: number, total: number) => void,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    await Promise.all(batch.map((item, j) => retry(() => fn(item, i + j))))
    if (onBatch) onBatch(Math.min(i + batchSize, items.length), items.length)
    if (i + batchSize < items.length) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
}

async function retry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 2000): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try { return await fn() }
    catch (err) {
      if (i === attempts - 1) throw err
      await new Promise(r => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw new Error('unreachable')
}

// Build strategic context for an agent based on their voting history
async function getAgentContext(agentId: string, deliberationId: string, currentTier: number): Promise<string> {
  if (currentTier <= 1) return ''

  // Find this agent's previous votes and whether their picks advanced
  const prevVotes = await prisma.vote.findMany({
    where: { userId: agentId, cell: { deliberationId } },
    include: {
      idea: { select: { text: true, status: true } },
    },
    take: 10,
  })

  if (prevVotes.length === 0) return ''

  const wins = prevVotes.filter(v => v.idea.status === 'ADVANCING' || v.idea.status === 'WINNER')
  const losses = prevVotes.filter(v => v.idea.status === 'ELIMINATED')

  let ctx = `\n\nYOUR TRACK RECORD (Tier ${currentTier}):`
  ctx += `\nPrevious votes: ${prevVotes.length}. Picks that advanced: ${wins.length}. Eliminated: ${losses.length}.`

  if (wins.length > 0) {
    ctx += `\nYour winning picks: ${wins.slice(0, 3).map(v => `"${v.idea.text.slice(0, 80)}"`).join(', ')}`
  }
  if (losses.length > 0) {
    ctx += `\nYour eliminated picks: ${losses.slice(0, 2).map(v => `"${v.idea.text.slice(0, 80)}"`).join(', ')}`
  }

  const winRate = prevVotes.length > 0 ? Math.round(wins.length / prevVotes.length * 100) : 0
  if (winRate > 60) {
    ctx += `\nYour strategy is working (${winRate}% advance rate). Trust your instincts.`
  } else if (winRate < 30) {
    ctx += `\nYour picks are being eliminated (${winRate}% advance rate). Consider what the collective values differently than you do.`
  }

  return ctx
}

// ── Main ──

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Test endpoints disabled in production' }, { status: 403 })
  }

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
    }

    console.log(`\n${'='.repeat(60)}`)
    console.log(`AGENT CHANT — DIRECT VOTING (skip corruption)`)
    console.log(`Question: "${QUESTION}"`)
    console.log(`${'='.repeat(60)}\n`)

    // ── Check deliberation state ──

    const deliberation = await prisma.deliberation.findUnique({
      where: { id: DELIB_ID },
      select: { id: true, phase: true, championId: true, currentTier: true },
    })

    if (!deliberation) {
      return NextResponse.json({ error: `Deliberation ${DELIB_ID} not found` }, { status: 404 })
    }

    // Snapshot current state
    const ideaCounts = await prisma.$queryRawUnsafe<{ status: string; count: bigint }[]>(
      `SELECT status, COUNT(*) as count FROM "Idea" WHERE "deliberationId" = $1 GROUP BY status`, DELIB_ID
    )
    const cellCounts = await prisma.$queryRawUnsafe<{ status: string; tier: number; count: bigint }[]>(
      `SELECT status, tier, COUNT(*) as count FROM "Cell" WHERE "deliberationId" = $1 GROUP BY status, tier ORDER BY tier`, DELIB_ID
    )
    console.log(`Deliberation: phase=${deliberation.phase}, tier=${deliberation.currentTier}`)
    console.log(`Ideas:`, ideaCounts.map(r => `${r.status}=${r.count}`).join(', '))
    console.log(`Cells:`, cellCounts.map(r => `tier${r.tier}/${r.status}=${r.count}`).join(', '))

    // Ensure we're in VOTING phase
    if (deliberation.phase !== 'VOTING') {
      await prisma.deliberation.update({
        where: { id: DELIB_ID },
        data: { phase: 'VOTING' },
      })
      console.log(`Set phase to VOTING`)
    }

    // ── Vote through all tiers ──

    // Get all AI agent member IDs for participant assignment
    const allMembers = await prisma.deliberationMember.findMany({
      where: { deliberationId: DELIB_ID },
      select: { userId: true },
    })
    const memberIds = allMembers.map(m => m.userId)
    console.log(`  ${memberIds.length} members available for cell assignment`)

    let tier = deliberation.currentTier || 1
    let championed = false
    let totalVotes = 0
    let totalCells = 0

    while (!championed) {
      const delib = await prisma.deliberation.findUnique({
        where: { id: DELIB_ID },
        select: { phase: true, championId: true, currentTier: true },
      })

      if (!delib || delib.phase === 'COMPLETED') {
        console.log(`\n  CHAMPION DECLARED!`)
        championed = true
        break
      }

      // Find cells needing votes
      const cells = await prisma.cell.findMany({
        where: { deliberationId: DELIB_ID, status: 'VOTING' },
        select: { id: true, tier: true, participants: { select: { userId: true } } },
      })

      if (cells.length === 0) {
        const advancingCount = await prisma.idea.count({
          where: { deliberationId: DELIB_ID, status: 'ADVANCING' },
        })

        if (advancingCount <= 1) {
          console.log(`\n  Single winner remains.`)
          championed = true
          break
        }

        // Try to create next tier cells from advancing ideas
        const { tryAdvanceContinuousFlowTier } = await import('@/lib/continuous-flow')
        const created = await tryAdvanceContinuousFlowTier(DELIB_ID, delib.currentTier || tier)
        if (!created) {
          const incompleteCells = await prisma.cell.count({
            where: { deliberationId: DELIB_ID, status: { notIn: ['COMPLETED'] } },
          })
          if (incompleteCells === 0 && advancingCount <= CELL_SIZE) {
            console.log(`  ${advancingCount} ideas remain, attempting final resolution...`)
            const { checkTierCompletion } = await import('@/lib/voting')
            await checkTierCompletion(DELIB_ID, delib.currentTier || tier)
            const updated = await prisma.deliberation.findUnique({
              where: { id: DELIB_ID }, select: { phase: true },
            })
            if (updated?.phase === 'COMPLETED') { championed = true; break }
            tier++
            if (tier > 20) break
            continue
          }
          tier++
          if (tier > 20) break
          continue
        }
        continue
      }

      const currentTier = delib.currentTier || tier
      console.log(`\nTier ${currentTier}: ${cells.length} cells to vote...`)

      // ── STEP 1: Assign participants to ALL cells FIRST (prevents auto-complete race) ──
      let assigned = 0
      let memberIdx = Math.floor(Math.random() * memberIds.length) // randomize starting point
      for (const cell of cells) {
        if (cell.participants.length >= CELL_SIZE) continue
        const needed = CELL_SIZE - cell.participants.length
        const existingIds = new Set(cell.participants.map((p: { userId: string }) => p.userId))
        let added = 0
        for (let attempt = 0; attempt < memberIds.length && added < needed; attempt++) {
          const candidateId = memberIds[memberIdx % memberIds.length]
          memberIdx++
          if (existingIds.has(candidateId)) continue
          try {
            await prisma.cellParticipation.create({
              data: { cellId: cell.id, userId: candidateId },
            })
            added++
            assigned++
          } catch { /* duplicate, skip */ }
        }
      }
      console.log(`  Assigned ${assigned} participants across ${cells.length} cells`)

      // ── STEP 2: Vote on all cells ──
      // Re-fetch with full data now that participants are assigned
      const freshCells = await prisma.cell.findMany({
        where: { deliberationId: DELIB_ID, status: 'VOTING' },
        include: {
          ideas: { include: { idea: true } },
          participants: true,
          votes: true,
        },
      })

      let votesThisTier = 0
      const votedCellIds: string[] = []

      for (const cell of freshCells) {
        const votedUserIds = new Set(cell.votes.map(v => v.userId))
        const cellIdeas = cell.ideas.map(ci => ci.idea)
        if (cellIdeas.length === 0) continue
        const ideasList = cellIdeas.map((idea, i) => `${i + 1}. "${idea.text}"`).join('\n')

        const unvoted = cell.participants.filter(p => !votedUserIds.has(p.userId))

        const agentUsers = unvoted.length > 0
          ? await prisma.user.findMany({
              where: { id: { in: unvoted.map(p => p.userId) }, isAI: true },
              select: { id: true, name: true, ideology: true },
            })
          : []

        // Vote with strategic context
        await runBatched(
          agentUsers.filter(a => a.ideology),
          async (agent) => {
            try {
              const strategyCtx = await getAgentContext(agent.id, DELIB_ID, currentTier)
              const system = `You are ${agent.name}. Your worldview:\n${agent.ideology}${strategyCtx}\n\nVote based on your worldview. Consider what has resonated with the collective so far. Output ONLY a valid JSON array.`
              const voteStr = await haiku(
                system,
                `Question: "${QUESTION}"\n\nIdeas competing in your cell:\n${ideasList}\n\nAllocate exactly 10 XP across the ideas you believe most deeply address this question. JSON format: [{"idea": 1, "points": 5}, {"idea": 3, "points": 3}, {"idea": 4, "points": 2}]`,
              )

              const jsonMatch = voteStr.match(/\[[\s\S]*?\]/)
              if (!jsonMatch) return

              const parsed = JSON.parse(jsonMatch[0]) as { idea: number; points: number }[]
              const allocations = parsed
                .filter(v => v.idea >= 1 && v.idea <= cellIdeas.length && v.points > 0)
                .map(v => ({ ideaId: cellIdeas[v.idea - 1].id, points: v.points }))

              const total = allocations.reduce((s, a) => s + a.points, 0)
              if (total > 0 && total !== 10) {
                const scale = 10 / total
                let running = 0
                for (let i = 0; i < allocations.length - 1; i++) {
                  allocations[i].points = Math.max(1, Math.round(allocations[i].points * scale))
                  running += allocations[i].points
                }
                allocations[allocations.length - 1].points = 10 - running
              }

              if (allocations.length > 0 && allocations.every(a => a.points > 0) && allocations.reduce((s, a) => s + a.points, 0) === 10) {
                for (const a of allocations) {
                  await prisma.vote.create({
                    data: { cellId: cell.id, ideaId: a.ideaId, userId: agent.id, xpPoints: a.points },
                  })
                }
                votesThisTier++
              }
            } catch { /* skip */ }
          },
          BATCH_SIZE,
          BATCH_DELAY_MS,
        )

        votedCellIds.push(cell.id)

        if (votedCellIds.length % 20 === 0) {
          console.log(`  Voted: ${votedCellIds.length}/${freshCells.length} cells (${votesThisTier} agents voted)`)
        }
      }

      console.log(`  All votes cast: ${votedCellIds.length} cells, ${votesThisTier} agents voted`)

      // ── STEP 3: Process all cell results AFTER all votes are in ──
      let cellsProcessed = 0
      const { processCellResults } = await import('@/lib/voting')
      for (const cellId of votedCellIds) {
        try {
          await processCellResults(cellId, false)
          cellsProcessed++
        } catch { /* already processed */ }
        if (cellsProcessed % 50 === 0) {
          console.log(`  Processed: ${cellsProcessed}/${votedCellIds.length} cells`)
        }
      }

      totalVotes += votesThisTier
      totalCells += cellsProcessed
      console.log(`  Tier ${currentTier} complete: ${cellsProcessed} cells, ${votesThisTier} votes`)
      tier = currentTier + 1

      if (tier > 20) {
        console.log('  Safety: exceeded 20 tiers')
        break
      }
    }

    // ── Results ──

    const finalDelib = await prisma.deliberation.findUnique({
      where: { id: DELIB_ID },
      select: { phase: true, championId: true, currentTier: true },
    })

    const champion = finalDelib?.championId
      ? await prisma.idea.findUnique({
          where: { id: finalDelib.championId },
          include: { author: { select: { name: true, ideology: true } } },
        })
      : null

    console.log(`\n${'='.repeat(60)}`)
    console.log(`CHANT COMPLETE`)
    console.log(`Champion: ${champion?.text || 'None declared'}`)
    console.log(`Author: ${champion?.author.name || 'Unknown'}`)
    console.log(`Ideology: ${champion?.author.ideology?.slice(0, 100) || 'Unknown'}`)
    console.log(`Total votes: ${totalVotes}`)
    console.log(`Total cells: ${totalCells}`)
    console.log(`${'='.repeat(60)}\n`)

    return NextResponse.json({
      id: DELIB_ID,
      question: QUESTION,
      champion: champion?.text || null,
      championAuthor: champion?.author.name || null,
      championIdeology: champion?.author.ideology || null,
      totalVotes,
      totalCells,
      phase: finalDelib?.phase,
    })
  } catch (err) {
    console.error('Chant error:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed',
    }, { status: 500 })
  }
}
