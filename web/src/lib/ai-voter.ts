import { prisma } from './prisma'
import { callClaude } from './claude'
import { atomicJoinCell, processCellResults } from './voting'

/**
 * AI Resolve: fill empty seats in a stuck cell with AI voters.
 * Each AI reads the ideas, uses Haiku to allocate 10 XP, casts real votes.
 * Cell completes normally via processCellResults().
 */

const AI_VOTER_DOMAIN = 'bot.unitychant.com'

/** Get or create an AI voter user */
async function getOrCreateAIVoter(index: number): Promise<{ id: string }> {
  const email = `ai_voter_${index}@${AI_VOTER_DOMAIN}`
  const name = `AI Voter ${index}`

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return { id: existing.id }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      emailVerified: new Date(),
    },
  })
  return { id: user.id }
}

/** Ask Haiku to allocate 10 XP across ideas */
async function getAIAllocation(
  question: string,
  description: string | null,
  ideas: { id: string; text: string }[]
): Promise<{ ideaId: string; points: number }[]> {
  const ideaList = ideas.map((idea, i) => `${i + 1}. [${idea.id}] ${idea.text}`).join('\n')

  const prompt = `You are a voter in a collective decision-making process.

The question being deliberated: "${question}"
${description ? `Context: ${description}` : ''}

Here are the ideas to evaluate:
${ideaList}

Allocate exactly 10 vote points across these ideas. Give more points to stronger ideas. Every idea must get at least 0 points. The total must equal exactly 10.

Respond with ONLY a JSON array, no other text:
[{"ideaId": "...", "points": N}, ...]`

  try {
    const response = await callClaude(
      'You are a thoughtful evaluator. Respond with only valid JSON.',
      [{ role: 'user', content: prompt }],
      'haiku'
    )

    // Extract JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array in response')

    const parsed = JSON.parse(jsonMatch[0]) as { ideaId: string; points: number }[]

    // Validate
    const total = parsed.reduce((s, a) => s + a.points, 0)
    const validIds = new Set(ideas.map(i => i.id))
    const allValid = parsed.every(a => validIds.has(a.ideaId) && a.points >= 0)

    if (total !== 10 || !allValid) throw new Error(`Invalid allocation: total=${total}`)

    return parsed
  } catch {
    // Fallback: spread evenly with remainder to first idea
    const base = Math.floor(10 / ideas.length)
    let remainder = 10 - (base * ideas.length)
    return ideas.map(idea => {
      const points = base + (remainder > 0 ? 1 : 0)
      if (remainder > 0) remainder--
      return { ideaId: idea.id, points }
    })
  }
}

/** Cast an AI vote in a cell using raw SQL (same pattern as vote/route.ts) */
async function castAIVote(
  cellId: string,
  userId: string,
  allocations: { ideaId: string; points: number }[]
) {
  const now = new Date()

  for (const a of allocations) {
    if (a.points <= 0) continue
    const voteId = `vt${Date.now()}${Math.random().toString(36).slice(2, 8)}`
    await prisma.$executeRaw`
      INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt")
      VALUES (${voteId}, ${cellId}, ${userId}, ${a.ideaId}, ${a.points}, ${now})
      ON CONFLICT DO NOTHING
    `
  }

  // Update idea tallies
  for (const ci of allocations) {
    if (ci.points <= 0) continue
    const ideaVotes = await prisma.$queryRaw<{ userId: string; xpPoints: number }[]>`
      SELECT "userId", "xpPoints" FROM "Vote" WHERE "cellId" = ${cellId} AND "ideaId" = ${ci.ideaId}
    `
    const uniqueVoters = new Set(ideaVotes.map(v => v.userId)).size
    const xpSum = ideaVotes.reduce((sum, v) => sum + v.xpPoints, 0)
    await prisma.$executeRaw`
      UPDATE "Idea" SET "totalVotes" = ${uniqueVoters}, "totalXP" = ${xpSum} WHERE id = ${ci.ideaId}
    `
  }

  // Mark as voted
  await prisma.cellParticipation.updateMany({
    where: { cellId, userId },
    data: { status: 'VOTED', votedAt: now },
  })
}

/**
 * Fill empty seats in a cell with AI voters and cast votes.
 * Returns number of AI voters added.
 */
export async function aiResolveCell(cellId: string): Promise<number> {
  const cell = await prisma.cell.findUnique({
    where: { id: cellId },
    include: {
      participants: true,
      ideas: {
        include: {
          idea: { select: { id: true, text: true } },
        },
      },
      deliberation: {
        select: { question: true, description: true, cellSize: true },
      },
    },
  })

  if (!cell || cell.status !== 'VOTING') return 0

  const cellSize = cell.deliberation.cellSize || 5
  const currentCount = cell.participants.length
  const needed = cellSize - currentCount

  if (needed <= 0) return 0

  const ideas = cell.ideas.map(ci => ({
    id: ci.idea.id,
    text: ci.idea.text,
  }))

  let aiAdded = 0

  for (let i = 0; i < needed; i++) {
    // Use a unique index per cell to avoid collisions
    const voterIndex = Date.now() + i
    const aiUser = await getOrCreateAIVoter(voterIndex)

    // Join cell
    const joined = await atomicJoinCell(cellId, aiUser.id, cellSize)
    if (!joined) continue

    // Ensure membership in deliberation
    await prisma.deliberationMember.upsert({
      where: { deliberationId_userId: { deliberationId: cell.deliberationId, userId: aiUser.id } },
      create: { deliberationId: cell.deliberationId, userId: aiUser.id },
      update: {},
    })

    // Get AI allocation
    const allocations = await getAIAllocation(
      cell.deliberation.question,
      cell.deliberation.description,
      ideas
    )

    // Cast vote
    await castAIVote(cellId, aiUser.id, allocations)
    aiAdded++
  }

  // Check if cell should now complete
  const updatedCell = await prisma.cell.findUnique({
    where: { id: cellId },
    include: {
      participants: { where: { status: 'VOTED' } },
    },
  })

  if (updatedCell && updatedCell.status === 'VOTING') {
    const votedCount = updatedCell.participants.length
    if (votedCount >= cellSize) {
      await processCellResults(cellId, false)
    }
  }

  return aiAdded
}

/**
 * AI Resolve all stuck cells in a deliberation's current tier.
 * Returns { cellsResolved, aiVotersAdded }.
 */
export async function aiResolveTier(deliberationId: string): Promise<{
  cellsResolved: number
  aiVotersAdded: number
}> {
  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    select: { currentTier: true, cellSize: true },
  })

  if (!deliberation) return { cellsResolved: 0, aiVotersAdded: 0 }

  const cellSize = deliberation.cellSize || 5

  // Find all VOTING cells at current tier with < cellSize participants
  const stuckCells = await prisma.cell.findMany({
    where: {
      deliberationId,
      tier: deliberation.currentTier,
      status: 'VOTING',
    },
    include: {
      _count: { select: { participants: true } },
    },
  })

  const underfilledCells = stuckCells.filter(c => c._count.participants < cellSize)

  let totalAI = 0
  let resolved = 0

  for (const cell of underfilledCells) {
    const added = await aiResolveCell(cell.id)
    totalAI += added
    if (added > 0) resolved++
  }

  return { cellsResolved: resolved, aiVotersAdded: totalAI }
}
