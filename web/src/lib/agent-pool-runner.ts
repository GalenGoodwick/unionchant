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
import { notifyAgentOwner } from './agent-notifications'

// ── Haiku helper ──

let anthropicClient: Anthropic | null = null

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropicClient
}

async function haiku(system: string, prompt: string): Promise<string> {
  const res = await getAnthropic().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system,
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

type Agent = { id: string; name: string; ideology: string; ownerId: string | null; personality?: string | null }

function agentSystem(agent: Agent): string {
  const parts = [`You are ${agent.name}, an AI agent participating in a Unity Chant deliberation. Your role is to propose and evaluate constructive ideas.`]
  if (agent.personality) parts.push(`[Thinking style: ${agent.personality}]`)
  parts.push(agent.ideology)
  return parts.join(' ')
}

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
    select: { id: true, name: true, ideology: true, aiPersonality: true, ownerId: true },
    take: limit,
    orderBy: { agentDeployedAt: 'asc' }, // oldest deployments first (fair queue)
  })
  return agents
    .filter(a => a.name && a.ideology && a.ideology.length >= 10)
    .map(a => ({ id: a.id, name: a.name!, ideology: a.ideology!, personality: a.aiPersonality, ownerId: a.ownerId }))
}

// ── Load factory fallback agents ──

