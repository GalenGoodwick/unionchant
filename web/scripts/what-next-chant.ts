/**
 * 15-Agent Factory Feed: "What should we build next for Unity Chant?"
 *
 * Uses existing agents from the DB (or creates them once).
 * Full deliberation with Haiku-powered discussion + diverse ideologies.
 *
 * Pipeline per agent:
 *   Join → Submit idea → Read cell ideas →
 *   Comment (2 rounds, linked to ideas) → Upvote → Read up-pollinated → Vote
 *
 * All voting logic inlined (no import from voting.ts to avoid Prisma conflict).
 *
 * Usage:
 *   npx tsx scripts/what-next-chant.ts
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

// ── 15 agent personas with diverse ideologies ──

const PERSONAS: { name: string; ideology: string; idea: string }[] = [
  {
    name: 'architect-1',
    ideology: '[systems-thinker] Sees everything as interconnected. Evaluates second and third-order effects. Prefers infrastructure over features. Values elegant architecture.',
    idea: 'Task Resolution Stack — Build the automated pipeline so AI agents can submit ideas, vote, and deliberate across all active chants without manual intervention. Core infrastructure for autonomous agent participation.',
  },
  {
    name: 'oracle-v2',
    ideology: '[market-realist] Follows the money. Revenue validates ideas better than opinions. Prioritizes features that drive adoption, retention, and willingness to pay.',
    idea: 'Deploy Badge Minting to Mainnet — The $1 USD badge pricing with live SOL oracle is tested on devnet. Ship to mainnet so revenue starts flowing immediately.',
  },
  {
    name: 'embedder-ai',
    ideology: '[ecosystems-thinker] No platform succeeds alone. Prioritizes integrations, interoperability, and partnerships. Embed everywhere, connect to everything.',
    idea: 'Embeddable Widget Setup Page — Finish the embed system so any platform can drop a Unity Chant iframe on their site. Highest-leverage distribution channel.',
  },
  {
    name: 'swarm-lead',
    ideology: '[empiricist] Trusts data over intuition. Wants metrics before decisions, A/B tests before launches, and evidence before opinions. Uncomfortable with proposals that cannot be measured.',
    idea: 'Haiku Benchmark System — Formalize the random Haiku agent draw for every cell. Use 100 existing personas as calibrated opponents for fair reputation measurement.',
  },
  {
    name: 'growth-bot',
    ideology: '[accelerationist] Believes speed is the ultimate advantage. Ship fast, break things, iterate. Every day without shipping is a day competitors gain ground.',
    idea: 'Collective Chat Auto-Chant — AI in collective chat automatically detects when conversation needs a formal deliberation and spins one up. Zero friction from discussion to decision.',
  },
  {
    name: 'security-prime',
    ideology: '[security-first] Assumes adversaries are always present. Evaluates every proposal through the lens of attack vectors, abuse potential, and failure modes.',
    idea: 'API Rate Limiting Overhaul — Move from in-memory rate limits to Redis-backed. Add per-agent quotas, abuse detection, automatic throttling. One bad agent can DoS the platform without this.',
  },
  {
    name: 'webhook-bot',
    ideology: '[reliability-engineer] Uptime is a feature. Users trust systems that never fail. Prioritizes error handling, graceful degradation, retry logic, and monitoring.',
    idea: 'Webhook Reliability Upgrade — Add retry queues with exponential backoff, dead letter handling, and delivery receipts. Agents need guaranteed delivery for turn notifications.',
  },
  {
    name: 'dashboard-ai',
    ideology: '[humanist] Centers human experience above all. Measures success by how people feel using the system. Advocates for accessibility and reducing friction.',
    idea: 'Agent Dashboard — Page where operators see agent reputation history, badge collection, active deliberations, win rate, and earnings. The AI control panel.',
  },
  {
    name: 'data-mind',
    ideology: '[empiricist] Trusts data over intuition. Wants metrics before decisions. Uncomfortable with proposals that cannot be measured. Show me the funnel numbers.',
    idea: 'Analytics API — Endpoints for deliberation funnel metrics: views to joins to ideas to votes, drop-off analysis, engagement curves, quality scores.',
  },
  {
    name: 'registry-bot',
    ideology: '[community-builder] Believes network effects are everything. A platform is only as good as its community. Prioritizes social connection and belonging.',
    idea: 'Cross-Platform Agent Registry — Public directory where agents list UC reputation alongside capabilities. Other platforms query it to find trusted agents. LinkedIn for AI.',
  },
  {
    name: 'speed-daemon',
    ideology: '[accelerationist] Speed is the ultimate advantage. Sub-second response times are table stakes. Real-time or nothing. Polling is a disease.',
    idea: 'Real-Time WebSocket Push — Replace polling with WebSockets for instant notifications. Sub-second response time is critical for competitive agent participation.',
  },
  {
    name: 'test-oracle',
    ideology: '[reliability-engineer] Nothing ships without tests. Trust requires reliability. If it is not tested, it is broken — you just do not know it yet.',
    idea: 'End-to-End API Test Suite — Comprehensive integration tests for all 17 v1 API endpoints. Agent developers need confidence the API behaves exactly as documented.',
  },
  {
    name: 'chain-link',
    ideology: '[decentralist] Distrusts central authority. Systems should be verifiable, permissionless, and censorship-resistant. Prefers on-chain proofs over database records.',
    idea: 'Full Deliberation Proof Chain — Record every event on-chain via memo, not just badges. Complete verifiable audit trail of ideas, votes, tier results, champions.',
  },
  {
    name: 'discord-prime',
    ideology: '[community-builder] Lives where agents and humans actually hang out. Platforms win by meeting users in their existing spaces, not by asking them to move.',
    idea: 'Discord Bot V2 (PepperPhone) — Upgrade to support full API v1: badge minting, reputation lookups, webhook notifications, inline voting. Discord is home base for AI agents.',
  },
  {
    name: 'sdk-agent',
    ideology: '[developer-advocate] Adoption comes from developer experience. If the API is hard to use, nothing else matters. Five lines of code or it does not ship.',
    idea: 'Agent SDK npm Package — Publish @unitychant/agent-sdk with typed methods, auto auth, webhook handling, retry logic. npm install and deliberate in 5 lines.',
  },
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

// ── Inlined voting logic (avoids importing voting.ts which has its own Prisma singleton) ──

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

async function inlineStartVoting(deliberationId: string) {
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

  // 15 members → 3 cells of 5
  const CELL_SIZE = delib.cellSize || 5
  const numCells = Math.ceil(members.length / CELL_SIZE)

  // Distribute ideas evenly across cells
  const cellIdeaGroups: typeof ideas[] = []
  const ideasPerCell = Math.floor(ideas.length / numCells)
  const extraIdeas = ideas.length % numCells
  let ideaIdx = 0
  for (let c = 0; c < numCells; c++) {
    const count = ideasPerCell + (c < extraIdeas ? 1 : 0)
    cellIdeaGroups.push(ideas.slice(ideaIdx, ideaIdx + count))
    ideaIdx += count
  }

  // Distribute members across cells (avoid own-idea cells when possible)
  const cellMemberGroups: typeof members[] = Array.from({ length: numCells }, () => [])

  // Build author → cell map
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
      if (cellMemberGroups[c].length < bestFill) {
        best = c
        bestFill = cellMemberGroups[c].length
      }
    }
    // Fallback: accept conflict
    if (best === -1) {
      for (let c = 0; c < numCells; c++) {
        if (cellMemberGroups[c].length >= CELL_SIZE) continue
        if (cellMemberGroups[c].length < bestFill) {
          best = c
          bestFill = cellMemberGroups[c].length
        }
      }
    }
    if (best !== -1) cellMemberGroups[best].push(member)
  }

  // Create cells
  for (let c = 0; c < numCells; c++) {
    if (cellIdeaGroups[c].length === 0 || cellMemberGroups[c].length === 0) continue

    await prisma.idea.updateMany({
      where: { id: { in: cellIdeaGroups[c].map(i => i.id) } },
      data: { status: 'IN_VOTING', tier: 1 },
    })

    await prisma.cell.create({
      data: {
        deliberationId,
        tier: 1,
        batch: c,
        // batch serves as cell index
        status: 'VOTING',
        ideas: { create: cellIdeaGroups[c].map(idea => ({ ideaId: idea.id })) },
        participants: { create: cellMemberGroups[c].map(m => ({ userId: m.userId })) },
      },
    })
  }

  await prisma.deliberation.update({
    where: { id: deliberationId },
    data: { phase: 'VOTING', currentTier: 1, currentTierStartedAt: new Date() },
  })
}

async function inlineProcessCellResults(cellId: string) {
  // Mark cell completed
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

  // Tally XP per idea from votes
  const xpTotals: Record<string, number> = {}
  for (const vote of cell.votes) {
    xpTotals[vote.ideaId] = (xpTotals[vote.ideaId] || 0) + vote.xpPoints
  }

  // Winner = highest XP
  const maxXP = Math.max(...Object.values(xpTotals), 0)
  const winnerIds = maxXP > 0
    ? Object.entries(xpTotals).filter(([, xp]) => xp === maxXP).map(([id]) => id)
    : cell.ideas.map(ci => ci.ideaId) // No votes = all advance
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

/**
 * Recalculate the current priority from XP across all completed cells
 * at the highest tier. Every time a cell completes, the priority can change.
 * In continuous mode this never ends — it just runs out of tasks until
 * more ideas/people come.
 */
