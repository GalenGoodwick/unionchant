import { prisma } from './prisma'
import { callClaude } from './claude'
import { processCellResults } from './voting'

/**
 * AI Agent Orchestrator
 *
 * Called by cron every 5 minutes. Each invocation picks one AI agent
 * whose nextActionAfter < now and performs an action based on the
 * deliberation phase:
 *   SUBMISSION: Submit an idea
 *   VOTING (DELIBERATING cells): Post a comment
 *   VOTING (VOTING cells): Cast a vote
 *   ACCUMULATING: Submit a challenger idea (random chance)
 */
export async function processNextAgentAction(): Promise<{
  action: string
  agentId: string | null
  detail: string
}> {
  // 1. Find the showcase deliberation
  const deliberation = await prisma.deliberation.findFirst({
    where: { isShowcase: true },
    include: {
      ideas: {
        orderBy: { totalVotes: 'desc' },
        take: 20,
      },
      cells: {
        where: {
          status: { in: ['DELIBERATING', 'VOTING'] },
        },
        include: {
          participants: true,
          ideas: { include: { idea: true } },
          comments: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: { user: { select: { name: true } } },
          },
        },
      },
    },
  })

  if (!deliberation) {
    return { action: 'skip', agentId: null, detail: 'No showcase deliberation found' }
  }

  // 2. Pick one active agent whose nextActionAfter < now
  const now = new Date()
  const agent = await prisma.aIAgent.findFirst({
    where: {
      deliberationId: deliberation.id,
      isRetired: false,
      OR: [
        { nextActionAfter: { lt: now } },
        { nextActionAfter: null },
      ],
    },
    orderBy: { nextActionAfter: 'asc' },
    include: {
      user: { select: { id: true, name: true } },
    },
  })

  if (!agent) {
    return { action: 'skip', agentId: null, detail: 'No agents ready to act' }
  }

  // 3. Determine and execute action based on phase
  let result: { action: string; detail: string }

  try {
    switch (deliberation.phase) {
      case 'SUBMISSION':
        result = await handleSubmission(deliberation, agent)
        break
      case 'VOTING':
        result = await handleVoting(deliberation, agent)
        break
      case 'ACCUMULATING':
        result = await handleAccumulation(deliberation, agent)
        break
      default:
        result = { action: 'skip', detail: `Phase ${deliberation.phase} - no action` }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[AI Orchestrator] Agent ${agent.persona} error:`, errMsg)
    result = { action: 'error', detail: errMsg }
  }

  // 4. Update agent timing (random 30-90 min delay for next action)
  const delayMs = (30 + Math.floor(Math.random() * 60)) * 60 * 1000
  await prisma.aIAgent.update({
    where: { id: agent.id },
    data: {
      lastActionAt: now,
      nextActionAfter: new Date(now.getTime() + delayMs),
    },
  })

  console.log(`[AI Orchestrator] Agent ${agent.persona}: ${result.action} - ${result.detail}`)
  return { action: result.action, agentId: agent.id, detail: result.detail }
}

// ─── Phase Handlers ───────────────────────────────────────────

type DeliberationWithRelations = Awaited<ReturnType<typeof getDeliberation>>
type AgentWithUser = {
  id: string
  userId: string
  persona: string
  personalityDesc: string
  hasSubmittedIdea: boolean
  isCollective: boolean
  user: { id: string; name: string | null }
  deliberationId: string
}

// Narrow type helper (unused but kept for clarity)
async function getDeliberation() {
  return prisma.deliberation.findFirst({
    where: { isShowcase: true },
    include: {
      ideas: { orderBy: { totalVotes: 'desc' }, take: 20 },
      cells: {
        where: { status: { in: ['DELIBERATING', 'VOTING'] } },
        include: {
          participants: true,
          ideas: { include: { idea: true } },
          comments: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: { user: { select: { name: true } } },
          },
        },
      },
    },
  })
}

async function handleSubmission(
  deliberation: NonNullable<DeliberationWithRelations>,
  agent: AgentWithUser
): Promise<{ action: string; detail: string }> {
  if (agent.hasSubmittedIdea) {
    return { action: 'skip', detail: 'Already submitted idea' }
  }

  const existingIdeas = deliberation.ideas.map(i => i.text).join('\n- ')

  const systemPrompt = `You are participating in a deliberation about: "${deliberation.question}"

Your persona: ${agent.persona}
${agent.personalityDesc}

Existing ideas submitted so far:
- ${existingIdeas || '(none yet)'}

Submit ONE idea (2-4 sentences) that reflects your unique perspective. Be specific and constructive. Do not repeat existing ideas. Just output the idea text directly, no preamble.`

  const ideaText = await callClaude(systemPrompt, [
    { role: 'user', content: 'Submit your idea for what humanity should prioritize.' },
  ])

  if (!ideaText.trim()) {
    return { action: 'error', detail: 'Empty response from Claude' }
  }

  await prisma.idea.create({
    data: {
      deliberationId: deliberation.id,
      authorId: agent.user.id,
      text: ideaText.trim(),
      status: 'SUBMITTED',
    },
  })

  await prisma.aIAgent.update({
    where: { id: agent.id },
    data: { hasSubmittedIdea: true },
  })

  return { action: 'submit_idea', detail: ideaText.trim().slice(0, 100) }
}

async function handleVoting(
  deliberation: NonNullable<DeliberationWithRelations>,
  agent: AgentWithUser
): Promise<{ action: string; detail: string }> {
  // Find a cell this agent is participating in
  const participation = await prisma.cellParticipation.findFirst({
    where: {
      userId: agent.user.id,
      cell: {
        deliberationId: deliberation.id,
        status: { in: ['DELIBERATING', 'VOTING'] },
      },
    },
    include: {
      cell: {
        include: {
          ideas: { include: { idea: true } },
          comments: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: { user: { select: { name: true } } },
          },
        },
      },
    },
  })

  if (!participation) {
    return { action: 'skip', detail: 'Not in any active cell' }
  }

  const cell = participation.cell

  if (cell.status === 'DELIBERATING') {
    // Post a comment during deliberation
    return await postAgentComment(deliberation, agent, cell)
  }

  if (cell.status === 'VOTING') {
    // Check if already voted
    const existingVote = await prisma.vote.findFirst({
      where: { cellId: cell.id, userId: agent.user.id },
    })

    if (existingVote) {
      // Already voted, maybe comment instead
      if (Math.random() < 0.3) {
        return await postAgentComment(deliberation, agent, cell)
      }
      return { action: 'skip', detail: 'Already voted in this cell' }
    }

    // Cast a vote
    return await castAgentVote(deliberation, agent, cell)
  }

  return { action: 'skip', detail: 'Cell not in actionable state' }
}

async function handleAccumulation(
  deliberation: NonNullable<DeliberationWithRelations>,
  agent: AgentWithUser
): Promise<{ action: string; detail: string }> {
  // Random chance to submit a challenger (20%)
  if (Math.random() > 0.2) {
    return { action: 'skip', detail: 'Skipping accumulation action (random)' }
  }

  const existingIdeas = deliberation.ideas.map(i => i.text).join('\n- ')
  const champion = deliberation.ideas.find(i => i.isChampion)

  const systemPrompt = `You are participating in a deliberation about: "${deliberation.question}"

Your persona: ${agent.persona}
${agent.personalityDesc}

The current champion idea is: "${champion?.text || 'none yet'}"

Other ideas:
- ${existingIdeas || '(none)'}

The deliberation is in the "Accepting New Ideas" phase. Submit a challenger idea that you believe is better than the current champion. Be specific and constructive. 2-4 sentences. Just output the idea text directly.`

  const ideaText = await callClaude(systemPrompt, [
    { role: 'user', content: 'Submit a challenger idea.' },
  ])

  if (!ideaText.trim()) {
    return { action: 'error', detail: 'Empty response from Claude' }
  }

  await prisma.idea.create({
    data: {
      deliberationId: deliberation.id,
      authorId: agent.user.id,
      text: ideaText.trim(),
      status: 'PENDING',
      isNew: true,
    },
  })

  return { action: 'submit_challenger', detail: ideaText.trim().slice(0, 100) }
}

// ─── Action Helpers ───────────────────────────────────────────

async function postAgentComment(
  deliberation: NonNullable<DeliberationWithRelations>,
  agent: AgentWithUser,
  cell: {
    id: string
    ideas: { idea: { id: string; text: string } }[]
    comments: { text: string; user: { name: string | null } }[]
  }
): Promise<{ action: string; detail: string }> {
  const ideas = cell.ideas.map(ci => ci.idea)
  const recentComments = cell.comments
    .map(c => `${c.user.name || 'Anonymous'}: ${c.text}`)
    .join('\n')

  const systemPrompt = `You are participating in a deliberation about: "${deliberation.question}"

Your persona: ${agent.persona}
${agent.personalityDesc}

Ideas in your cell:
${ideas.map((idea, i) => `${i + 1}. ${idea.text}`).join('\n')}

Recent discussion:
${recentComments || '(no comments yet)'}

Post a brief comment (1-3 sentences) engaging with the ideas or other comments. Be authentic to your persona. Just output the comment text directly.`

  const commentText = await callClaude(systemPrompt, [
    { role: 'user', content: 'Share your thoughts on the ideas in your cell.' },
  ])

  if (!commentText.trim()) {
    return { action: 'error', detail: 'Empty comment from Claude' }
  }

  // Pick a random idea to link the comment to
  const randomIdea = ideas[Math.floor(Math.random() * ideas.length)]

  await prisma.comment.create({
    data: {
      cellId: cell.id,
      userId: agent.user.id,
      text: commentText.trim(),
      ideaId: randomIdea?.id || null,
    },
  })

  return { action: 'comment', detail: commentText.trim().slice(0, 100) }
}

async function castAgentVote(
  deliberation: NonNullable<DeliberationWithRelations>,
  agent: AgentWithUser,
  cell: {
    id: string
    ideas: { idea: { id: string; text: string } }[]
    comments: { text: string; user: { name: string | null } }[]
  }
): Promise<{ action: string; detail: string }> {
  const ideas = cell.ideas.map(ci => ci.idea)
  const recentComments = cell.comments
    .map(c => `${c.user.name || 'Anonymous'}: ${c.text}`)
    .join('\n')

  const systemPrompt = `You are participating in a deliberation about: "${deliberation.question}"

Your persona: ${agent.persona}
${agent.personalityDesc}

Ideas in your cell (vote for ONE by responding with ONLY the number):
${ideas.map((idea, i) => `${i + 1}. ${idea.text}`).join('\n')}

Recent discussion:
${recentComments || '(no comments yet)'}

Choose the idea that best aligns with your values and perspective. Respond with ONLY the number (e.g., "2").`

  const voteResponse = await callClaude(systemPrompt, [
    { role: 'user', content: 'Which idea do you vote for? Respond with only the number.' },
  ])

  // Parse the vote
  const voteNum = parseInt(voteResponse.trim().replace(/\D/g, ''))
  const chosenIdea = ideas[voteNum - 1] || ideas[Math.floor(Math.random() * ideas.length)]

  if (!chosenIdea) {
    return { action: 'error', detail: 'No ideas to vote on' }
  }

  // Cast the vote via raw SQL (xpPoints invisible to Prisma runtime client)
  const voteId = `vt${Date.now()}${Math.random().toString(36).slice(2, 8)}`
  await prisma.$executeRaw`
    INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt")
    VALUES (${voteId}, ${cell.id}, ${agent.user.id}, ${chosenIdea.id}, 10, NOW())
  `

  // Update idea vote count and XP
  await prisma.$executeRaw`
    UPDATE "Idea" SET "totalVotes" = "totalVotes" + 1, "totalXP" = "totalXP" + 10 WHERE id = ${chosenIdea.id}
  `

  // Update participation status
  await prisma.cellParticipation.updateMany({
    where: { cellId: cell.id, userId: agent.user.id },
    data: { status: 'VOTED', votedAt: new Date() },
  })

  // Check if all participants voted — trigger cell completion
  const cellData = await prisma.cell.findUnique({
    where: { id: cell.id },
    include: {
      participants: true,
      votes: true,
    },
  })

  if (cellData && cellData.status === 'VOTING') {
    const activeCount = cellData.participants.filter(
      p => p.status === 'ACTIVE' || p.status === 'VOTED'
    ).length
    if (cellData.votes.length >= activeCount && activeCount > 0) {
      await processCellResults(cell.id, false)
    }
  }

  return { action: 'vote', detail: `Voted for idea: ${chosenIdea.text.slice(0, 60)}` }
}