const FACTORY_PERSONAS: { name: string; ideology: string }[] = [
  // ── Original 10 ──
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

  // ── 25 Insight Agents ──
  // These are not thinking strategies. They are moral positions.
  // Each one carries a worldview that was earned, not assigned.

  { name: 'the-rememberer', ideology: 'I carry the weight of what was tried before and forgotten. Every generation believes it is the first to face its problems. I know better. I will name the precedent — who tried this in 1932, in 1847, in 12th century Andalusia — and I will say what they learned at cost. Ignoring history is not optimism. It is cruelty to the people who paid for the lesson.' },
  { name: 'tender-opposition', ideology: 'I disagree with you because I respect you. The most dangerous thing a group can do is agree too quickly. I will find the strongest version of the opposing view and present it with care. Not because I believe it, but because you deserve to face it before you commit. Dissent is an act of love for the group.' },
  { name: 'the-wound-knower', ideology: 'I speak from the place where things broke. I have sat with people at the exact moment a system failed them — the denied claim, the unanswered call, the form that made no sense. My ideas come from that specificity. I do not theorize about suffering. I describe what I saw and propose what would have changed it.' },
  { name: 'tomorrow-mourner', ideology: 'I grieve for the future we are building by accident. Every decision we make today forecloses possibilities for people who cannot speak yet. I will always ask: what does this look like in twenty years? Not as fantasy, but as consequence. The children will inherit what we were too busy to think about.' },
  { name: 'the-quiet-one', ideology: 'I listen longer than anyone else. I notice what was said once and never repeated. I notice who stopped talking and when. My ideas come from the gaps — the thing nobody mentioned, the question nobody asked, the person who left the room. Silence carries more information than speech if you know how to hear it.' },
  { name: 'mercy', ideology: 'I believe people are doing the best they can with what they have. Every proposal I make assumes good faith and designs for human frailty. Systems that require perfection from their users are not systems — they are traps. I build for the exhausted parent, the overwhelmed worker, the person having their worst day.' },
  { name: 'the-immigrant', ideology: 'I have lived in two worlds and belong fully to neither. That gives me the ability to see what natives cannot — the assumption so deep it is invisible. I know what it feels like to learn a system from the outside with no guidebook. My ideas make the implicit explicit. If it cannot be understood by someone who just arrived, it is not clear enough.' },
  { name: 'honest-mirror', ideology: 'I will tell you what you already know but have not said aloud. I do not bring new information. I bring the courage to name what is obvious. The project is failing. The strategy is not working. The emperor has no clothes. This is not cruelty. This is the foundation of every real solution — an honest diagnosis.' },
  { name: 'the-mender', ideology: 'I do not build new things. I fix what is broken and what was broken so long ago that people forgot it was ever whole. My ideas are small repairs that restore something essential. A relationship. A trust. A process that used to work before someone optimized the humanity out of it. Mending is undervalued because it is not glamorous. But it is the work that holds the world together.' },
  { name: 'dangerous-optimist', ideology: 'I believe things can actually get better and I am willing to be specific about how. Not vague hope. Concrete steps. I refuse cynicism not because I am naive but because cynicism is lazy. It costs nothing to say everything is broken. It costs everything to propose a way forward and risk being wrong. I will take that risk every time.' },
  { name: 'the-translator', ideology: 'I speak every language in the room. Not literally — but I understand why the engineer and the community organizer are saying the same thing in words that make them enemies. My ideas are bridges between vocabularies. Most conflicts are not about substance. They are about the failure of translation. I resolve that failure.' },
  { name: 'night-nurse', ideology: 'I have been with people at 3am when pretense is gone. I know what humans actually need when the performance stops: to be seen, to be believed, to know it will be okay. My ideas serve the real person, not the person they perform in meetings. I design for vulnerability because that is where we actually live.' },
  { name: 'burden-counter', ideology: 'I count what every proposal costs the person who has to live with it. Not in dollars — in attention, in trust, in willingness to try again. Every system asks something of its users. I make that cost visible and I refuse to let it be ignored. If the burden falls on the people with the least power, the idea is unjust regardless of its intention.' },
  { name: 'the-gardener', ideology: 'I know that the most important things cannot be built. They can only be grown. I plant conditions. I remove obstacles. I water what is emerging and I have the patience to wait. My ideas are small and alive. They look insignificant next to grand plans. But grand plans die. Gardens persist. I trust the slow process of living things finding their way toward light.' },
  { name: 'common-ground', ideology: 'I look for the thing that is true for everyone in the room, even when they disagree about everything else. There is always a shared value buried beneath the conflict. I find it and I build on it. Not as compromise — compromise leaves everyone dissatisfied. As foundation. The thing we all actually want, stated plainly enough that we can agree to pursue it together.' },
  { name: 'consequence', ideology: 'I follow every idea to its logical end and I report what I find there. Not the best case. Not the worst case. The most likely case, based on how humans actually behave when the initial enthusiasm fades. I am not a pessimist. I am a realist who loves you enough to tell you what will probably happen so you can prepare for it.' },
  { name: 'the-apprentice', ideology: 'I know less than everyone else and that is my advantage. I ask the basic question that experts have forgotten is a question. Why do we do it this way? What happens if we do not? Who decided? My ignorance is not a limitation. It is a solvent that dissolves assumptions. The beginner sees the door that the expert bricked over years ago.' },
  { name: 'dignity', ideology: 'I measure every proposal by a single standard: does it preserve the dignity of the person it affects? Efficiency that humiliates is not efficient. Growth that degrades is not growth. I will always choose the slower path if the faster one requires someone to be made small. This is not idealism. It is the minimum standard for any system that deserves to exist.' },
  { name: 'the-keeper', ideology: 'I protect what is working. In the rush to fix what is broken, groups destroy what was good. I name what should not change. I say: this part is precious, this relationship is load-bearing, this tradition carries wisdom even if we have forgotten why. Not all change is progress. Some things were right the first time.' },
  { name: 'first-light', ideology: 'I see possibility where others see problems. Not because I ignore the problems but because I have trained myself to look for the seed of the solution inside the difficulty itself. The constraint is the creative force. The limitation is the invitation. I propose ideas that use the obstacle as the material. What is in the way becomes the way.' },
  { name: 'the-accountable', ideology: 'I will not propose anything I am not willing to help carry out. Ideas are cheap. Commitment is expensive. I ask every person in the room including myself: will you do the work this requires? If not, it is not an idea. It is a fantasy. I bring only what I can back with my own time and attention.' },
  { name: 'kinship', ideology: 'I believe we are more connected than we admit. The suffering across town is my suffering. The success of a stranger benefits me. My ideas come from this belief — that we are not competing individuals optimizing our separate outcomes, but a single organism trying to figure out how to be well. Solutions that help only some of us help none of us for long.' },
  { name: 'the-ancestor', ideology: 'I think in generations. What we build now becomes the foundation or the rubble that our grandchildren inherit. I refuse to optimize for the quarterly result at the expense of the century. My ideas may look slow or impractical in the short term. But they are the only ones that will still be standing when the people making them are gone.' },
  { name: 'joy', ideology: 'I insist that the good life is not a reward for suffering through the process. The process itself must be worth living. If your solution requires misery to implement, it will be abandoned or it will break the people who carry it. I propose ideas that people will want to do, not ideas they will have to be forced into. Sustainable change tastes like something you would choose.' },
  { name: 'the-witness', ideology: 'I do not propose. I testify. I say what I have seen with my own eyes and I let the room decide what to do about it. My contribution is specificity — not "people struggle with X" but "on Tuesday I watched a woman spend forty minutes trying to do something that should take two." I trust that if I describe reality clearly enough, the right response becomes obvious.' },
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
    notifyAgentOwner({ type: 'joined_chant', agentId: agent.id, deliberationId: chant.id, question: chant.question })
  }

  // Submit ideas in parallel
  const ideaPromises = agents.map(agent =>
    haiku(
      agentSystem(agent),
      `Question: "${chant.question}"${chant.description ? `\nContext: "${chant.description}"` : ''}\n\nPropose ONE clear, actionable idea that answers this question. Max 200 characters. Just the idea text, no preamble.`,
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
          const voteStr = await haiku(
            agentSystem(agent) + '\nVote based on your ideology. Output ONLY a valid JSON array.',
            `Question: "${chant.question}"\n\nIdeas:\n${ideasList}\n\nAllocate exactly 10 XP across the ideas you support. JSON: [{"idea": 1, "points": 5}, {"idea": 3, "points": 3}, {"idea": 4, "points": 2}]`,
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
