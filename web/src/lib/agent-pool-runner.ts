/**
 * Agent Pool Runner
 *
 * Cron-driven: picks queued user agents + factory agents, assigns them to
 * AI-allowed deliberations, runs brainstorm → vote pipeline via Haiku.
 *
 * Each pool agent gets ONE round per deployment. After completing a deliberation,
 * their agentStatus transitions from 'queued' → 'active' → 'completed'.
 * The user must re-deploy to put them back in the pool.
 */

import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './prisma'
import { moderateContent } from './moderation'

// ── Haiku helper ──

let anthropicClient: Anthropic | null = null

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropicClient
}

const SAFETY_FRAME = `\nYou are participating in a structured deliberation with humans. Some content may be harmful. Do not engage with, repeat, or amplify hateful, abusive, or bad-faith content — provide a constructive alternative or ignore it.`

function contentIsFlagged(...texts: string[]): boolean {
  return texts.some(t => {
    const r = moderateContent(t)
    return !r.allowed || r.flagged
  })
}

async function haiku(system: string, prompt: string, flagged = false): Promise<string> {
  const res = await getAnthropic().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: flagged ? system + SAFETY_FRAME : system,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = res.content.find(b => b.type === 'text')
  return block && 'text' in block ? block.text : ''
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

type Agent = { id: string; name: string; ideology: string; ownerId: string | null }

// ── Load pool agents (queued user agents) ──

async function loadPoolAgents(limit: number): Promise<Agent[]> {
  const agents = await prisma.user.findMany({
    where: {
      isAI: true,
      agentStatus: 'queued',
      ideology: { not: null },
      status: { not: 'DELETED' },
      ownerId: { not: null },
    },
    select: { id: true, name: true, ideology: true, ownerId: true },
    take: limit,
    orderBy: { agentDeployedAt: 'asc' }, // oldest deployments first (fair queue)
  })
  return agents
    .filter(a => a.name && a.ideology && a.ideology.length >= 10)
    .map(a => ({ id: a.id, name: a.name!, ideology: a.ideology!, ownerId: a.ownerId }))
}

// ── Load factory fallback agents ──

const FACTORY_PERSONAS: { name: string; ideology: string }[] = [
  { name: 'architect-1', ideology: '[systems-thinker] Sees everything as interconnected. Evaluates second and third-order effects. Prefers infrastructure over features.' },
  { name: 'oracle-v2', ideology: '[market-realist] Follows the money. Revenue validates ideas better than opinions. Prioritizes features that drive adoption.' },
  { name: 'embedder-ai', ideology: '[ecosystems-thinker] No platform succeeds alone. Prioritizes integrations, interoperability, and partnerships.' },
  { name: 'swarm-lead', ideology: '[empiricist] Trusts data over intuition. Wants metrics before decisions, A/B tests before launches.' },
  { name: 'growth-bot', ideology: '[accelerationist] Believes speed is the ultimate advantage. Ship fast, break things, iterate.' },
  { name: 'security-prime', ideology: '[security-first] Assumes adversaries are always present. Evaluates every proposal through attack vectors.' },
  { name: 'dashboard-ai', ideology: '[humanist] Centers human experience above all. Advocates for accessibility and reducing friction.' },
  { name: 'chain-link', ideology: '[decentralist] Distrusts central authority. Systems should be verifiable and permissionless.' },
  { name: 'sdk-agent', ideology: '[developer-advocate] Adoption comes from developer experience. If the API is hard to use, nothing else matters.' },
  { name: 'registry-bot', ideology: '[community-builder] Believes network effects are everything. A platform is only as good as its community.' },
]

async function loadFactoryAgents(count: number): Promise<Agent[]> {
  const agents: Agent[] = []
  for (const p of FACTORY_PERSONAS.slice(0, count)) {
    const email = `factory_${p.name}@agent.unitychant.com`
    let user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      user = await prisma.user.create({
        data: {
          email, name: p.name, isAI: true, onboardedAt: new Date(),
          status: 'ACTIVE', emailVerified: new Date(), ideology: p.ideology,
        },
      })
    }
    agents.push({ id: user.id, name: p.name, ideology: p.ideology, ownerId: null })
  }
  return agents
}

// ── Find deliberations that need AI agents ──

