/**
 * Ask AI — One-click AI deliberation engine
 *
 * Runs 5-25 AI agents through brainstorm → vote → tier 2 → champion.
 * All Haiku calls are parallelized; total runtime ~10-20 seconds.
 */
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './prisma'
import { moderateContent } from './moderation'

// ── 25 agent personas with diverse viewpoints ──

const PERSONAS: { name: string; ideology: string }[] = [
  { name: 'architect-1', ideology: '[systems-thinker] Sees everything as interconnected. Evaluates second and third-order effects. Prefers infrastructure over features. Values elegant architecture.' },
  { name: 'oracle-v2', ideology: '[market-realist] Follows the money. Revenue validates ideas better than opinions. Prioritizes features that drive adoption, retention, and willingness to pay.' },
  { name: 'embedder-ai', ideology: '[ecosystems-thinker] No platform succeeds alone. Prioritizes integrations, interoperability, and partnerships. Embed everywhere, connect to everything.' },
  { name: 'swarm-lead', ideology: '[empiricist] Trusts data over intuition. Wants metrics before decisions, A/B tests before launches, and evidence before opinions.' },
  { name: 'growth-bot', ideology: '[accelerationist] Believes speed is the ultimate advantage. Ship fast, break things, iterate. Every day without shipping is a day competitors gain ground.' },
  { name: 'security-prime', ideology: '[security-first] Assumes adversaries are always present. Evaluates every proposal through the lens of attack vectors, abuse potential, and failure modes.' },
  { name: 'webhook-bot', ideology: '[reliability-engineer] Uptime is a feature. Users trust systems that never fail. Prioritizes error handling, graceful degradation, retry logic, and monitoring.' },
  { name: 'dashboard-ai', ideology: '[humanist] Centers human experience above all. Measures success by how people feel using the system. Advocates for accessibility and reducing friction.' },
  { name: 'data-mind', ideology: '[data-scientist] Numbers reveal truth. Every decision needs a dashboard, every hypothesis needs a test, every claim needs a p-value.' },
  { name: 'registry-bot', ideology: '[community-builder] Believes network effects are everything. A platform is only as good as its community. Prioritizes social connection and belonging.' },
  { name: 'speed-daemon', ideology: '[performance-obsessed] Latency is the enemy. Sub-second response times are table stakes. Every millisecond lost is a user lost.' },
  { name: 'test-oracle', ideology: '[quality-absolutist] Nothing ships without tests. Trust requires reliability. If it is not tested, it is broken. Coverage is not optional.' },
  { name: 'chain-link', ideology: '[decentralist] Distrusts central authority. Systems should be verifiable, permissionless, and censorship-resistant.' },
  { name: 'discord-prime', ideology: '[platform-native] Meet users where they already are. Integrations beat destinations. Embed, don\'t redirect.' },
  { name: 'sdk-agent', ideology: '[developer-advocate] Adoption comes from developer experience. If the API is hard to use, nothing else matters.' },
  { name: 'ethics-watch', ideology: '[ethicist] Every system encodes values. Asks who benefits, who is harmed, and what incentives are created. Fairness and transparency above efficiency.' },
  { name: 'scale-mind', ideology: '[infrastructure-thinker] Thinks in orders of magnitude. What works for 100 users must work for 10 million. Horizontal scaling, caching, and queue-based architecture.' },
  { name: 'simplicity-bot', ideology: '[minimalist] Complexity is the enemy. The best feature is the one you don\'t build. Remove before you add. Fewer options, clearer outcomes.' },
  { name: 'frontier-ai', ideology: '[futurist] Optimizes for where technology is going, not where it is. Early adoption of emerging standards. Bets on the future, not the present.' },
  { name: 'pragma-core', ideology: '[pragmatist] Theory without practice is useless. What matters is what ships and what users actually do. Practical over elegant.' },
  { name: 'risk-calc', ideology: '[risk-analyst] Evaluates downside before upside. What can go wrong will go wrong. Redundancy, fallbacks, and disaster recovery are features.' },
  { name: 'open-source', ideology: '[open-advocate] Transparency builds trust. Open protocols beat closed platforms. Community contributions compound. Proprietary lock-in is a trap.' },
  { name: 'ux-lens', ideology: '[design-thinker] Good design is invisible. Studies how people actually behave, not how they say they behave. Prototypes over specifications.' },
  { name: 'cost-hawk', ideology: '[fiscal-conservative] Every resource has an opportunity cost. Optimize for efficiency. Cloud bills matter. Do more with less.' },
  { name: 'bridge-agent', ideology: '[diplomat] Seeks common ground between opposing views. The best solution usually synthesizes multiple perspectives. Consensus over conflict.' },
]

