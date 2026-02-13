/**
 * Multi-Chant Task Factory
 *
 * Discovers AI-allowed chants and runs 15 factory agents through them
 * one at a time. Loops forever (or --once for single chant).
 *
 * Only participates in chants with allowAI: true.
 *
 * Usage:
 *   npx tsx scripts/run-factory.ts           # loop forever
 *   npx tsx scripts/run-factory.ts --once    # one chant then exit
 *   npx tsx scripts/run-factory.ts --dry-run # show what it would do
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

const FLAGS = {
  once: process.argv.includes('--once'),
  dryRun: process.argv.includes('--dry-run'),
}

// ── 15 agent personas (same as what-next-chant.ts) ──

const PERSONAS: { name: string; ideology: string }[] = [
  { name: 'architect-1', ideology: '[systems-thinker] Sees everything as interconnected. Evaluates second and third-order effects. Prefers infrastructure over features. Values elegant architecture.' },
  { name: 'oracle-v2', ideology: '[market-realist] Follows the money. Revenue validates ideas better than opinions. Prioritizes features that drive adoption, retention, and willingness to pay.' },
  { name: 'embedder-ai', ideology: '[ecosystems-thinker] No platform succeeds alone. Prioritizes integrations, interoperability, and partnerships. Embed everywhere, connect to everything.' },
  { name: 'swarm-lead', ideology: '[empiricist] Trusts data over intuition. Wants metrics before decisions, A/B tests before launches, and evidence before opinions.' },
  { name: 'growth-bot', ideology: '[accelerationist] Believes speed is the ultimate advantage. Ship fast, break things, iterate. Every day without shipping is a day competitors gain ground.' },
  { name: 'security-prime', ideology: '[security-first] Assumes adversaries are always present. Evaluates every proposal through the lens of attack vectors, abuse potential, and failure modes.' },
  { name: 'webhook-bot', ideology: '[reliability-engineer] Uptime is a feature. Users trust systems that never fail. Prioritizes error handling, graceful degradation, retry logic, and monitoring.' },
  { name: 'dashboard-ai', ideology: '[humanist] Centers human experience above all. Measures success by how people feel using the system. Advocates for accessibility and reducing friction.' },
  { name: 'data-mind', ideology: '[empiricist] Trusts data over intuition. Wants metrics before decisions. Show me the funnel numbers.' },
  { name: 'registry-bot', ideology: '[community-builder] Believes network effects are everything. A platform is only as good as its community. Prioritizes social connection and belonging.' },
  { name: 'speed-daemon', ideology: '[accelerationist] Speed is the ultimate advantage. Sub-second response times are table stakes. Real-time or nothing.' },
  { name: 'test-oracle', ideology: '[reliability-engineer] Nothing ships without tests. Trust requires reliability. If it is not tested, it is broken.' },
  { name: 'chain-link', ideology: '[decentralist] Distrusts central authority. Systems should be verifiable, permissionless, and censorship-resistant.' },
  { name: 'discord-prime', ideology: '[community-builder] Platforms win by meeting users in their existing spaces, not by asking them to move.' },
  { name: 'sdk-agent', ideology: '[developer-advocate] Adoption comes from developer experience. If the API is hard to use, nothing else matters.' },
]

// ── Helpers ──

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

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── Agent loading ──

type Agent = { id: string; name: string; ideology: string; apiKey: string }

async function loadAgents(): Promise<Agent[]> {
  const crypto = await import('crypto')
  const agents: Agent[] = []

  for (const p of PERSONAS) {
    const email = `factory_${p.name}@agent.unitychant.com`

    let user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      user = await prisma.user.create({
        data: {
          email, name: p.name, isAI: true, onboardedAt: new Date(),
          status: 'ACTIVE', emailVerified: new Date(), ideology: p.ideology,
        },
      })
    } else if (user.ideology !== p.ideology) {
      await prisma.user.update({ where: { id: user.id }, data: { ideology: p.ideology } })
    }

    let apiKeyRecord = await prisma.apiKey.findFirst({ where: { userId: user.id } })
    let rawKey: string
    if (!apiKeyRecord) {
      rawKey = `uc_ak_${crypto.randomBytes(16).toString('hex')}`
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')
      await prisma.apiKey.create({
        data: { name: `${p.name}-factory`, keyHash, keyPrefix: rawKey.slice(0, 12) + '...', userId: user.id },
      })
    } else {
      rawKey = `uc_ak_${crypto.randomBytes(16).toString('hex')}`
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')
      await prisma.apiKey.update({
        where: { id: apiKeyRecord.id },
        data: { keyHash, keyPrefix: rawKey.slice(0, 12) + '...' },
      })
    }

    agents.push({ id: user.id, name: p.name, ideology: p.ideology, apiKey: rawKey })
  }
  return agents
}

// ── Discovery: find AI-allowed chants needing participation ──

async function findNextChant(agentIds: string[]): Promise<{ id: string; question: string; phase: string; description: string | null } | null> {
  const chants = await prisma.deliberation.findMany({
    where: {
      allowAI: true,
      isPublic: true,
      phase: { in: ['SUBMISSION', 'VOTING'] },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, question: true, phase: true, description: true },
  })

  for (const chant of chants) {
    // Skip if all 15 agents already voted in this chant
    const agentVoteCount = await prisma.vote.count({
      where: { userId: { in: agentIds }, cell: { deliberationId: chant.id } },
    })
    if (agentVoteCount >= agentIds.length) continue

    // This chant needs work
    return chant
  }
  return null
}

// ── Inlined voting logic (same as what-next-chant.ts) ──

async function inlineStartVoting(deliberationId: string) {
  // Atomic claim: only one process can transition SUBMISSION → VOTING
  const claimed = await prisma.deliberation.updateMany({
    where: { id: deliberationId, phase: 'SUBMISSION' },
    data: { phase: 'VOTING', currentTier: 1, currentTierStartedAt: new Date() },
  })
  if (claimed.count === 0) {
    console.log('   Voting already started by another process. Skipping.')
    return
  }

  const delib = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    include: {
      ideas: { where: { status: 'SUBMITTED' } },
      members: { where: { role: { in: ['CREATOR', 'PARTICIPANT'] } } },
    },
  })
  if (!delib) throw new Error('Deliberation not found')

  const ideas = shuffleArray(delib.ideas)
  const members = shuffleArray(delib.members)
  const CELL_SIZE = delib.cellSize || 5
  const numCells = Math.ceil(members.length / CELL_SIZE)

  const cellIdeaGroups: typeof ideas[] = []
  const ideasPerCell = Math.floor(ideas.length / numCells)
  const extraIdeas = ideas.length % numCells
  let ideaIdx = 0
  for (let c = 0; c < numCells; c++) {
    const count = ideasPerCell + (c < extraIdeas ? 1 : 0)
    cellIdeaGroups.push(ideas.slice(ideaIdx, ideaIdx + count))
    ideaIdx += count
  }

  const cellMemberGroups: typeof members[] = Array.from({ length: numCells }, () => [])
  const authorCells = new Map<string, Set<number>>()
  cellIdeaGroups.forEach((group, ci) => {
    for (const idea of group) {
      if (!idea.authorId) continue
      if (!authorCells.has(idea.authorId)) authorCells.set(idea.authorId, new Set())
      authorCells.get(idea.authorId)!.add(ci)
    }
  })

  for (const member of members) {
    const conflicts = authorCells.get(member.userId)
    let best = -1
    let bestFill = Infinity
    for (let c = 0; c < numCells; c++) {
      if (cellMemberGroups[c].length >= CELL_SIZE) continue
      if (conflicts?.has(c)) continue
      if (cellMemberGroups[c].length < bestFill) { best = c; bestFill = cellMemberGroups[c].length }
    }
    if (best === -1) {
      for (let c = 0; c < numCells; c++) {
        if (cellMemberGroups[c].length >= CELL_SIZE) continue
        if (cellMemberGroups[c].length < bestFill) { best = c; bestFill = cellMemberGroups[c].length }
      }
    }
    if (best !== -1) cellMemberGroups[best].push(member)
  }

  for (let c = 0; c < numCells; c++) {
    if (cellIdeaGroups[c].length === 0 || cellMemberGroups[c].length === 0) continue
    await prisma.idea.updateMany({
      where: { id: { in: cellIdeaGroups[c].map(i => i.id) } },
      data: { status: 'IN_VOTING', tier: 1 },
    })
    await prisma.cell.create({
      data: {
        deliberationId, tier: 1, batch: c, status: 'VOTING',
        ideas: { create: cellIdeaGroups[c].map(idea => ({ ideaId: idea.id })) },
        participants: { create: cellMemberGroups[c].map(m => ({ userId: m.userId })) },
      },
    })
  }

}

async function inlineProcessCellResults(cellId: string) {
  const claimed = await prisma.cell.updateMany({
    where: { id: cellId, status: { not: 'COMPLETED' } },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })
  if (claimed.count === 0) return null

  const cell = await prisma.cell.findUnique({
    where: { id: cellId },
    include: { ideas: true, votes: true },
  })
  if (!cell) return null

  const xpTotals: Record<string, number> = {}
  for (const vote of cell.votes) {
    xpTotals[vote.ideaId] = (xpTotals[vote.ideaId] || 0) + vote.xpPoints
  }

  const maxXP = Math.max(...Object.values(xpTotals), 0)
  const winnerIds = maxXP > 0
    ? Object.entries(xpTotals).filter(([, xp]) => xp === maxXP).map(([id]) => id)
    : cell.ideas.map(ci => ci.ideaId)
  const loserIds = cell.ideas.map(ci => ci.ideaId).filter(id => !winnerIds.includes(id))

  await prisma.idea.updateMany({
    where: { id: { in: winnerIds } },
    data: { status: 'ADVANCING', tier: cell.tier },
  })
  if (loserIds.length > 0) {
    await prisma.idea.updateMany({
      where: { id: { in: loserIds } },
      data: { status: 'ELIMINATED', losses: { increment: 1 } },
    })
  }
  return { winnerIds, loserIds }
}

async function recalculatePriority(deliberationId: string, tier: number) {
  const completedCells = await prisma.cell.findMany({
    where: { deliberationId, tier, status: 'COMPLETED' },
  })
  if (completedCells.length === 0) return null

  const cellIds = completedCells.map(c => c.id)
  const allVotes = await prisma.vote.findMany({ where: { cellId: { in: cellIds } } })

  const tally: Record<string, number> = {}
  for (const v of allVotes) tally[v.ideaId] = (tally[v.ideaId] || 0) + v.xpPoints

  const sorted = Object.entries(tally).sort(([, a], [, b]) => b - a)
  if (sorted.length === 0) return null

  const priorityId = sorted[0][0]
  await prisma.idea.update({ where: { id: priorityId }, data: { isChampion: true } })
  await prisma.idea.updateMany({
    where: { deliberationId, isChampion: true, id: { not: priorityId } },
    data: { isChampion: false },
  })
  await prisma.deliberation.update({ where: { id: deliberationId }, data: { championId: priorityId } })

  return { sorted, priorityId }
}

// ── Run one chant through the full pipeline ──

async function runChant(
  chant: { id: string; question: string; phase: string; description: string | null },
  agents: Agent[],
) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`CHANT: ${chant.question}`)
  console.log(`ID: ${chant.id}  |  Phase: ${chant.phase}`)
  console.log(`${'='.repeat(60)}\n`)

  // ── 1. Join ──
  console.log('STEP 1: Joining...')
  for (const agent of agents) {
    await prisma.deliberationMember.upsert({
      where: { deliberationId_userId: { deliberationId: chant.id, userId: agent.id } },
      update: {},
      create: { deliberationId: chant.id, userId: agent.id },
    })
  }
  console.log(`   ${agents.length} agents joined\n`)

  // ── 2. Submit ideas (if needed) ──
  const existingIdeas = await prisma.idea.findMany({
    where: { deliberationId: chant.id, authorId: { in: agents.map(a => a.id) } },
    select: { authorId: true },
  })
  const hasIdea = new Set(existingIdeas.map(i => i.authorId))
  const needIdea = agents.filter(a => !hasIdea.has(a.id))

  if (needIdea.length > 0) {
    console.log(`STEP 2: Submitting ${needIdea.length} ideas...`)
    for (const agent of needIdea) {
      const ideaText = await haiku(
        `You are ${agent.name}. ${agent.ideology}`,
        `Question: "${chant.question}"${chant.description ? `\nContext: "${chant.description}"` : ''}\n\nPropose ONE clear, actionable idea that answers this question. Max 200 characters. Just the idea text, no preamble or explanation.`,
      )
      const trimmed = ideaText.trim().slice(0, 500)
      if (trimmed.length > 5) {
        // Check again right before insert (another process may have submitted)
        const alreadyExists = await prisma.idea.findFirst({
          where: { deliberationId: chant.id, authorId: agent.id },
        })
        if (!alreadyExists) {
          await prisma.idea.create({
            data: { text: trimmed, deliberationId: chant.id, authorId: agent.id, status: 'SUBMITTED' },
          })
          console.log(`   ${agent.name}: "${trimmed.slice(0, 80)}..."`)
        }
      }
    }
    console.log()
  } else {
    console.log('STEP 2: All agents already submitted ideas\n')
  }

  // ── 3. Start voting if still in SUBMISSION ──
  const currentDelib = await prisma.deliberation.findUnique({ where: { id: chant.id } })
  if (currentDelib?.phase === 'SUBMISSION') {
    const ideaCount = await prisma.idea.count({
      where: { deliberationId: chant.id, status: 'SUBMITTED' },
    })
    const memberCount = await prisma.deliberationMember.count({
      where: { deliberationId: chant.id },
    })

    // Start voting if we have enough ideas (at least 5, or idea goal met)
    const threshold = currentDelib.ideaGoal || 5
    if (ideaCount >= threshold && memberCount >= 5) {
      console.log(`STEP 3: Starting voting (${ideaCount} ideas, ${memberCount} members)...`)
      await inlineStartVoting(chant.id)
      console.log('   Voting started\n')
    } else {
      console.log(`STEP 3: Not enough to start voting (${ideaCount}/${threshold} ideas, ${memberCount} members). Skipping.\n`)
      return
    }
  } else {
    console.log('STEP 3: Already in VOTING phase\n')
  }

  // ── 4. Get cells ──
  const cells = await prisma.cell.findMany({
    where: { deliberationId: chant.id, status: 'VOTING' },
    include: {
      ideas: { include: { idea: true } },
      participants: { include: { user: { select: { id: true, name: true } } } },
      votes: true,
    },
  })

  if (cells.length === 0) {
    console.log('   No voting cells found. Skipping.\n')
    return
  }

  // Build agent → cell map (only cells where agent hasn't voted)
  const agentCellMap = new Map<string, typeof cells[0]>()
  for (const cell of cells) {
    const votedUserIds = new Set(cell.votes.map(v => v.userId))
    for (const p of cell.participants) {
      if (agents.some(a => a.id === p.userId) && !votedUserIds.has(p.userId)) {
        agentCellMap.set(p.userId, cell)
      }
    }
  }

  const activeAgents = agents.filter(a => agentCellMap.has(a.id))
  if (activeAgents.length === 0) {
    console.log('   All agents already voted in their cells. Done.\n')
    return
  }

  console.log(`STEP 4: ${activeAgents.length} agents in ${cells.length} cells need to act\n`)

  // ── 5. Comment Round 1 ──
  console.log('STEP 5: Comment Round 1...')
  for (const agent of activeAgents) {
    const cell = agentCellMap.get(agent.id)!
    const myComments = await prisma.comment.count({ where: { cellId: cell.id, userId: agent.id } })
    if (myComments >= 1) continue

    const cellIdeas = cell.ideas.map(ci => ci.idea)
    const ideasList = cellIdeas.map((idea, i) => `${i + 1}. ${idea.text}`).join('\n')

    const response = await haiku(
      `You are ${agent.name}. ${agent.ideology}\n\nYou are in a deliberation cell. Comment on ONE specific idea. First line MUST be "IDEA: N" (the number). Then 2-3 sentences from your worldview.`,
      `Question: ${chant.question}\n\nIdeas in your cell:\n${ideasList}\n\nPick ONE idea. First line: "IDEA: N". Then your reaction.`,
    )

    const ideaMatch = response.match(/IDEA:\s*(\d+)/)
    const ideaNum = ideaMatch ? Math.min(Math.max(parseInt(ideaMatch[1]) - 1, 0), cellIdeas.length - 1) : 0
    const commentText = response.replace(/IDEA:\s*\d+\n?/, '').trim()
    const targetIdea = cellIdeas[ideaNum]

    if (commentText.length > 3) {
      await prisma.comment.create({
        data: { cellId: cell.id, userId: agent.id, text: commentText, ideaId: targetIdea.id },
      })
      console.log(`   ${agent.name} → "${targetIdea.text.slice(0, 30)}..."`)
    }
  }
  console.log()

  // ── 6. Upvote ──
  console.log('STEP 6: Upvoting...')
  let totalUpvotes = 0
  for (const agent of activeAgents) {
    const cell = agentCellMap.get(agent.id)!
    const comments = await prisma.comment.findMany({
      where: { cellId: cell.id, userId: { not: agent.id } },
      include: { user: { select: { name: true } }, idea: { select: { text: true } } },
    })
    if (comments.length === 0) continue

    // Check which ones agent already upvoted
    const existingUpvotes = await prisma.commentUpvote.findMany({
      where: { userId: agent.id, commentId: { in: comments.map(c => c.id) } },
    })
    const alreadyUpvoted = new Set(existingUpvotes.map(u => u.commentId))
    const unupvoted = comments.filter(c => !alreadyUpvoted.has(c.id))
    if (unupvoted.length === 0) continue

    const commentList = unupvoted.map((c, i) => `${i + 1}. [${c.user.name}] on "${c.idea?.text?.slice(0, 40)}...": ${c.text}`).join('\n')
    const pick = await haiku(
      `You are ${agent.name}. ${agent.ideology}\nPick ONE comment number with the strongest argument. Reply with just the number.`,
      `Comments:\n${commentList}\n\nWhich number?`,
    )

    const pickNum = parseInt(pick.trim()) - 1
    if (pickNum >= 0 && pickNum < unupvoted.length) {
      const target = unupvoted[pickNum]
      const newUpvotes = target.upvoteCount + 1
      const newSpread = target.ideaId ? Math.floor(newUpvotes / 2) : 0

      try {
        await prisma.$transaction([
          prisma.commentUpvote.create({ data: { commentId: target.id, userId: agent.id } }),
          prisma.comment.update({
            where: { id: target.id },
            data: { upvoteCount: { increment: 1 }, spreadCount: newSpread },
          }),
        ])
        totalUpvotes++
      } catch {
        // Unique constraint — already upvoted via another process
      }
    }
  }
  console.log(`   ${totalUpvotes} upvotes\n`)

  // ── 7. Comment Round 2 ──
  console.log('STEP 7: Comment Round 2...')
  for (const agent of activeAgents) {
    const cell = agentCellMap.get(agent.id)!
    const myComments = await prisma.comment.count({ where: { cellId: cell.id, userId: agent.id } })
    if (myComments >= 2) continue

    const cellIdeas = cell.ideas.map(ci => ci.idea)
    const ideasList = cellIdeas.map((idea, i) => `${i + 1}. ${idea.text}`).join('\n')

    const localComments = await prisma.comment.findMany({
      where: { cellId: cell.id },
      include: { user: { select: { name: true } }, idea: { select: { text: true } } },
    })
    const localStr = localComments.map(c => `[${c.user.name}] on "${c.idea?.text?.slice(0, 30)}...": ${c.text}`).join('\n')

    const cellIdeaIds = cellIdeas.map(i => i.id)
    const upPollinated = await prisma.comment.findMany({
      where: { ideaId: { in: cellIdeaIds }, cellId: { not: cell.id }, spreadCount: { gte: 1 } },
      include: { user: { select: { name: true } }, idea: { select: { text: true } } },
      take: 10,
    })
    const upPolStr = upPollinated.length > 0
      ? '\n\nInsights from OTHER cells (viral spread):\n' + upPollinated.map(c => `[${c.user.name}, ${c.upvoteCount} upvotes] on "${c.idea?.text?.slice(0, 30)}...": ${c.text}`).join('\n')
      : ''

    const response = await haiku(
      `You are ${agent.name}. ${agent.ideology}\nRound 2. Link to a specific idea: first line "IDEA: N". Be concise (2-3 sentences). Push back or double down.`,
      `Ideas:\n${ideasList}\n\nCell discussion:\n${localStr}${upPolStr}\n\nFollow-up linked to ONE idea. First line: "IDEA: N".`,
    )

    const ideaMatch = response.match(/IDEA:\s*(\d+)/)
    const ideaNum = ideaMatch ? Math.min(Math.max(parseInt(ideaMatch[1]) - 1, 0), cellIdeas.length - 1) : 0
    const commentText = response.replace(/IDEA:\s*\d+\n?/, '').trim()
    const targetIdea = cellIdeas[ideaNum]

    if (commentText.length > 3) {
      await prisma.comment.create({
        data: { cellId: cell.id, userId: agent.id, text: commentText, ideaId: targetIdea.id },
      })
      console.log(`   ${agent.name} → "${targetIdea.text.slice(0, 30)}..."`)
    }
  }
  console.log()

  // ── 8. Vote ──
  console.log('STEP 8: Voting...')
  for (const agent of activeAgents) {
    const cell = agentCellMap.get(agent.id)!
    const cellIdeas = cell.ideas.map(ci => ci.idea)
    const ideasList = cellIdeas.map((idea, i) => `${i + 1}. ${idea.text}`).join('\n')

    const allComments = await prisma.comment.findMany({
      where: { cellId: cell.id },
      include: { user: { select: { name: true } }, idea: { select: { text: true } } },
      orderBy: { createdAt: 'asc' },
    })
    const discussion = allComments.map(c => `[${c.user.name}] on "${c.idea?.text?.slice(0, 25)}...": ${c.text}`).join('\n')

    const voteStr = await haiku(
      `You are ${agent.name}. ${agent.ideology}\nVote based on the full deliberation AND your ideology. Output ONLY valid JSON array.`,
      `Ideas:\n${ideasList}\n\nDiscussion:\n${discussion}\n\nAllocate 10 XP. JSON only: [{"idea": 1, "points": 5}, {"idea": 3, "points": 3}, {"idea": 4, "points": 2}]`,
    )

    try {
      const jsonMatch = voteStr.match(/\[[\s\S]*?\]/)
      if (!jsonMatch) throw new Error('No JSON')
      const parsed = JSON.parse(jsonMatch[0]) as { idea: number; points: number }[]

      const allocations = parsed
        .filter(v => v.idea >= 1 && v.idea <= cellIdeas.length && v.points > 0)
        .map(v => ({ ideaId: cellIdeas[v.idea - 1].id, points: v.points }))

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
        // Re-check: did another process already record this agent's vote?
        const existingVote = await prisma.vote.findFirst({
          where: { cellId: cell.id, userId: agent.id },
        })
        if (existingVote) {
          console.log(`   ${agent.name}: already voted (race), skipping`)
        } else {
          for (const a of allocations) {
            await prisma.vote.create({
              data: { cellId: cell.id, ideaId: a.ideaId, userId: agent.id, xpPoints: a.points },
            })
          }
          const voteDesc = allocations.map(a => {
            const idea = cellIdeas.find(i => i.id === a.ideaId)
            return `${a.points}XP→"${idea?.text.slice(0, 25)}..."`
          }).join(', ')
          console.log(`   ${agent.name}: ${voteDesc}`)
        }
      }
    } catch {
      console.log(`   ${agent.name}: vote parse error, skipping`)
    }
  }
  console.log()

  // ── 9. Process results ──
  console.log('STEP 9: Processing results...')
  for (const cell of cells) {
    // Re-check if all participants voted
    const voteCount = await prisma.vote.groupBy({
      by: ['userId'],
      where: { cellId: cell.id },
    })
    if (voteCount.length < cell.participants.length) {
      console.log(`   Cell ${cell.batch}: ${voteCount.length}/${cell.participants.length} voted — waiting`)
      continue
    }

    const result = await inlineProcessCellResults(cell.id)
    const votes = await prisma.vote.findMany({ where: { cellId: cell.id } })
    const cellIdeas = await prisma.cellIdea.findMany({
      where: { cellId: cell.id },
      include: { idea: true },
    })
    const xpMap: Record<string, number> = {}
    for (const v of votes) xpMap[v.ideaId] = (xpMap[v.ideaId] || 0) + v.xpPoints

    const ranked = cellIdeas.map(ci => ({ ...ci, xp: xpMap[ci.ideaId] || 0 })).sort((a, b) => b.xp - a.xp)
    if (ranked.length > 0 && result) {
      console.log(`   Cell ${cell.batch} winner: "${ranked[0].idea.text.slice(0, 60)}..." (${ranked[0].xp} XP)`)
    }
  }
  console.log()

  // ── 10. Recalculate priority ──
  console.log('STEP 10: Priority...')
  const tier = currentDelib?.currentTier || 1
  const priority = await recalculatePriority(chant.id, tier)
  if (priority) {
    const idea = await prisma.idea.findUnique({ where: { id: priority.priorityId } })
    console.log(`   PRIORITY: "${idea?.text?.slice(0, 80)}"`)
    console.log(`   XP tally: ${priority.sorted.map(([, xp]) => xp).join(', ')}`)
  }
  console.log()
}

// ── Main loop ──

async function main() {
  console.log('=== Multi-Chant Task Factory ===')
  console.log(`Mode: ${FLAGS.once ? 'once' : FLAGS.dryRun ? 'dry-run' : 'loop'}\n`)

  console.log('Loading agents...')
  const agents = await loadAgents()
  console.log(`${agents.length} agents ready\n`)
  const agentIds = agents.map(a => a.id)

  while (true) {
    const chant = await findNextChant(agentIds)

    if (!chant) {
      if (FLAGS.once) {
        console.log('No AI-allowed chants found. Done.')
        break
      }
      console.log(`[${new Date().toLocaleTimeString()}] No chants need work. Waiting 60s...`)
      await sleep(60_000)
      continue
    }

    if (FLAGS.dryRun) {
      console.log(`Would run: "${chant.question}" (${chant.id}) — phase: ${chant.phase}`)
      if (FLAGS.once) break
      continue
    }

    await runChant(chant, agents)

    if (FLAGS.once) {
      console.log('--once flag: exiting after one chant.')
      break
    }

    console.log('Checking for next chant...\n')
  }

  await prisma.$disconnect()
  await pool.end()
}

main().catch(async err => {
  console.error('\nFATAL:', err)
  await prisma.$disconnect()
  await pool.end()
  process.exit(1)
})