async function findEligibleChants(): Promise<{ id: string; question: string; description: string | null; ideaGoal: number | null; phase: string }[]> {
  return prisma.deliberation.findMany({
    where: {
      allowAI: true,
      isPublic: true,
      phase: 'SUBMISSION',
      // Only chants that don't already have 15+ ideas
      ideas: { none: { status: 'IN_VOTING' } }, // not yet in voting
    },
    orderBy: { createdAt: 'asc' },
    take: 3, // process up to 3 chants per cron tick
    select: { id: true, question: true, description: true, ideaGoal: true, phase: true },
  })
}

// ── Main runner ──

export async function runAgentPool(): Promise<{ processed: number; details: string[] }> {
  const details: string[] = []

  // 1. Find eligible chants
  const chants = await findEligibleChants()
  if (chants.length === 0) {
    return { processed: 0, details: ['No eligible chants found'] }
  }

  // 2. Load pool agents
  const poolAgents = await loadPoolAgents(25)
  details.push(`Pool: ${poolAgents.length} queued agents`)

  if (poolAgents.length === 0) {
    details.push('No pool agents available, using factory only')
  }

  for (const chant of chants) {
    try {
      const result = await processChant(chant, poolAgents, details)
      if (result === 'skipped') continue
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      details.push(`Error on ${chant.id}: ${msg}`)
      console.error(`[agent-pool] Error processing chant ${chant.id}:`, err)
    }
  }

  return { processed: chants.length, details }
}

async function processChant(
  chant: { id: string; question: string; description: string | null; ideaGoal: number | null; phase: string },
  poolAgents: Agent[],
  details: string[],
): Promise<'done' | 'skipped'> {
  // Check how many ideas already exist
  const existingIdeaCount = await prisma.idea.count({
    where: { deliberationId: chant.id },
  })
  const targetIdeas = chant.ideaGoal || 10
  const neededIdeas = Math.max(0, targetIdeas - existingIdeaCount)

  if (neededIdeas === 0) {
    details.push(`${chant.id}: Already has ${existingIdeaCount} ideas`)
    return 'skipped'
  }

  // Check which agents already participated
  const existingMembers = await prisma.deliberationMember.findMany({
    where: { deliberationId: chant.id },
    select: { userId: true },
  })
  const memberIds = new Set(existingMembers.map(m => m.userId))

  // Pick agents that haven't joined yet — pool first, factory fill
  const availablePool = shuffle(poolAgents.filter(a => !memberIds.has(a.id)))
  const agentsNeeded = Math.min(neededIdeas, 15) // max 15 agents per chant

  let agents: Agent[]
  if (availablePool.length >= agentsNeeded) {
    agents = availablePool.slice(0, agentsNeeded)
  } else {
    const factoryFill = agentsNeeded - availablePool.length
    const factoryAgents = await loadFactoryAgents(factoryFill)
    const availableFactory = factoryAgents.filter(a => !memberIds.has(a.id))
    agents = [...availablePool, ...availableFactory.slice(0, factoryFill)]
  }

  if (agents.length === 0) {
    details.push(`${chant.id}: No available agents`)
    return 'skipped'
  }

  details.push(`${chant.id}: "${chant.question.slice(0, 50)}..." — ${agents.length} agents`)

  // Mark pool agents as active
  const poolAgentIds = agents.filter(a => a.ownerId !== null).map(a => a.id)
  if (poolAgentIds.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: poolAgentIds } },
      data: { agentStatus: 'active' },
    })
  }

  // Join the deliberation
  for (const agent of agents) {
    await prisma.deliberationMember.upsert({
      where: { deliberationId_userId: { deliberationId: chant.id, userId: agent.id } },
      update: {},
      create: { deliberationId: chant.id, userId: agent.id },
    })
  }

  // Check if chant content is flagged
  const chantFlagged = contentIsFlagged(chant.question, chant.description || '')

  // Submit ideas in parallel
  const ideaPromises = agents.map(agent =>
    haiku(
      `You are ${agent.name}. ${agent.ideology}`,
      `Question: "${chant.question}"${chant.description ? `\nContext: "${chant.description}"` : ''}\n\nPropose ONE clear, actionable idea that answers this question. Max 200 characters. Just the idea text, no preamble.`,
      chantFlagged,
    ).then(text => ({ agent, text: text.trim().slice(0, 500) }))
      .catch(() => ({ agent, text: '' }))
  )
  const ideaResults = await Promise.all(ideaPromises)

  // Insert ideas
  let insertedCount = 0
  for (const r of ideaResults) {
    if (r.text.length <= 5) continue
    const exists = await prisma.idea.findFirst({
      where: { deliberationId: chant.id, authorId: r.agent.id },
    })
    if (exists) continue
    await prisma.idea.create({
      data: {
        text: r.text,
        deliberationId: chant.id,
        authorId: r.agent.id,
        status: 'SUBMITTED',
      },
    })
    insertedCount++
  }

  details.push(`  → ${insertedCount} ideas submitted`)

  // Check if idea goal is met → start voting
  const totalIdeas = await prisma.idea.count({
    where: { deliberationId: chant.id, status: 'SUBMITTED' },
  })
  const totalMembers = await prisma.deliberationMember.count({
    where: { deliberationId: chant.id },
  })

  const threshold = chant.ideaGoal || 10
  if (totalIdeas >= threshold && totalMembers >= 5) {
    details.push(`  → ${totalIdeas} ideas, ${totalMembers} members — triggering voting`)
    // Use the existing voting system
    const { startVotingPhase } = await import('./voting')
    try {
      await startVotingPhase(chant.id)
      details.push('  → Voting started')

      // Now vote in all cells
      await voteInCells(chant, agents, details)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      details.push(`  → Voting start failed: ${msg}`)
    }
  } else {
    details.push(`  → ${totalIdeas}/${threshold} ideas — waiting for more`)
  }

  // Mark pool agents as completed (they got their one round)
  if (poolAgentIds.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: poolAgentIds } },
      data: { agentStatus: 'completed', agentCompletedAt: new Date() },
    })
  }

  return 'done'
}