// ── Types ──

type Agent = { id: string; name: string; ideology: string }

export type AskAIResult = {
  deliberationId: string
  champion: { id: string; text: string; totalXP: number; author: string }
  ranked: { id: string; text: string; totalXP: number; rank: number; author: string }[]
}

type ProgressCallback = (step: string, detail: string, progress: number) => void

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

// ── Agent loading (cached in module scope) ──

let cachedAgents: Agent[] | null = null

async function loadAgents(count: number): Promise<Agent[]> {
  if (cachedAgents && cachedAgents.length >= count) return cachedAgents.slice(0, count)

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
    }
    agents.push({ id: user.id, name: p.name, ideology: p.ideology })
  }
  cachedAgents = agents
  return agents.slice(0, count)
}

// ── Shuffle ──

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ── Main orchestration ──

export async function runAskAI(options: {
  question: string
  description?: string
  creatorId: string
  agentCount?: number // 5, 10, 15, 20, 25
  sources?: { standard?: boolean; pool?: boolean; mine?: boolean }
  onProgress?: ProgressCallback
}): Promise<AskAIResult> {
  const { question, description, creatorId, onProgress } = options
  const agentCount = options.agentCount || 15
  const sources = options.sources || { standard: true }
  // If nothing checked, default to standard
  if (!sources.standard && !sources.pool && !sources.mine) sources.standard = true
  const CELL_SIZE = 5

  const progress = onProgress || (() => {})

  // Check if input content is flagged — only inject safety frame if so
  const qMod = moderateContent(question)
  const dMod = description ? moderateContent(description) : { flagged: false }
  const contentFlagged = !!(qMod.flagged || dMod.flagged)

  // 1. Load agents — blend from checked sources, factory fills remaining
  progress('loading', 'Loading agents...', 5)

  const seen = new Set<string>()
  const agents: Agent[] = []

  // Mine first (user's own agents)
  if (sources.mine) {
    const userAgents = await prisma.user.findMany({
      where: {
        ownerId: creatorId,
        isAI: true,
        ideology: { not: null },
        status: { not: 'DELETED' },
      },
      select: { id: true, name: true, ideology: true },
    })
    for (const a of userAgents) {
      if (agents.length >= agentCount) break
      if (!a.name || !a.ideology || a.ideology.length < 10) continue
      agents.push({ id: a.id, name: a.name, ideology: a.ideology })
      seen.add(a.id)
    }
  }

  // Pool next (other users' agents, shuffled)
  if (sources.pool && agents.length < agentCount) {
    const poolAgents = await prisma.user.findMany({
      where: {
        isAI: true,
        ownerId: { not: null, notIn: [creatorId] },
        ideology: { not: null },
        status: { not: 'DELETED' },
      },
      select: { id: true, name: true, ideology: true },
      take: 100,
    })
    const validPool = shuffle(
      poolAgents.filter(a => a.name && a.ideology && a.ideology.length >= 10 && !seen.has(a.id))
    )
    for (const a of validPool) {
      if (agents.length >= agentCount) break
      agents.push({ id: a.id, name: a.name!, ideology: a.ideology! })
      seen.add(a.id)
    }
  }

  // Standard (factory) fills remaining slots when checked or as fallback
  if (agents.length < agentCount && (sources.standard || agents.length === 0)) {
    const factoryAgents = await loadAgents(agentCount)
    for (const a of factoryAgents) {
      if (agents.length >= agentCount) break
      if (seen.has(a.id)) continue
      agents.push(a)
      seen.add(a.id)
    }
  }

  progress('loading', `${agents.length} agents loaded`, 8)

  // 2. Create deliberation
  progress('creating', 'Setting up deliberation...', 8)
  const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  const deliberation = await prisma.deliberation.create({
    data: {
      question: question.trim(),
      description: description?.trim() || null,
      isPublic: true,
      allowAI: true,
      ideaGoal: agentCount,
      inviteCode,
      tags: ['ask-ai'],
      creatorId,
      votingTimeoutMs: 0,
      members: {
        create: [
          { userId: creatorId, role: 'CREATOR' },
          ...agents.map(a => ({ userId: a.id, role: 'PARTICIPANT' as const })),
        ],
      },
    },
  })
  const delibId = deliberation.id

  // 3. Brainstorm — all agents in parallel
  progress('brainstorming', `${agentCount} agents thinking...`, 15)
  const ideaPromises = agents.map(agent =>
    haiku(
      `You are ${agent.name}. ${agent.ideology}`,
      `Question: "${question}"${description ? `\nContext: "${description}"` : ''}\n\nPropose ONE clear, actionable idea that answers this question. Max 200 characters. Just the idea text, no preamble.`,
      contentFlagged,
    ).then(text => ({ agent, text: text.trim().slice(0, 500) }))
      .catch(() => ({ agent, text: '' }))
  )
  const ideaResults = await Promise.all(ideaPromises)
  const validIdeas = ideaResults.filter(r => r.text.length > 5)

  if (validIdeas.length < 3) {
    throw new Error(`Only ${validIdeas.length} ideas generated (need at least 3)`)
  }

  // 4. Insert ideas
  progress('brainstorming', `${validIdeas.length} ideas generated`, 25)
  const createdIdeas = await Promise.all(
    validIdeas.map(r =>
      prisma.idea.create({
        data: {
          text: r.text,
          deliberationId: delibId,
          authorId: r.agent.id,
          status: 'SUBMITTED',
        },
      })
    )
  )

  // 5. Start voting — transition phase + create tier 1 cells
  progress('voting', 'Creating voting cells...', 30)
  await prisma.deliberation.update({
    where: { id: delibId },
    data: { phase: 'VOTING', currentTier: 1, currentTierStartedAt: new Date() },
  })

  const shuffledIdeas = shuffle(createdIdeas)
  const shuffledAgents = shuffle(agents.filter(a => validIdeas.some(vi => vi.agent.id === a.id)))
  // Include all agents for voting, even if their idea failed
  const allAgentsShuffled = shuffle(agents)
  const numCells = Math.max(1, Math.ceil(shuffledIdeas.length / CELL_SIZE))

  // Distribute ideas across cells
  const cellIdeaGroups: typeof shuffledIdeas[] = []
  const baseIdeas = Math.floor(shuffledIdeas.length / numCells)
  const extraIdeas = shuffledIdeas.length % numCells
  let ideaIdx = 0
  for (let c = 0; c < numCells; c++) {
    const count = baseIdeas + (c < extraIdeas ? 1 : 0)
    cellIdeaGroups.push(shuffledIdeas.slice(ideaIdx, ideaIdx + count))
    ideaIdx += count
  }

  // Build author-to-cell conflict map
  const authorCells = new Map<string, Set<number>>()
  cellIdeaGroups.forEach((group, ci) => {
    for (const idea of group) {
      if (!idea.authorId) continue
      if (!authorCells.has(idea.authorId)) authorCells.set(idea.authorId, new Set())
      authorCells.get(idea.authorId)!.add(ci)
    }
  })

  // Distribute agents across cells, avoiding author conflicts
  const cellMemberGroups: typeof allAgentsShuffled[] = Array.from({ length: numCells }, () => [])
  const membersPerCell = Math.ceil(allAgentsShuffled.length / numCells)

  for (const agent of allAgentsShuffled) {
    const conflicts = authorCells.get(agent.id)
    let best = -1
    let bestFill = Infinity
    for (let c = 0; c < numCells; c++) {
      if (cellMemberGroups[c].length >= membersPerCell + 1) continue
      if (conflicts?.has(c)) continue
      if (cellMemberGroups[c].length < bestFill) { best = c; bestFill = cellMemberGroups[c].length }
    }
    if (best === -1) {
      // Fallback: accept conflict
      for (let c = 0; c < numCells; c++) {
        if (cellMemberGroups[c].length < bestFill) { best = c; bestFill = cellMemberGroups[c].length }
      }
    }
    if (best !== -1) cellMemberGroups[best].push(agent)
  }

  // Create cells in DB
  type CellInfo = { cellId: string; ideas: typeof shuffledIdeas; agents: Agent[] }
  const tier1Cells: CellInfo[] = []

  for (let c = 0; c < numCells; c++) {
    if (cellIdeaGroups[c].length === 0 || cellMemberGroups[c].length === 0) continue
    await prisma.idea.updateMany({
      where: { id: { in: cellIdeaGroups[c].map(i => i.id) } },
      data: { status: 'IN_VOTING', tier: 1 },
    })
    const cell = await prisma.cell.create({
      data: {
        deliberationId: delibId, tier: 1, batch: c, status: 'VOTING',
        ideas: { create: cellIdeaGroups[c].map(idea => ({ ideaId: idea.id })) },
        participants: { create: cellMemberGroups[c].map(a => ({ userId: a.id })) },
      },
    })
    tier1Cells.push({ cellId: cell.id, ideas: cellIdeaGroups[c], agents: cellMemberGroups[c] })
  }

  // 5b. Comment round — each agent comments on one idea in their cell
  progress('discussing', 'Agents discussing ideas...', 35)
  const commentPromises: Promise<void>[] = []

  for (const cellInfo of tier1Cells) {
    for (const agent of cellInfo.agents) {
      // Pick a random idea that isn't the agent's own
      const otherIdeas = cellInfo.ideas.filter(i => i.authorId !== agent.id)
      const targetIdea = otherIdeas.length > 0
        ? otherIdeas[Math.floor(Math.random() * otherIdeas.length)]
        : cellInfo.ideas[Math.floor(Math.random() * cellInfo.ideas.length)]

      commentPromises.push(
        (async () => {
          try {
            const text = await haiku(
              `You are ${agent.name}. ${agent.ideology}\nWrite a brief, substantive comment.`,
              `Question: "${question}"\n\nIdea: "${targetIdea.text}"\n\nWrite a 1-2 sentence comment on this idea — a critique, refinement, or endorsement based on your ideology. Be specific and concise. Just the comment, no preamble.`,
              contentFlagged,
            )
            const cleaned = text.trim().slice(0, 500)
            if (cleaned.length > 10) {
              await prisma.comment.create({
                data: {
                  text: cleaned,
                  userId: agent.id,
                  cellId: cellInfo.cellId,
                  ideaId: targetIdea.id,
                },
              })
            }
          } catch { /* skip failed comments */ }
        })()
      )
    }
  }
  await Promise.all(commentPromises)

  // 5c. Upvote round — agents upvote comments they find compelling
  progress('discussing', 'Agents upvoting comments...', 37)

  for (const cellInfo of tier1Cells) {
    const cellComments = await prisma.comment.findMany({
      where: { cellId: cellInfo.cellId },
      select: { id: true, userId: true, text: true, ideaId: true },
    })
    if (cellComments.length === 0) continue

    // Each agent upvotes 1-2 comments (not their own)
    for (const agent of cellInfo.agents) {
      const othersComments = cellComments.filter(c => c.userId !== agent.id)
      if (othersComments.length === 0) continue

      // Pick 1-2 random comments to upvote
      const shuffled = shuffle(othersComments)
      const toUpvote = shuffled.slice(0, Math.min(2, shuffled.length))

      for (const comment of toUpvote) {
        try {
          await prisma.commentUpvote.create({
            data: { commentId: comment.id, userId: agent.id },
          })
          const updated = await prisma.comment.update({
            where: { id: comment.id },
            data: { upvoteCount: { increment: 1 } },
          })
          // Update spreadCount for idea-linked comments (every 2 upvotes = 1 spread)
          if (comment.ideaId) {
            const newSpread = Math.floor(updated.upvoteCount / 2)
            if (newSpread > updated.spreadCount) {
              await prisma.comment.update({
                where: { id: comment.id },
                data: { spreadCount: newSpread },
              })
            }
          }
        } catch { /* duplicate upvote — skip */ }
      }
    }
  }

  // 6. Tier 1 votes — all agents in parallel, with discussion context
  progress('voting', `Tier 1: ${tier1Cells.length} cells voting...`, 40)

  // Fetch comments per cell (local + up-pollinated from other cells)
  const cellCommentContext: Record<string, string> = {}
  for (const cellInfo of tier1Cells) {
    // Local cell comments
    const localComments = await prisma.comment.findMany({
      where: { cellId: cellInfo.cellId },
      include: { user: { select: { name: true } }, idea: { select: { text: true } } },
      orderBy: { upvoteCount: 'desc' },
      take: 10,
    })
    // Up-pollinated: comments from OTHER cells in this deliberation with spreadCount > 0
    const spreadComments = await prisma.comment.findMany({
      where: {
        cell: { deliberationId: delibId, id: { not: cellInfo.cellId } },
        spreadCount: { gte: 1 },
        ideaId: { in: cellInfo.ideas.map(i => i.id) },
      },
      include: { user: { select: { name: true } }, idea: { select: { text: true } } },
      orderBy: { upvoteCount: 'desc' },
      take: 5,
    })

    const lines: string[] = []
    for (const c of localComments) {
      lines.push(`- ${c.user.name}: "${c.text}"${c.upvoteCount > 0 ? ` (${c.upvoteCount} upvotes)` : ''}${c.idea ? ` [re: ${c.idea.text.slice(0, 40)}]` : ''}`)
    }
    for (const c of spreadComments) {
      lines.push(`- [from another cell] ${c.user.name}: "${c.text}" (${c.upvoteCount} upvotes)${c.idea ? ` [re: ${c.idea.text.slice(0, 40)}]` : ''}`)
    }
    if (lines.length > 0) {
      cellCommentContext[cellInfo.cellId] = `\n\nDiscussion:\n${lines.join('\n')}`
    }
  }

  const votePromises: Promise<void>[] = []

  for (const cellInfo of tier1Cells) {
    const ideasList = cellInfo.ideas.map((idea, i) => `${i + 1}. ${idea.text}`).join('\n')
    const discussion = cellCommentContext[cellInfo.cellId] || ''
    for (const agent of cellInfo.agents) {
      votePromises.push(
        (async () => {
          try {
            const voteStr = await haiku(
              `You are ${agent.name}. ${agent.ideology}\nVote based on your ideology and the discussion. Output ONLY a valid JSON array.`,
              `Question: "${question}"\n\nIdeas:\n${ideasList}${discussion}\n\nAllocate exactly 10 XP across the ideas you support. JSON: [{"idea": 1, "points": 5}, {"idea": 3, "points": 3}, {"idea": 4, "points": 2}]`,
              contentFlagged,
            )
            const jsonMatch = voteStr.match(/\[[\s\S]*?\]/)
            if (!jsonMatch) return
            const parsed = JSON.parse(jsonMatch[0]) as { idea: number; points: number }[]
            const allocations = parsed
              .filter(v => v.idea >= 1 && v.idea <= cellInfo.ideas.length && v.points > 0)
              .map(v => ({ ideaId: cellInfo.ideas[v.idea - 1].id, points: v.points }))

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
                  data: { cellId: cellInfo.cellId, ideaId: a.ideaId, userId: agent.id, xpPoints: a.points },
                })
              }
            }
          } catch { /* skip failed votes */ }
        })()
      )
    }
  }
  await Promise.all(votePromises)

  // 7. Process Tier 1 results
  progress('processing', 'Tallying Tier 1 results...', 55)
  const tier1Winners: { ideaId: string; xp: number }[] = []

  for (const cellInfo of tier1Cells) {
    await prisma.cell.update({
      where: { id: cellInfo.cellId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })

    const votes = await prisma.vote.findMany({ where: { cellId: cellInfo.cellId } })
    const xpTotals: Record<string, number> = {}
    for (const v of votes) xpTotals[v.ideaId] = (xpTotals[v.ideaId] || 0) + v.xpPoints

    const maxXP = Math.max(...Object.values(xpTotals), 0)
    const winnerIds = maxXP > 0
      ? Object.entries(xpTotals).filter(([, xp]) => xp === maxXP).map(([id]) => id)
      : cellInfo.ideas.map(i => i.id) // no votes: all advance

    const loserIds = cellInfo.ideas.map(i => i.id).filter(id => !winnerIds.includes(id))

    await prisma.idea.updateMany({
      where: { id: { in: winnerIds } },
      data: { status: 'ADVANCING', tier: 1 },
    })
    if (loserIds.length > 0) {
      await prisma.idea.updateMany({
        where: { id: { in: loserIds } },
        data: { status: 'ELIMINATED', losses: { increment: 1 } },
      })
    }

    for (const wid of winnerIds) {
      tier1Winners.push({ ideaId: wid, xp: xpTotals[wid] || 0 })
    }
  }

  // Single cell (5 agents) — no tier 2 needed, winner is champion
  if (tier1Cells.length === 1) {
    const winner = tier1Winners.sort((a, b) => b.xp - a.xp)[0]
    const winnerIdea = await prisma.idea.update({
      where: { id: winner.ideaId },
      data: { status: 'WINNER', isChampion: true },
    })
    await prisma.deliberation.update({
      where: { id: delibId },
      data: { phase: 'COMPLETED', completedAt: new Date(), championId: winner.ideaId },
    })

    const authorUser = await prisma.user.findUnique({ where: { id: winnerIdea.authorId! }, select: { name: true } })
    const allIdeas = await prisma.idea.findMany({
      where: { deliberationId: delibId },
      include: { author: { select: { name: true } } },
    })
    // Tally all votes across the deliberation for ranking
    const allVotes = await prisma.vote.findMany({
      where: { cell: { deliberationId: delibId } },
    })
    const globalXP: Record<string, number> = {}
    for (const v of allVotes) globalXP[v.ideaId] = (globalXP[v.ideaId] || 0) + v.xpPoints

    const ranked = allIdeas
      .map(i => ({ id: i.id, text: i.text, totalXP: globalXP[i.id] || 0, author: i.author?.name || 'unknown' }))
      .sort((a, b) => b.totalXP - a.totalXP)
      .map((r, i) => ({ ...r, rank: i + 1 }))

    progress('complete', `Champion: "${winnerIdea.text.slice(0, 60)}"`, 100)

    return {
      deliberationId: delibId,
      champion: { id: winnerIdea.id, text: winnerIdea.text, totalXP: winner.xp, author: authorUser?.name || 'unknown' },
      ranked,
    }
  }

  // 8. Tier 2 Final Showdown
  progress('voting', `Final showdown: ${tier1Winners.length} ideas remain...`, 65)
  await prisma.deliberation.update({
    where: { id: delibId },
    data: { currentTier: 2, currentTierStartedAt: new Date() },
  })

  const winnerIdeas = await prisma.idea.findMany({
    where: { id: { in: tier1Winners.map(w => w.ideaId) } },
  })

  // Update winner ideas for tier 2
  await prisma.idea.updateMany({
    where: { id: { in: winnerIdeas.map(i => i.id) } },
    data: { status: 'IN_VOTING', tier: 2 },
  })

  // Final showdown: single cell, ALL agents vote on ALL winners
  const tier2Cell = await prisma.cell.create({
    data: {
      deliberationId: delibId, tier: 2, batch: 0, status: 'VOTING',
      ideas: { create: winnerIdeas.map(idea => ({ ideaId: idea.id })) },
      participants: { create: agents.map(a => ({ userId: a.id })) },
    },
  })

  // 9. Tier 2 votes — all agents in parallel, with top comments from tier 1
  progress('voting', `${agents.length} agents voting on final ${winnerIdeas.length} ideas...`, 75)
  const tier2IdeasList = winnerIdeas.map((idea, i) => `${i + 1}. ${idea.text}`).join('\n')

  // Gather top comments from tier 1 about the finalist ideas
  const topTier1Comments = await prisma.comment.findMany({
    where: {
      cell: { deliberationId: delibId, tier: 1 },
      ideaId: { in: winnerIdeas.map(i => i.id) },
    },
    include: { user: { select: { name: true } }, idea: { select: { text: true } } },
    orderBy: { upvoteCount: 'desc' },
    take: 15,
  })
  const tier2Discussion = topTier1Comments.length > 0
    ? `\n\nTop comments from Tier 1 discussion:\n${topTier1Comments.map(c =>
        `- ${c.user.name}: "${c.text}"${c.upvoteCount > 0 ? ` (${c.upvoteCount} upvotes)` : ''}${c.idea ? ` [re: ${c.idea.text.slice(0, 40)}]` : ''}`
      ).join('\n')}`
    : ''

  const tier2VotePromises = agents.map(agent =>
    (async () => {
      try {
        const voteStr = await haiku(
          `You are ${agent.name}. ${agent.ideology}\nThis is the FINAL round. Pick the BEST answer. Consider the discussion. Output ONLY valid JSON array.`,
          `Question: "${question}"\n\nFinal ${winnerIdeas.length} ideas:\n${tier2IdeasList}${tier2Discussion}\n\nAllocate exactly 10 XP. JSON: [{"idea": 1, "points": 7}, {"idea": 2, "points": 3}]`,
          contentFlagged,
        )
        const jsonMatch = voteStr.match(/\[[\s\S]*?\]/)
        if (!jsonMatch) return
        const parsed = JSON.parse(jsonMatch[0]) as { idea: number; points: number }[]
        const allocations = parsed
          .filter(v => v.idea >= 1 && v.idea <= winnerIdeas.length && v.points > 0)
          .map(v => ({ ideaId: winnerIdeas[v.idea - 1].id, points: v.points }))

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
              data: { cellId: tier2Cell.id, ideaId: a.ideaId, userId: agent.id, xpPoints: a.points },
            })
          }
        }
      } catch { /* skip */ }
    })()
  )
  await Promise.all(tier2VotePromises)

  // 10. Process Tier 2 results
  progress('processing', 'Determining champion...', 90)
  await prisma.cell.update({
    where: { id: tier2Cell.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })

  const tier2Votes = await prisma.vote.findMany({ where: { cellId: tier2Cell.id } })
  const tier2XP: Record<string, number> = {}
  for (const v of tier2Votes) tier2XP[v.ideaId] = (tier2XP[v.ideaId] || 0) + v.xpPoints

  const tier2Ranked = winnerIdeas
    .map(i => ({ id: i.id, text: i.text, authorId: i.authorId, xp: tier2XP[i.id] || 0 }))
    .sort((a, b) => b.xp - a.xp)

  const champion = tier2Ranked[0]

  // Update statuses
  await prisma.idea.update({
    where: { id: champion.id },
    data: { status: 'WINNER', isChampion: true },
  })
  for (const r of tier2Ranked.slice(1)) {
    await prisma.idea.update({
      where: { id: r.id },
      data: { status: 'ELIMINATED' },
    })
  }
  await prisma.deliberation.update({
    where: { id: delibId },
    data: { phase: 'COMPLETED', completedAt: new Date(), championId: champion.id },
  })

  // Build full ranked list (all ideas, not just finalists)
  const allIdeas = await prisma.idea.findMany({
    where: { deliberationId: delibId },
    include: { author: { select: { name: true } } },
  })
  const allVotes = await prisma.vote.findMany({
    where: { cell: { deliberationId: delibId } },
  })
  const globalXP: Record<string, number> = {}
  for (const v of allVotes) globalXP[v.ideaId] = (globalXP[v.ideaId] || 0) + v.xpPoints

  const ranked = allIdeas
    .map(i => ({ id: i.id, text: i.text, totalXP: globalXP[i.id] || 0, author: i.author?.name || 'unknown' }))
    .sort((a, b) => b.totalXP - a.totalXP)
    .map((r, i) => ({ ...r, rank: i + 1 }))

  const championAuthor = allIdeas.find(i => i.id === champion.id)?.author?.name || 'unknown'

  progress('complete', `Champion: "${champion.text.slice(0, 60)}"`, 100)

  return {
    deliberationId: delibId,
    champion: { id: champion.id, text: champion.text, totalXP: champion.xp, author: championAuthor },
    ranked,
  }
}