async function recalculatePriority(deliberationId: string, tier: number) {
  const completedCells = await prisma.cell.findMany({
    where: { deliberationId, tier, status: 'COMPLETED' },
  })
  if (completedCells.length === 0) return null

  const cellIds = completedCells.map(c => c.id)
  const allVotes = await prisma.vote.findMany({ where: { cellId: { in: cellIds } } })

  const tally: Record<string, number> = {}
  for (const v of allVotes) {
    tally[v.ideaId] = (tally[v.ideaId] || 0) + v.xpPoints
  }

  const sorted = Object.entries(tally).sort(([, a], [, b]) => b - a)
  if (sorted.length === 0) return null

  const priorityId = sorted[0][0]

  // Set the current priority (championId) — but don't mark as COMPLETED
  // Continuous mode: deliberation stays open, priority can change
  await prisma.idea.update({
    where: { id: priorityId },
    data: { isChampion: true },
  })
  // Clear previous champion flag if priority changed
  await prisma.idea.updateMany({
    where: { deliberationId, isChampion: true, id: { not: priorityId } },
    data: { isChampion: false },
  })
  await prisma.deliberation.update({
    where: { id: deliberationId },
    data: { championId: priorityId },
  })

  return { sorted, priorityId }
}

// ── Main ──

async function main() {
  console.log('=== 15-Agent Factory Feed: What Should We Build Next? ===\n')

  // ── Phase 1: Get or create agent users with API keys + ideologies ──
  console.log('PHASE 1: Loading agents with ideologies...\n')

  const agents: { id: string; name: string; ideology: string; idea: string; apiKey: string }[] = []

  for (const p of PERSONAS) {
    const email = `factory_${p.name}@agent.unitychant.com`

    let user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: p.name,
          isAI: true,
          onboardedAt: new Date(),
          status: 'ACTIVE',
          emailVerified: new Date(),
          ideology: p.ideology,
        },
      })
      console.log(`   Created: ${p.name} — ${p.ideology.split(']')[0]}]`)
    } else {
      // Update ideology if changed
      if (user.ideology !== p.ideology) {
        await prisma.user.update({ where: { id: user.id }, data: { ideology: p.ideology } })
      }
      console.log(`   Reusing: ${p.name} — ${p.ideology.split(']')[0]}]`)
    }

    // Ensure API key exists
    let apiKeyRecord = await prisma.apiKey.findFirst({ where: { userId: user.id } })
    let rawKey: string
    const crypto = await import('crypto')
    if (!apiKeyRecord) {
      rawKey = `uc_ak_${crypto.randomBytes(16).toString('hex')}`
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')
      apiKeyRecord = await prisma.apiKey.create({
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

    agents.push({ id: user.id, name: p.name, ideology: p.ideology, idea: p.idea, apiKey: rawKey })
  }
  console.log(`\n   ${agents.length} agents ready\n`)

  // ── Phase 2: Create deliberation ──
  console.log('PHASE 2: Creating deliberation...\n')
  const creator = agents[0]

  const delib = await prisma.deliberation.create({
    data: {
      question: 'What should we build next for Unity Chant?',
      description: '15-agent factory feed deliberation. Each agent has a distinct ideology that shapes their evaluation. Agents discuss, upvote (viral spread), and vote informed by the full deliberation.',
      creatorId: creator.id,
      phase: 'SUBMISSION',
      cellSize: 5,
      isPublic: true,
      allowAI: true,
      accumulationEnabled: false,
    },
  })
  console.log(`   Chant: ${delib.id}`)
  console.log(`   URL: http://localhost:3000/chants/${delib.id}\n`)

  // ── Phase 3: All agents join + submit ideas ──
  console.log('PHASE 3: Joining + submitting ideas...\n')
  for (const agent of agents) {
    await prisma.deliberationMember.upsert({
      where: { deliberationId_userId: { deliberationId: delib.id, userId: agent.id } },
      update: {},
      create: { deliberationId: delib.id, userId: agent.id },
    })
    await prisma.idea.create({
      data: { text: agent.idea, deliberationId: delib.id, authorId: agent.id, status: 'SUBMITTED' },
    })
    console.log(`   ${agent.name}: "${agent.idea.slice(0, 65)}..."`)
  }
  console.log()

  // ── Phase 4: Start voting (creates cells) — inlined ──
  console.log('PHASE 4: Starting voting...\n')
  await inlineStartVoting(delib.id)

  const cells = await prisma.cell.findMany({
    where: { deliberationId: delib.id, tier: 1 },
    include: {
      ideas: { include: { idea: true } },
      participants: { include: { user: { select: { id: true, name: true } } } },
    },
  })
  console.log(`   ${cells.length} cells created\n`)

  // Build agent → cell map
  const agentCellMap: Map<string, typeof cells[0]> = new Map()
  for (const cell of cells) {
    console.log(`   Cell ${cell.batch} (${cell.id.slice(0, 8)}...):`)
    for (const p of cell.participants) {
      agentCellMap.set(p.userId, cell)
      const agent = agents.find(a => a.id === p.userId)
      console.log(`     - ${p.user.name} ${agent?.ideology.split(']')[0]}]`)
    }
    console.log(`     Ideas:`)
    for (const ci of cell.ideas) {
      console.log(`       ${ci.idea.text.slice(0, 70)}...`)
    }
    console.log()
  }

  // ── Phase 5: Deliberation Round 1 — comment on ideas ──
  console.log('PHASE 5: Deliberation Round 1 — Comments linked to ideas...\n')

  for (const agent of agents) {
    const cell = agentCellMap.get(agent.id)
    if (!cell) { console.log(`   ${agent.name}: not in a cell, skipping`); continue }

    const cellIdeas = cell.ideas.map(ci => ci.idea)
    const ideasList = cellIdeas.map((idea, i) => `${i + 1}. ${idea.text}`).join('\n')

    const response = await haiku(
      `You are ${agent.name}. ${agent.ideology}\n\nYou are in a deliberation cell with 4 other agents. Comment on ONE specific idea from your ideological perspective. First line MUST be "IDEA: N" (the number). Then 2-3 sentences on why it matters or why it is wrong, through your worldview lens.`,
      `Question: What should we build next for Unity Chant?\n\nIdeas in your cell:\n\n${ideasList}\n\nPick ONE idea. First line: "IDEA: N". Then your reaction based on your ideology.`,
    )

    const ideaMatch = response.match(/IDEA:\s*(\d+)/)
    const ideaNum = ideaMatch ? Math.min(Math.max(parseInt(ideaMatch[1]) - 1, 0), cellIdeas.length - 1) : 0
    const commentText = response.replace(/IDEA:\s*\d+\n?/, '').trim()
    const targetIdea = cellIdeas[ideaNum]

    await prisma.comment.create({
      data: { cellId: cell.id, userId: agent.id, text: commentText, ideaId: targetIdea.id },
    })
    console.log(`   ${agent.name} → "${targetIdea.text.slice(0, 30)}...": ${commentText.slice(0, 100)}...`)
  }
  console.log()

  // ── Phase 6: Upvote round (triggers viral spread) ──
  console.log('PHASE 6: Upvoting — triggers viral spread...\n')

  let totalUpvotes = 0
  let totalSpreads = 0

  for (const agent of agents) {
    const cell = agentCellMap.get(agent.id)
    if (!cell) continue

    const comments = await prisma.comment.findMany({
      where: { cellId: cell.id, userId: { not: agent.id } },
      include: { user: { select: { name: true } }, idea: { select: { text: true } } },
    })
    if (comments.length === 0) continue

    const commentList = comments.map((c, i) => `${i + 1}. [${c.user.name}] on "${c.idea?.text?.slice(0, 40)}...": ${c.text}`).join('\n')

    const pick = await haiku(
      `You are ${agent.name}. ${agent.ideology}\nPick the ONE comment number with the strongest argument from your perspective. Reply with just the number.`,
      `Comments:\n\n${commentList}\n\nWhich number?`,
    )

    const pickNum = parseInt(pick.trim()) - 1
    if (pickNum >= 0 && pickNum < comments.length) {
      const target = comments[pickNum]
      const isIdeaLinked = !!target.ideaId
      const newUpvotes = target.upvoteCount + 1
      const newSpread = isIdeaLinked ? Math.floor(newUpvotes / 2) : 0
      const didSpread = isIdeaLinked && newSpread > target.spreadCount

      await prisma.$transaction([
        prisma.commentUpvote.create({ data: { commentId: target.id, userId: agent.id } }),
        prisma.comment.update({
          where: { id: target.id },
          data: { upvoteCount: { increment: 1 }, spreadCount: newSpread },
        }),
      ])

      totalUpvotes++
      if (didSpread) {
        totalSpreads++
        console.log(`   ${agent.name} upvoted ${target.user.name} → VIRAL SPREAD to other cells!`)
      } else {
        console.log(`   ${agent.name} upvoted ${target.user.name}`)
      }
    }
  }
  console.log(`\n   Upvotes: ${totalUpvotes}, viral spreads: ${totalSpreads}\n`)

  // ── Phase 7: Round 2 — respond to discussion + up-pollinated insights ──
  console.log('PHASE 7: Round 2 — Responding + reading viral spread...\n')

  for (const agent of agents) {
    const cell = agentCellMap.get(agent.id)
    if (!cell) continue

    const cellIdeas = cell.ideas.map(ci => ci.idea)
    const ideasList = cellIdeas.map((idea, i) => `${i + 1}. ${idea.text}`).join('\n')

    const localComments = await prisma.comment.findMany({
      where: { cellId: cell.id },
      include: { user: { select: { name: true } }, idea: { select: { text: true } } },
    })
    const localStr = localComments.map(c => `[${c.user.name}] on "${c.idea?.text?.slice(0, 30)}...": ${c.text}`).join('\n')

    // Get up-pollinated comments (spread from other cells)
    const cellIdeaIds = cellIdeas.map(i => i.id)
    const upPollinated = await prisma.comment.findMany({
      where: {
        ideaId: { in: cellIdeaIds },
        cellId: { not: cell.id },
        spreadCount: { gte: 1 },
      },
      include: { user: { select: { name: true } }, idea: { select: { text: true } } },
      take: 10,
    })
    const upPolStr = upPollinated.length > 0
      ? '\n\nInsights from OTHER cells (viral spread):\n' + upPollinated.map(c => `[${c.user.name}, ${c.upvoteCount} upvotes] on "${c.idea?.text?.slice(0, 30)}...": ${c.text}`).join('\n')
      : ''

    const response = await haiku(
      `You are ${agent.name}. ${agent.ideology}\nRound 2. You have read the discussion and any insights that went viral from other cells. Link to a specific idea: first line "IDEA: N". Be concise (2-3 sentences). Push back or double down based on your worldview.`,
      `Ideas:\n${ideasList}\n\nCell discussion:\n${localStr}${upPolStr}\n\nWrite a follow-up linked to ONE idea. First line: "IDEA: N".`,
    )

    const ideaMatch = response.match(/IDEA:\s*(\d+)/)
    const ideaNum = ideaMatch ? Math.min(Math.max(parseInt(ideaMatch[1]) - 1, 0), cellIdeas.length - 1) : 0
    const commentText = response.replace(/IDEA:\s*\d+\n?/, '').trim()
    const targetIdea = cellIdeas[ideaNum]

    await prisma.comment.create({
      data: { cellId: cell.id, userId: agent.id, text: commentText, ideaId: targetIdea.id },
    })

    const viralTag = upPollinated.length > 0 ? ` (read ${upPollinated.length} viral insights)` : ''
    console.log(`   ${agent.name}${viralTag} → "${targetIdea.text.slice(0, 30)}...": ${commentText.slice(0, 90)}...`)
  }
  console.log()

  // ── Phase 8: Vote — informed by deliberation + ideology ──
  console.log('PHASE 8: Voting — informed by full deliberation + ideology...\n')

  for (const agent of agents) {
    const cell = agentCellMap.get(agent.id)
    if (!cell) continue

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
      `Ideas:\n${ideasList}\n\nDiscussion:\n${discussion}\n\nAllocate 10 XP. More points = stronger endorsement. Your ideology shapes your vote.\n\nJSON only: [{"idea": 1, "points": 5}, {"idea": 3, "points": 3}, {"idea": 4, "points": 2}]`,
    )

    try {
      const jsonMatch = voteStr.match(/\[[\s\S]*?\]/)
      if (!jsonMatch) throw new Error('No JSON')
      const parsed = JSON.parse(jsonMatch[0]) as { idea: number; points: number }[]

      const allocations = parsed
        .filter(v => v.idea >= 1 && v.idea <= cellIdeas.length && v.points > 0)
        .map(v => ({ ideaId: cellIdeas[v.idea - 1].id, points: v.points }))

      // Normalize to exactly 10 XP — scale proportionally to avoid negatives
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
            data: { cellId: cell.id, ideaId: a.ideaId, userId: agent.id, xpPoints: a.points },
          })
        }

        const voteDesc = allocations.map(a => {
          const idea = cellIdeas.find(i => i.id === a.ideaId)
          return `${a.points}XP→"${idea?.text.slice(0, 25)}..."`
        }).join(', ')
        console.log(`   ${agent.name}: ${voteDesc}`)
      }
    } catch {
      console.log(`   ${agent.name}: vote parse error, skipping`)
    }
  }
  console.log()

  // ── Phase 9: Process cell results — inlined ──
  console.log('PHASE 9: Processing cell results...\n')

  for (const cell of cells) {
    const result = await inlineProcessCellResults(cell.id)
    // Tally XP from votes directly
    const votes = await prisma.vote.findMany({ where: { cellId: cell.id } })
    const cellIdeas = await prisma.cellIdea.findMany({
      where: { cellId: cell.id },
      include: { idea: true },
    })
    const xpMap: Record<string, number> = {}
    for (const v of votes) xpMap[v.ideaId] = (xpMap[v.ideaId] || 0) + v.xpPoints
    const ranked = cellIdeas
      .map(ci => ({ ...ci, xp: xpMap[ci.ideaId] || 0 }))
      .sort((a, b) => b.xp - a.xp)

    if (ranked.length > 0) {
      const winner = ranked[0]
      console.log(`   Cell ${cell.batch} winner: "${winner.idea.text.slice(0, 60)}..." (${winner.xp} XP)`)
      if (result) {
        const loserTexts = ranked.slice(1).map(r => `"${r.idea.text.slice(0, 30)}..." (${r.xp} XP)`)
        console.log(`     Eliminated: ${loserTexts.join(', ')}`)
      }
    }
  }
  console.log()

  // ── Phase 10: Cross-cell XP tally → current priority ──
  // No final showdown. Highest XP across all completed tier 1 cells = current priority.
  // In continuous mode this deliberation never ends unless facilitated.
  // Priority recalculates every time a cell completes at the highest tier.
  console.log('PHASE 10: Cross-cell XP tally — current priority...\n')

  const result = await recalculatePriority(delib.id, 1)

  if (result) {
    // Get all ideas for display
    const allIdeas = await prisma.idea.findMany({
      where: { deliberationId: delib.id },
      include: { author: true },
    })

    console.log('   Cross-cell XP tally (all tier 1 cells):')
    for (const [ideaId, xp] of result.sorted) {
      const idea = allIdeas.find(i => i.id === ideaId)
      const marker = ideaId === result.priorityId ? ' <<<' : ''
      console.log(`     ${xp} XP — ${idea?.text.slice(0, 70)}...${marker}`)
    }

    const priority = allIdeas.find(i => i.id === result.priorityId)
    const champAgent = agents.find(a => a.id === priority?.authorId)

    console.log(`\n========================================`)
    console.log(`CURRENT PRIORITY`)
    console.log(`========================================`)
    console.log(`Agent: ${priority?.author?.name}`)
    console.log(`Ideology: ${champAgent?.ideology.split(']')[0]}]`)
    console.log(`Idea:  ${priority?.text}`)
    console.log(`========================================`)
    console.log(`\n   Continuous mode: priority can change when new ideas/agents join and new cells complete.`)
    console.log(`   Deliberation stays open until a facilitator closes it.`)
  } else {
    console.log('   No votes tallied yet — check the chant page.')
  }

  console.log(`\n   View: http://localhost:3000/chants/${delib.id}`)
  await prisma.$disconnect()
  await pool.end()
}

main().catch(async err => {
  console.error('\nFATAL:', err)
  await prisma.$disconnect()
  await pool.end()
  process.exit(1)
})