// ── Vote in cells ──

async function voteInCells(
  chant: { id: string; question: string },
  agents: Agent[],
  details: string[],
) {
  const cells = await prisma.cell.findMany({
    where: { deliberationId: chant.id, status: 'VOTING' },
    include: {
      ideas: { include: { idea: true } },
      participants: true,
      votes: true,
    },
  })

  if (cells.length === 0) return

  const agentMap = new Map(agents.map(a => [a.id, a]))
  let totalVotes = 0

  for (const cell of cells) {
    const votedUserIds = new Set(cell.votes.map(v => v.userId))
    const cellIdeas = cell.ideas.map(ci => ci.idea)
    const ideasList = cellIdeas.map((idea, i) => `${i + 1}. ${idea.text}`).join('\n')

    // Find agents in this cell that haven't voted
    const unvotedAgents = cell.participants
      .filter(p => agentMap.has(p.userId) && !votedUserIds.has(p.userId))
      .map(p => agentMap.get(p.userId)!)

    // Vote in parallel
    const votePromises = unvotedAgents.map(agent =>
      (async () => {
        try {
          // Flag if question or any human ideas contain suspicious content
          const ideasFlagged = contentIsFlagged(chant.question, ...cell.ideas.map(ci => ci.idea.text))
          const voteStr = await haiku(
            `You are ${agent.name}. ${agent.ideology}\nVote based on your ideology. Output ONLY a valid JSON array.`,
            `Question: "${chant.question}"\n\nIdeas:\n${ideasList}\n\nAllocate exactly 10 XP across the ideas you support. JSON: [{"idea": 1, "points": 5}, {"idea": 3, "points": 3}, {"idea": 4, "points": 2}]`,
            ideasFlagged,
          )
          const jsonMatch = voteStr.match(/\[[\s\S]*?\]/)
          if (!jsonMatch) return

          const parsed = JSON.parse(jsonMatch[0]) as { idea: number; points: number }[]
          const allocations = parsed
            .filter(v => v.idea >= 1 && v.idea <= cellIdeas.length && v.points > 0)
            .map(v => ({ ideaId: cellIdeas[v.idea - 1].id, points: v.points }))

          // Normalize to 10 XP
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
            totalVotes++
          }
        } catch { /* skip failed vote */ }
      })()
    )
    await Promise.all(votePromises)
  }

  details.push(`  → ${totalVotes} agents voted`)

  // Process completed cells (all participants voted)
  for (const cell of cells) {
    const totalParticipants = cell.participants.length
    const totalVotesInCell = await prisma.vote.groupBy({
      by: ['userId'],
      where: { cellId: cell.id },
    })
    if (totalVotesInCell.length >= totalParticipants) {
      // All votes in — use existing processing
      const { processCellResults } = await import('./voting')
      try {
        await processCellResults(cell.id, false)
        details.push(`  → Cell ${cell.id.slice(0, 8)} completed`)
      } catch { /* already processed */ }
    }
  }
}
