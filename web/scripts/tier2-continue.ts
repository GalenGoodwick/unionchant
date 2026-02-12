/**
 * Continue the 15-agent deliberation into Tier 2.
 * Creates 3 cells of 5, all voting on the same 5 advancing ideas.
 * Runs discussion + voting + recalculates priority.
 */

import Anthropic from '@anthropic-ai/sdk'
import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

async function haiku(system: string, prompt: string): Promise<string> {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = res.content.find(b => b.type === 'text')
  return block && 'text' in block ? block.text : ''
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

async function main() {
  // Find the latest deliberation from architect-1
  const creator = await prisma.user.findUnique({
    where: { email: 'factory_architect-1@agent.unitychant.com' },
  })
  if (!creator) { console.log('No creator found'); return }

  const delib = await prisma.deliberation.findFirst({
    where: { creatorId: creator.id },
    orderBy: { createdAt: 'desc' },
  })
  if (!delib) { console.log('No deliberation found'); return }

  console.log(`=== Tier 2 Continuation ===`)
  console.log(`Deliberation: ${delib.id}`)
  console.log(`Phase: ${delib.phase}, Tier: ${delib.currentTier}\n`)

  // Get tier 2 ideas
  const tier2Ideas = await prisma.idea.findMany({
    where: { deliberationId: delib.id, tier: 2, status: 'IN_VOTING' },
    include: { author: { select: { name: true } } },
  })
  console.log(`Tier 2 ideas (${tier2Ideas.length}):`)
  for (const idea of tier2Ideas) {
    console.log(`  - [${idea.author?.name}] ${idea.text.slice(0, 70)}...`)
  }
  console.log()

  if (tier2Ideas.length === 0) {
    console.log('No tier 2 ideas found. Run advance first.')
    return
  }

  // Get all agents
  const members = await prisma.deliberationMember.findMany({
    where: { deliberationId: delib.id },
    include: { user: { select: { id: true, name: true, ideology: true } } },
  })
  const agents = shuffleArray(members.map(m => m.user))
  console.log(`${agents.length} agents available\n`)

  // Check if tier 2 cells already exist
  let cells = await prisma.cell.findMany({
    where: { deliberationId: delib.id, tier: 2 },
    include: {
      ideas: { include: { idea: true } },
      participants: { include: { user: { select: { id: true, name: true, ideology: true } } } },
    },
  })

  if (cells.length === 0) {
    // Create 3 cells of 5, all voting on the same 5 ideas
    console.log('Creating 3 cells of 5 (all vote on same ideas)...\n')
    const CELL_SIZE = 5
    const numCells = Math.ceil(agents.length / CELL_SIZE)

    for (let c = 0; c < numCells; c++) {
      const cellMembers = agents.slice(c * CELL_SIZE, (c + 1) * CELL_SIZE)
      if (cellMembers.length === 0) break

      await prisma.cell.create({
        data: {
          deliberationId: delib.id,
          tier: 2,
          batch: 0, // All cells vote on same ideas (final showdown batch)
          status: 'VOTING',
          ideas: { create: tier2Ideas.map(idea => ({ ideaId: idea.id })) },
          participants: { create: cellMembers.map(m => ({ userId: m.id })) },
        },
      })
    }

    cells = await prisma.cell.findMany({
      where: { deliberationId: delib.id, tier: 2 },
      include: {
        ideas: { include: { idea: true } },
        participants: { include: { user: { select: { id: true, name: true, ideology: true } } } },
      },
    })
  }

  console.log(`${cells.length} cells:\n`)
  const agentCellMap = new Map<string, typeof cells[0]>()
  for (const cell of cells) {
    console.log(`  Cell (${cell.id.slice(0, 8)}...):`)
    for (const p of cell.participants) {
      agentCellMap.set(p.userId, cell)
      const ideo = p.user.ideology?.split(']')[0] + ']' || ''
      console.log(`    - ${p.user.name} ${ideo}`)
    }
    console.log()
  }

  // Get tier 1 discussion context (viral comments from tier 1)
  const tier1Cells = await prisma.cell.findMany({
    where: { deliberationId: delib.id, tier: 1 },
    select: { id: true },
  })
  const tier1Comments = await prisma.comment.findMany({
    where: { cellId: { in: tier1Cells.map(c => c.id) }, spreadCount: { gte: 1 } },
    include: { user: { select: { name: true } }, idea: { select: { text: true } } },
    orderBy: { upvoteCount: 'desc' },
    take: 10,
  })
  const tier1Context = tier1Comments.length > 0
    ? '\n\nKey insights from Tier 1 (viral comments):\n' +
      tier1Comments.map(c => `[${c.user.name}, ${c.upvoteCount} upvotes] on "${c.idea?.text?.slice(0, 30)}...": ${c.text}`).join('\n')
    : ''

  // ── Discussion Round ──
  console.log('=== Tier 2 Discussion ===\n')

  for (const [agentId, cell] of agentCellMap) {
    const agent = agents.find(a => a.id === agentId)
    if (!agent) continue

    const cellIdeas = cell.ideas.map(ci => ci.idea)
    const ideasList = cellIdeas.map((idea, i) => `${i + 1}. ${idea.text}`).join('\n')

    const response = await haiku(
      `You are ${agent.name}. ${agent.ideology}\n\nTier 2 final showdown. These are the 5 ideas that survived Tier 1. Comment on ONE from your ideological perspective. First line MUST be "IDEA: N". Be sharp — this decides the priority.`,
      `Question: What should we build next for Unity Chant?\n\nSurviving ideas:\n${ideasList}${tier1Context}\n\nPick ONE idea. First line: "IDEA: N". Then 2-3 sentences.`,
    )

    const ideaMatch = response.match(/IDEA:\s*(\d+)/)
    const ideaNum = ideaMatch ? Math.min(Math.max(parseInt(ideaMatch[1]) - 1, 0), cellIdeas.length - 1) : 0
    const commentText = response.replace(/IDEA:\s*\d+\n?/, '').trim()
    const targetIdea = cellIdeas[ideaNum]

    await prisma.comment.create({
      data: { cellId: cell.id, userId: agentId, text: commentText, ideaId: targetIdea.id },
    })
    console.log(`  ${agent.name} → "${targetIdea.text.slice(0, 30)}...": ${commentText.slice(0, 100)}...`)
  }
  console.log()

  // ── Voting ──
  console.log('=== Tier 2 Voting ===\n')

  for (const [agentId, cell] of agentCellMap) {
    const agent = agents.find(a => a.id === agentId)
    if (!agent) continue

    const cellIdeas = cell.ideas.map(ci => ci.idea)
    const ideasList = cellIdeas.map((idea, i) => `${i + 1}. ${idea.text}`).join('\n')

    // Get this cell's discussion
    const allComments = await prisma.comment.findMany({
      where: { cellId: cell.id },
      include: { user: { select: { name: true } }, idea: { select: { text: true } } },
      orderBy: { createdAt: 'asc' },
    })
    const discussion = allComments.map(c => `[${c.user.name}] on "${c.idea?.text?.slice(0, 25)}...": ${c.text}`).join('\n')

    const voteStr = await haiku(
      `You are ${agent.name}. ${agent.ideology}\nTier 2 FINAL VOTE. Be decisive — put most XP on your top choice. Your ideology shapes your judgment. Output ONLY valid JSON array.`,
      `Ideas:\n${ideasList}\n\nTier 2 discussion:\n${discussion}${tier1Context}\n\nAllocate 10 XP. JSON only: [{"idea": 1, "points": 7}, {"idea": 2, "points": 3}]`,
    )

    try {
      const jsonMatch = voteStr.match(/\[[\s\S]*?\]/)
      if (!jsonMatch) throw new Error('No JSON')
      const parsed = JSON.parse(jsonMatch[0]) as { idea: number; points: number }[]

      const allocations = parsed
        .filter(v => v.idea >= 1 && v.idea <= cellIdeas.length && v.points > 0)
        .map(v => ({ ideaId: cellIdeas[v.idea - 1].id, points: v.points }))

      // Normalize to exactly 10 XP
      const total = allocations.reduce((s, a) => s + a.points, 0)
      if (total !== 10 && total > 0 && allocations.length > 0) {
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
            data: { cellId: cell.id, ideaId: a.ideaId, userId: agentId, xpPoints: a.points },
          })
        }
        const voteDesc = allocations.map(a => {
          const idea = cellIdeas.find(i => i.id === a.ideaId)
          return `${a.points}XP→"${idea?.text.slice(0, 25)}..."`
        }).join(', ')
        console.log(`  ${agent.name}: ${voteDesc}`)
      }
    } catch {
      console.log(`  ${agent.name}: vote parse error, skipping`)
    }
  }
  console.log()

  // ── Process results ──
  console.log('=== Tier 2 Results ===\n')

  // Mark cells completed
  for (const cell of cells) {
    await prisma.cell.updateMany({
      where: { id: cell.id, status: { not: 'COMPLETED' } },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })
  }

  // Cross-cell XP tally (all 3 cells vote on same ideas)
  const allCellIds = cells.map(c => c.id)
  const allVotes = await prisma.vote.findMany({ where: { cellId: { in: allCellIds } } })
  const tally: Record<string, number> = {}
  for (const v of allVotes) {
    tally[v.ideaId] = (tally[v.ideaId] || 0) + v.xpPoints
  }
  const sorted = Object.entries(tally).sort(([, a], [, b]) => b - a)

  console.log('Cross-cell XP tally (all 3 tier 2 cells):')
  for (const [ideaId, xp] of sorted) {
    const idea = tier2Ideas.find(i => i.id === ideaId)
    const marker = ideaId === sorted[0][0] ? ' <<<' : ''
    console.log(`  ${xp} XP — ${idea?.text.slice(0, 70)}...${marker}`)
  }

  // Update priority
  if (sorted.length > 0) {
    const priorityId = sorted[0][0]
    await prisma.idea.updateMany({
      where: { deliberationId: delib.id, isChampion: true },
      data: { isChampion: false },
    })
    await prisma.idea.update({
      where: { id: priorityId },
      data: { isChampion: true },
    })
    await prisma.deliberation.update({
      where: { id: delib.id },
      data: { championId: priorityId, currentTier: 2 },
    })

    // Mark winners/losers
    await prisma.idea.update({
      where: { id: priorityId },
      data: { status: 'ADVANCING' },
    })
    const loserIds = sorted.slice(1).map(([id]) => id)
    if (loserIds.length > 0) {
      await prisma.idea.updateMany({
        where: { id: { in: loserIds } },
        data: { status: 'ELIMINATED', losses: { increment: 1 } },
      })
    }

    const priority = tier2Ideas.find(i => i.id === priorityId)
    const champAgent = agents.find(a => a.id === priority?.authorId)

    console.log(`\n========================================`)
    console.log(`TIER 2 PRIORITY`)
    console.log(`========================================`)
    console.log(`Agent: ${priority?.author?.name}`)
    console.log(`Ideology: ${champAgent?.ideology?.split(']')[0]}]`)
    console.log(`Idea:  ${priority?.text}`)
    console.log(`XP:    ${sorted[0][1]}`)
    console.log(`========================================`)
    console.log(`\nContinuous mode: priority can still change with more ideas/agents.`)
  }

  console.log(`\nView: http://localhost:3000/chants/${delib.id}`)
  await prisma.$disconnect()
  await pool.end()
}

main().catch(async err => {
  console.error('\nFATAL:', err)
  await prisma.$disconnect()
  await pool.end()
  process.exit(1)
})
