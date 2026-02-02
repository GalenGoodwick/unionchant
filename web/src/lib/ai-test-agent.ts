/**
 * AI Test Agent System
 *
 * Simulates realistic user behavior for load testing.
 * Uses fast batch operations without AI for speed.
 * Agents interact via actual API endpoints like real users.
 */

import { prisma } from './prisma'

export interface AgentConfig {
  totalAgents: number
  votingTimePerTierMs: number // e.g., 30000 for 30 seconds
  dropoutRate: number // 0-1, percentage who don't vote
  commentRate: number // 0-1, percentage who comment
  upvoteRate: number // 0-1, percentage who upvote comments
  newJoinRate: number // 0-1, percentage of new joins mid-voting
  forceStartVoting?: boolean // Force start voting even if trigger not met
  fastMode?: boolean // Skip AI, use batch operations for speed
  excludeAdminEmail?: string // Remove this admin from deliberation before voting
}

export interface TestProgress {
  phase: 'setup' | 'submission' | 'voting' | 'completed'
  currentTier: number
  totalTiers: number
  agentsCreated: number
  ideasSubmitted: number
  votescast: number
  commentsPosted: number
  upvotesGiven: number
  dropouts: number
  errors: string[]
  logs: string[]  // Real-time logs for debugging
}

// Store for tracking test state
// Use globalThis to persist state across Next.js hot-reloads in dev mode.
// Without this, polling the GET endpoint can hit a fresh module instance
// that has zeroed-out state, causing the UI to flash between real and empty data.
const globalForTest = globalThis as unknown as {
  __testProgress?: TestProgress
  __shouldStopTest?: boolean
  __testRunning?: boolean
}

if (!globalForTest.__testProgress) {
  globalForTest.__testProgress = {
    phase: 'setup',
    currentTier: 0,
    totalTiers: 0,
    agentsCreated: 0,
    ideasSubmitted: 0,
    votescast: 0,
    commentsPosted: 0,
    upvotesGiven: 0,
    dropouts: 0,
    errors: [],
    logs: [],
  }
}

const testProgress = globalForTest.__testProgress

// Flag to stop test early
let shouldStopTest = globalForTest.__shouldStopTest ?? false

export function stopTest() {
  shouldStopTest = true
  globalForTest.__shouldStopTest = true
  addTestLog('Stop requested - will stop after current operation')
}

export function isTestStopped() {
  return shouldStopTest
}

// Helper to add logs that are visible in the admin UI
function addTestLog(message: string) {
  const timestamp = new Date().toLocaleTimeString()
  testProgress.logs.push(`[${timestamp}] ${message}`)
  // Keep last 50 logs
  if (testProgress.logs.length > 50) {
    testProgress.logs = testProgress.logs.slice(-50)
  }
  console.log(`[AI Test] ${message}`)
}

export function getTestProgress(): TestProgress {
  return { ...testProgress }
}

export function resetTestProgress() {
  shouldStopTest = false
  globalForTest.__shouldStopTest = false
  // Mutate in place so the globalThis reference stays valid
  Object.assign(testProgress, {
    phase: 'setup',
    currentTier: 0,
    totalTiers: 0,
    agentsCreated: 0,
    ideasSubmitted: 0,
    votescast: 0,
    commentsPosted: 0,
    upvotesGiven: 0,
    dropouts: 0,
    errors: [],
    logs: [],
  })
}

/**
 * Create test agent users
 */
export async function createTestAgents(count: number, _prefix: string = 'TestBot'): Promise<string[]> {
  // Reuse ANY existing test users (@test.local) - shared pool with populate endpoint
  const existingUsers = await prisma.user.findMany({
    where: { email: { endsWith: '@test.local' } },
    take: count,
    select: { id: true },
  })

  const userIds = existingUsers.map(u => u.id)
  addTestLog(`Reusing ${userIds.length} existing test users`)
  testProgress.agentsCreated = userIds.length

  // Create more if needed
  if (userIds.length < count) {
    const needed = count - userIds.length
    const timestamp = Date.now()
    addTestLog(`Creating ${needed} new test users...`)

    // Batch create for speed
    const batchSize = 100
    for (let batch = 0; batch < Math.ceil(needed / batchSize); batch++) {
      if (shouldStopTest) {
        addTestLog(`Stopped after creating ${userIds.length} users`)
        break
      }

      const batchStart = batch * batchSize
      const batchEnd = Math.min(batchStart + batchSize, needed)
      const batchCount = batchEnd - batchStart

      try {
        // Create emails for this specific batch
        const batchEmails = Array.from({ length: batchCount }, (_, i) =>
          `test-${timestamp}-${batchStart + i}@test.local`
        )

        await prisma.user.createMany({
          data: batchEmails.map((email, i) => ({
            email,
            name: `Test User ${userIds.length + batchStart + i + 1}`,
            status: 'ACTIVE',
          })),
        })

        // Fetch ONLY the users we just created in this batch
        const newUsers = await prisma.user.findMany({
          where: {
            email: { in: batchEmails },
          },
          select: { id: true },
        })
        userIds.push(...newUsers.map(u => u.id))
        testProgress.agentsCreated = userIds.length
      } catch (err) {
        testProgress.errors.push(`Failed to create user batch ${batch}: ${err}`)
      }
    }
  }

  return userIds.slice(0, count)
}

// Idea templates for variety without AI
const IDEA_TEMPLATES = [
  'We should focus on community engagement and local participation to address this.',
  'A phased approach starting with small pilots would help us learn and adapt.',
  'Technology can streamline this process if we invest in the right tools.',
  'Transparency and regular communication should be our top priorities.',
  'Building partnerships with existing organizations could multiply our impact.',
  'Education and awareness campaigns are essential for long-term success.',
  'We need clear metrics and accountability measures from the start.',
  'Grassroots organizing at the neighborhood level would be most effective.',
  'A hybrid model combining traditional and innovative methods could work best.',
  'Sustainable funding through diverse sources will ensure longevity.',
  'Inclusive decision-making processes will build broader support.',
  'Starting with quick wins will build momentum for bigger changes.',
  'Regular feedback loops will help us course-correct as needed.',
  'Leveraging volunteer networks can expand our reach significantly.',
  'Data-driven approaches will help us target resources effectively.',
  'Building coalitions across different groups strengthens our position.',
  'Simplifying the process will encourage more participation.',
  'Pilot programs in diverse areas will test different approaches.',
  'Creating shared ownership increases long-term commitment.',
  'Focusing on outcomes rather than activities keeps us on track.',
]

/**
 * Generate ideas quickly without AI - uses templates with variation
 */
export function generateIdeasBatch(_question: string, count: number, _existingIdeas: string[] = []): string[] {
  const timestamp = Date.now()
  return Array.from({ length: count }, (_, i) => {
    const template = IDEA_TEMPLATES[i % IDEA_TEMPLATES.length]
    // Add slight variation with index
    return `${template} (Approach #${timestamp}-${i + 1})`
  })
}

/**
 * Generate a single idea (wrapper for batch)
 */
export function generateIdea(question: string, existingIdeas: string[] = []): string {
  const ideas = generateIdeasBatch(question, 1, existingIdeas)
  return ideas[0] || 'A reasonable approach to consider'
}

/**
 * Decide which idea to vote for - random selection for speed
 */
export function decideVote(_question: string, ideas: { id: string; text: string }[]): string {
  // Random vote - simulates varied opinions
  return ideas[Math.floor(Math.random() * ideas.length)].id
}

// Comment templates for variety
const COMMENT_TEMPLATES = [
  'I think this approach has merit and deserves serious consideration.',
  'This could work well if we plan the implementation carefully.',
  'I have some concerns but overall this seems promising.',
  'Great point - we should definitely explore this further.',
  'How would this scale if we had more participants?',
  'I agree with the general direction here.',
  'This addresses the core issue effectively.',
  'We should consider potential unintended consequences.',
  'Building on this idea, we could also consider alternatives.',
  'The practical aspects seem well thought out.',
]

/**
 * Generate a comment - uses templates for speed
 */
export function generateComment(
  _question: string,
  _ideas: { id: string; text: string }[],
  _existingComments: string[] = []
): string {
  return COMMENT_TEMPLATES[Math.floor(Math.random() * COMMENT_TEMPLATES.length)]
}

/**
 * Submit an idea to a deliberation
 */
export async function submitIdea(
  deliberationId: string,
  userId: string,
  ideaText: string,
  isChallenger: boolean = false
): Promise<string | null> {
  try {
    const idea = await prisma.idea.create({
      data: {
        deliberationId,
        authorId: userId,
        text: ideaText,
        status: isChallenger ? 'PENDING' : 'SUBMITTED',
        isNew: isChallenger,
      },
    })
    testProgress.ideasSubmitted++
    return idea.id
  } catch (err) {
    testProgress.errors.push(`Failed to submit idea: ${err}`)
    return null
  }
}

/**
 * Join a deliberation as a member
 */
export async function joinDeliberation(deliberationId: string, userId: string): Promise<boolean> {
  try {
    await prisma.deliberationMember.upsert({
      where: {
        deliberationId_userId: { deliberationId, userId },
      },
      update: {},
      create: {
        deliberationId,
        userId,
        role: 'PARTICIPANT',
      },
    })
    return true
  } catch (err) {
    testProgress.errors.push(`Failed to join deliberation: ${err}`)
    return false
  }
}

/**
 * Cast a vote in a cell
 */
export async function castVote(
  cellId: string,
  userId: string,
  ideaId: string
): Promise<boolean> {
  try {
    // Check if already voted
    const existing = await prisma.vote.findFirst({
      where: { cellId, userId },
    })

    if (existing) {
      await prisma.vote.update({
        where: { id: existing.id },
        data: { ideaId },
      })
    } else {
      await prisma.vote.create({
        data: {
          cellId,
          userId,
          ideaId,
        },
      })

      // Update idea vote count
      await prisma.idea.update({
        where: { id: ideaId },
        data: { totalVotes: { increment: 1 } },
      })
    }

    // Update participation status
    await prisma.cellParticipation.updateMany({
      where: { cellId, userId },
      data: { status: 'VOTED', votedAt: new Date() },
    })

    testProgress.votescast++

    // Check if all participants have voted - trigger cell completion
    const cell = await prisma.cell.findUnique({
      where: { id: cellId },
      include: {
        participants: true,
        votes: true,
      },
    })

    if (cell && cell.status === 'VOTING') {
      const activeParticipants = cell.participants.filter(
        p => p.status === 'ACTIVE' || p.status === 'VOTED'
      ).length
      const voteCount = cell.votes.length

      if (voteCount >= activeParticipants && activeParticipants > 0) {
        const { processCellResults } = await import('./voting')
        await processCellResults(cellId, false)
      }
    }

    return true
  } catch (err) {
    testProgress.errors.push(`Failed to cast vote: ${err}`)
    return false
  }
}

/**
 * Post a comment in a cell
 */
export async function postComment(
  cellId: string,
  userId: string,
  text: string,
  ideaId?: string
): Promise<string | null> {
  try {
    const comment = await prisma.comment.create({
      data: {
        cellId,
        userId,
        text,
        ideaId: ideaId || null,
      },
    })
    testProgress.commentsPosted++
    return comment.id
  } catch (err) {
    testProgress.errors.push(`Failed to post comment: ${err}`)
    return null
  }
}

/**
 * Upvote a comment and check for up-pollination
 */
export async function upvoteComment(
  commentId: string,
  userId: string
): Promise<boolean> {
  try {
    // Get comment with cell info for up-pollination check
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        cell: {
          include: {
            participants: true,
            deliberation: { select: { currentTier: true } },
          },
        },
      },
    })

    if (!comment) return false

    await prisma.commentUpvote.create({
      data: {
        commentId,
        userId,
      },
    })

    // Update comment upvote count
    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: { upvoteCount: { increment: 1 } },
    })

    testProgress.upvotesGiven++

    // Check for up-pollination (60% threshold)
    const cellParticipantCount = comment.cell.participants.length
    const threshold = Math.ceil(cellParticipantCount * 0.6)
    const maxReachTier = comment.cell.deliberation.currentTier + 1

    if (updated.upvoteCount >= threshold && updated.reachTier < maxReachTier) {
      // Up-pollinate!
      const newTier = Math.min(updated.reachTier + 1, maxReachTier)
      await prisma.comment.update({
        where: { id: commentId },
        data: { reachTier: newTier },
      })
      console.log(`[AI Test] Comment up-pollinated to Tier ${newTier}!`)
    }

    return true
  } catch (err) {
    // Might already be upvoted
    return false
  }
}

/**
 * Simulate delay with some randomness
 */
function randomDelay(baseMs: number, variance: number = 0.3): Promise<void> {
  const delay = baseMs * (1 + (Math.random() - 0.5) * 2 * variance)
  return new Promise(resolve => setTimeout(resolve, delay))
}

/**
 * Check if voting should start based on deliberation trigger settings
 * Trigger is determined by which fields are set:
 * - ideaGoal set → trigger by ideas
 * - Neither set → trigger by timer (submissionEndsAt)
 */
function checkVotingTrigger(deliberation: {
  ideaGoal: number | null
  submissionEndsAt: Date | null
  ideas: unknown[]
}): boolean {
  // Check idea goal trigger
  if (deliberation.ideaGoal && deliberation.ideas.length >= deliberation.ideaGoal) {
    return true
  }

  // Check timer trigger
  if (deliberation.submissionEndsAt && new Date() >= deliberation.submissionEndsAt) {
    return true
  }

  return false
}

/**
 * Run the full AI agent test
 *
 * Handles deliberations in any phase:
 * - SUBMISSION: Agents submit ideas, may trigger voting based on settings
 * - VOTING: Agents vote in cells they're assigned to
 * - ACCUMULATING: Agents submit challenger ideas
 */
export async function runAgentTest(
  deliberationId: string,
  config: AgentConfig,
  onProgress?: (progress: TestProgress) => void
): Promise<TestProgress> {
  // Prevent concurrent test runs
  if (globalForTest.__testRunning) {
    addTestLog('ERROR: Test already running, refusing to start another')
    testProgress.errors.push('Test already running')
    return getTestProgress()
  }
  globalForTest.__testRunning = true

  resetTestProgress()
  testProgress.phase = 'setup'

  const reportProgress = () => {
    if (onProgress) onProgress(getTestProgress())
  }

  try {
    addTestLog('Starting test...')

    // 0. Check existing test users (reuse them, don't auto-cleanup)
    const existingCount = await prisma.user.count({
      where: { email: { endsWith: '@test.local' } },
    })
    if (existingCount > 0) {
      addTestLog(`Found ${existingCount} existing test users - will reuse them`)
    }

    // 1. Get deliberation info
    addTestLog('Fetching deliberation...')
    const deliberation = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
      include: {
        ideas: true,
        members: true,
        cells: {
          where: { status: 'VOTING' },
          include: { participants: true },
        },
      },
    })

    if (!deliberation) {
      throw new Error('Deliberation not found')
    }

    addTestLog(`Phase: ${deliberation.phase}, Members: ${deliberation.members.length}, Ideas: ${deliberation.ideas.length}`)

    // 2. Create test agents (for any phase)
    addTestLog(`Creating ${config.totalAgents} test agents...`)
    const agentIds = await createTestAgents(config.totalAgents, 'TestBot')
    addTestLog(`Created ${agentIds.length} agents`)
    reportProgress()

    // Check for stop
    if (shouldStopTest) {
      addTestLog('Test stopped by user')
      testProgress.phase = 'completed'
      return getTestProgress()
    }

    // 3. Join all agents to the deliberation (batch for speed)
    addTestLog('Joining agents to deliberation...')
    await prisma.deliberationMember.createMany({
      data: agentIds.map(userId => ({
        deliberationId,
        userId,
        role: 'PARTICIPANT',
      })),
      skipDuplicates: true,
    })
    addTestLog('All agents joined as members')
    reportProgress()

    // If already in VOTING, add agents as late joiners to cells
    if (deliberation.phase === 'VOTING') {
      addTestLog('Already in VOTING phase - adding agents as late joiners to cells...')
      testProgress.phase = 'voting'

      const { addLateJoinerToCell } = await import('./voting')
      let lateJoinersAdded = 0

      for (const agentId of agentIds) {
        if (shouldStopTest) break
        const result = await addLateJoinerToCell(deliberationId, agentId)
        if (result.success) {
          lateJoinersAdded++
        }
      }
      addTestLog(`Added ${lateJoinersAdded} late joiners to cells`)
      // Will proceed directly to voting loop below
    }

    // Check for stop
    if (shouldStopTest) {
      addTestLog('Test stopped by user')
      testProgress.phase = 'completed'
      return getTestProgress()
    }

    // 4. Handle different phases
    if (deliberation.phase === 'SUBMISSION') {
      testProgress.phase = 'submission'
      addTestLog('Submission phase - generating ideas...')

      const existingIdeas = deliberation.ideas.map(i => i.text)

      // Generate all ideas in one batch (fast - no AI)
      const ideaCount = agentIds.length
      addTestLog(`Generating ${ideaCount} ideas...`)
      const generatedIdeas = generateIdeasBatch(deliberation.question, ideaCount, existingIdeas)
      addTestLog(`Generated ${generatedIdeas.length} ideas, submitting...`)

      // Submit ideas for all agents (batch for speed)
      addTestLog('Batch submitting ideas...')
      const ideaData = agentIds.map((userId, i) => ({
        deliberationId,
        authorId: userId,
        text: generatedIdeas[i] || `Test idea ${i + 1} for: ${deliberation.question.slice(0, 50)}`,
        status: 'SUBMITTED' as const,
        isNew: false,
      }))

      await prisma.idea.createMany({
        data: ideaData,
        skipDuplicates: true,
      })

      testProgress.ideasSubmitted = agentIds.length
      addTestLog(`Submitted ${agentIds.length} ideas`)
      reportProgress()

      // Check voting trigger
      const updatedDelib = await prisma.deliberation.findUnique({
        where: { id: deliberationId },
        select: {
          ideaGoal: true,
          submissionEndsAt: true,
          ideas: true,
        },
      })

      if (updatedDelib) {
        // Exclude admin from deliberation before voting starts
        if (config.excludeAdminEmail) {
          const adminUser = await prisma.user.findUnique({
            where: { email: config.excludeAdminEmail },
            select: { id: true },
          })
          if (adminUser) {
            await prisma.deliberationMember.deleteMany({
              where: { deliberationId, userId: adminUser.id },
            })
            addTestLog(`Excluded admin (${config.excludeAdminEmail}) from deliberation`)
          }
        }

        const shouldStartVoting = checkVotingTrigger(updatedDelib)
        const { startVotingPhase } = await import('./voting')

        if (shouldStartVoting) {
          addTestLog('Voting trigger met - starting voting phase...')
          const result = await startVotingPhase(deliberationId)
          addTestLog(`startVotingPhase result: ${result.success ? 'SUCCESS' : `FAILED: ${result.reason}`}`)
          if (!result.success) {
            testProgress.errors.push(`Voting failed to start: ${result.reason} - ${result.message}`)
          }
        } else {
          const triggerType = updatedDelib.ideaGoal ? 'ideas' : 'timer'
          addTestLog(`Trigger (${triggerType}) not met - Ideas: ${updatedDelib.ideas.length}/${updatedDelib.ideaGoal || 'N/A'}`)

          // For testing purposes, force-start if manual or waiting
          if (config.forceStartVoting) {
            addTestLog('Force-starting voting...')
            try {
              const result = await startVotingPhase(deliberationId)
              addTestLog(`startVotingPhase result: ${result.success ? 'SUCCESS' : `FAILED: ${result.reason} - ${result.message}`}`)
              if (!result.success) {
                testProgress.errors.push(`Voting failed to start: ${result.reason} - ${result.message}`)
              }
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err)
              addTestLog(`startVotingPhase ERROR: ${errMsg}`)
              testProgress.errors.push(`Voting exception: ${errMsg}`)
            }
          } else {
            testProgress.phase = 'completed'
            testProgress.errors.push('Voting trigger not met. Set forceStartVoting=true to override.')
            return getTestProgress()
          }
        }
      }
    } else if (deliberation.phase === 'ACCUMULATING') {
      // Handle challenge/accumulation phase - all agents submit challengers
      testProgress.phase = 'submission'
      addTestLog('Accumulating phase - submitting challenger ideas...')

      const existingIdeas = deliberation.ideas.map(i => i.text)
      const challengerCount = agentIds.length

      addTestLog(`Generating ${challengerCount} challenger ideas...`)
      const generatedIdeas = generateIdeasBatch(deliberation.question, challengerCount, existingIdeas)

      for (let i = 0; i < agentIds.length; i++) {
        const ideaText = generatedIdeas[i] || `Challenger idea ${i + 1}`
        await submitIdea(deliberationId, agentIds[i], ideaText, true) // true = challenger
        testProgress.ideasSubmitted = i + 1
        reportProgress()
      }

      // Check if we should start a challenge round
      const updatedDelib = await prisma.deliberation.findUnique({
        where: { id: deliberationId },
        include: { ideas: { where: { status: 'PENDING' } } },
      })

      if (updatedDelib && updatedDelib.ideas.length >= 4) {
        addTestLog('Enough challengers - starting challenge round...')
        const { startChallengeRound } = await import('./challenge')
        await startChallengeRound(deliberationId)
      } else {
        addTestLog(`Not enough challengers (${updatedDelib?.ideas.length || 0}/4 minimum)`)
        if (!config.forceStartVoting) {
          testProgress.phase = 'completed'
          testProgress.errors.push('Not enough challengers for challenge round')
          return getTestProgress()
        }
      }
    } else if (deliberation.phase === 'VOTING') {
      // Already handled at the start - proceed to voting loop
      addTestLog('Proceeding to vote for existing cell participants...')
    } else if (deliberation.phase === 'COMPLETED') {
      testProgress.errors.push('Deliberation already completed')
      testProgress.phase = 'completed'
      return getTestProgress()
    }

    // 5. Voting phase - simulate voting through tiers
    testProgress.phase = 'voting'
    let votingComplete = false
    let tierCount = 0
    const MAX_TIERS = 15 // Safety limit

    // Small delay to let startVotingPhase complete
    await new Promise(resolve => setTimeout(resolve, 500))

    while (!votingComplete) {
      // Check for stop
      if (shouldStopTest) {
        addTestLog('Test stopped by user during voting')
        testProgress.phase = 'completed'
        return getTestProgress()
      }

      tierCount++
      testProgress.currentTier = tierCount

      if (tierCount > MAX_TIERS) {
        addTestLog(`Safety limit reached (${MAX_TIERS} tiers), stopping`)
        votingComplete = true
        break
      }

      // Get current state
      const currentDelib = await prisma.deliberation.findUnique({
        where: { id: deliberationId },
        include: {
          cells: {
            where: { status: 'VOTING' },
            include: {
              ideas: { include: { idea: true } },
              participants: {
                include: { user: { select: { id: true, email: true } } },
              },
              comments: true,
            },
          },
        },
      })

      addTestLog(`Checking: phase=${currentDelib?.phase}, cells=${currentDelib?.cells.length || 0}`)

      if (!currentDelib || currentDelib.phase !== 'VOTING' || currentDelib.cells.length === 0) {
        addTestLog(`Voting loop exit - phase: ${currentDelib?.phase}`)
        votingComplete = true
        break
      }

      addTestLog(`Tier ${tierCount} - ${currentDelib.cells.length} cells`)

      // Check for stop
      if (shouldStopTest) {
        addTestLog('Test stopped by user during cell processing')
        testProgress.phase = 'completed'
        return getTestProgress()
      }

      // BATCH VOTING: Collect all votes across all cells, then create them in one operation
      const allVotes: { cellId: string; userId: string; ideaId: string }[] = []
      const ideaVoteCounts: Map<string, number> = new Map()
      const participationUpdates: { cellId: string; userId: string }[] = []

      for (const cell of currentDelib.cells) {
        const ideas = cell.ideas.map(ci => ({
          id: ci.idea.id,
          text: ci.idea.text,
        }))

        if (ideas.length === 0) continue

        // Get existing votes to avoid duplicates
        const existingVotes = await prisma.vote.findMany({
          where: { cellId: cell.id },
          select: { userId: true },
        })
        const votedUserIds = new Set(existingVotes.map(v => v.userId))

        for (const participant of cell.participants) {
          if (votedUserIds.has(participant.userId)) continue

          // Skip non-test users (real users) — don't vote on their behalf
          if (!agentIds.includes(participant.userId)) continue

          // Random vote
          const chosenIdea = ideas[Math.floor(Math.random() * ideas.length)]
          allVotes.push({
            cellId: cell.id,
            userId: participant.userId,
            ideaId: chosenIdea.id,
          })

          // Track vote counts per idea
          ideaVoteCounts.set(chosenIdea.id, (ideaVoteCounts.get(chosenIdea.id) || 0) + 1)

          participationUpdates.push({
            cellId: cell.id,
            userId: participant.userId,
          })
        }
      }

      addTestLog(`Voting: ${allVotes.length} votes across ${currentDelib.cells.length} cells (${currentDelib.cells.length * 5 - allVotes.length} skipped non-test)`)

      // Batch create all votes
      if (allVotes.length > 0) {
        const voteResult = await prisma.vote.createMany({
          data: allVotes,
          skipDuplicates: true,
        })
        testProgress.votescast += voteResult.count
        addTestLog(`Votes inserted: ${voteResult.count}/${allVotes.length}`)

        // Batch update idea vote counts
        addTestLog(`Updating vote counts for ${ideaVoteCounts.size} ideas...`)
        for (const [ideaId, count] of ideaVoteCounts) {
          await prisma.idea.update({
            where: { id: ideaId },
            data: { totalVotes: { increment: count } },
          })
        }

        // Batch update participation status
        const now = new Date()
        for (const { cellId, userId } of participationUpdates) {
          await prisma.cellParticipation.updateMany({
            where: { cellId, userId },
            data: { status: 'VOTED', votedAt: now },
          })
        }
        addTestLog(`Updated ${participationUpdates.length} participation records`)
      }

      // Post comments based on commentRate
      if (config.commentRate > 0) {
        addTestLog(`Posting comments (rate=${config.commentRate})...`)
        let commentsThisTier = 0
        for (const cell of currentDelib.cells) {
          const ideas = cell.ideas.map(ci => ({
            id: ci.idea.id,
            text: ci.idea.text,
          }))

          for (const participant of cell.participants) {
            if (!agentIds.includes(participant.userId)) continue // Skip real users
            if (Math.random() < config.commentRate) {
              const commentText = generateComment(
                currentDelib.question || '',
                ideas,
                cell.comments.map((c: { text: string }) => c.text)
              )
              const randomIdea = ideas[Math.floor(Math.random() * ideas.length)]
              await postComment(cell.id, participant.userId, commentText, randomIdea?.id)
              commentsThisTier++
            }
          }
        }
        addTestLog(`Comments: ${commentsThisTier} posted`)
      }

      // Upvote comments based on upvoteRate
      if (config.upvoteRate > 0) {
        addTestLog(`Upvoting comments (rate=${config.upvoteRate})...`)
        let upvotesThisTier = 0
        for (const cell of currentDelib.cells) {
          const cellComments = await prisma.comment.findMany({
            where: { cellId: cell.id },
            select: { id: true, userId: true },
          })

          if (cellComments.length === 0) continue

          for (const participant of cell.participants) {
            if (!agentIds.includes(participant.userId)) continue // Skip real users
            if (Math.random() < config.upvoteRate) {
              const eligible = cellComments.filter(c => c.userId !== participant.userId)
              if (eligible.length === 0) continue
              const comment = eligible[Math.floor(Math.random() * eligible.length)]
              const success = await upvoteComment(comment.id, participant.userId)
              if (success) upvotesThisTier++
            }
          }
        }
        addTestLog(`Upvotes: ${upvotesThisTier} given`)
      }

      reportProgress()

      // Process cell results
      addTestLog(`Processing ${currentDelib.cells.length} cells...`)
      const { processCellResults } = await import('./voting')

      let processedCount = 0
      let alreadyClaimedCount = 0
      for (const cell of currentDelib.cells) {
        const result = await processCellResults(cell.id, true)
        if (result) {
          processedCount++
          addTestLog(`  Cell ${cell.id.slice(-4)}: ${result.winnerIds.length} winners, ${result.loserIds.length} eliminated`)
        } else {
          alreadyClaimedCount++
        }
      }
      addTestLog(`Tier ${tierCount} done: ${processedCount} processed, ${alreadyClaimedCount} already-claimed`)

      // Check what happened after processing
      const postTierDelib = await prisma.deliberation.findUnique({
        where: { id: deliberationId },
        select: { phase: true, currentTier: true, championId: true },
      })
      addTestLog(`Post-tier state: phase=${postTierDelib?.phase}, currentTier=${postTierDelib?.currentTier}, champion=${postTierDelib?.championId ? 'YES' : 'no'}`)

      reportProgress()
    }

    // 7. Test complete
    testProgress.phase = 'completed'
    testProgress.totalTiers = tierCount

    addTestLog(`Test complete! Agents: ${testProgress.agentsCreated}, Ideas: ${testProgress.ideasSubmitted}, Votes: ${testProgress.votescast}, Tiers: ${tierCount}`)

    reportProgress()
    return getTestProgress()

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    testProgress.errors.push(`Fatal error: ${errorMessage}`)
    addTestLog(`FATAL ERROR: ${errorMessage}`)
    reportProgress()
    return getTestProgress()
  } finally {
    globalForTest.__testRunning = false
  }
}

/**
 * Clean up test data - deletes users and all their related records
 */
export async function cleanupTestAgents(_prefix: string = 'TestBot'): Promise<number> {
  // Find all test user IDs (@test.local - shared pool), but protect AI personas
  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: '@test.local' }, isAI: false },
    select: { id: true },
  })

  if (testUsers.length === 0) return 0

  const userIds = testUsers.map(u => u.id)
  addTestLog(`Found ${userIds.length} test users to clean up`)

  // Get all ideas created by test users (needed for FK cleanup)
  const testIdeas = await prisma.idea.findMany({
    where: { authorId: { in: userIds } },
    select: { id: true },
  })
  const ideaIds = testIdeas.map(i => i.id)
  addTestLog(`Found ${ideaIds.length} test ideas to clean up`)

  // Get deliberations created by test users (rare but possible)
  const testDeliberations = await prisma.deliberation.findMany({
    where: { creatorId: { in: userIds } },
    select: { id: true },
  })
  const deliberationIds = testDeliberations.map(d => d.id)
  if (deliberationIds.length > 0) {
    addTestLog(`Found ${deliberationIds.length} test deliberations to clean up`)
  }

  // Delete related records first (order matters for foreign keys)

  // 0. Delete deliberations created by test users (and all their contents)
  if (deliberationIds.length > 0) {
    // Get all cells in test deliberations
    const testCells = await prisma.cell.findMany({
      where: { deliberationId: { in: deliberationIds } },
      select: { id: true },
    })
    const cellIds = testCells.map(c => c.id)

    // Get all ideas in test deliberations
    const testDelibIdeas = await prisma.idea.findMany({
      where: { deliberationId: { in: deliberationIds } },
      select: { id: true },
    })
    const testDelibIdeaIds = testDelibIdeas.map(i => i.id)

    // Delete cell-related records
    if (cellIds.length > 0) {
      await prisma.commentUpvote.deleteMany({ where: { comment: { cellId: { in: cellIds } } } })
      await prisma.comment.deleteMany({ where: { cellId: { in: cellIds } } })
      await prisma.vote.deleteMany({ where: { cellId: { in: cellIds } } })
      await prisma.prediction.deleteMany({ where: { cellId: { in: cellIds } } })
      await prisma.cellParticipation.deleteMany({ where: { cellId: { in: cellIds } } })
      await prisma.cellIdea.deleteMany({ where: { cellId: { in: cellIds } } })
      await prisma.cell.deleteMany({ where: { id: { in: cellIds } } })
    }

    // Delete idea-related records
    if (testDelibIdeaIds.length > 0) {
      await prisma.notification.deleteMany({ where: { ideaId: { in: testDelibIdeaIds } } })
    }

    // Delete deliberation records
    await prisma.deliberationMember.deleteMany({ where: { deliberationId: { in: deliberationIds } } })
    await prisma.idea.deleteMany({ where: { deliberationId: { in: deliberationIds } } })
    await prisma.deliberation.deleteMany({ where: { id: { in: deliberationIds } } })
  }

  // 1. Delete votes BY test users
  await prisma.commentUpvote.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.vote.deleteMany({ where: { userId: { in: userIds } } })

  // 2. Delete records referencing test user ideas (from any user)
  if (ideaIds.length > 0) {
    await prisma.vote.deleteMany({ where: { ideaId: { in: ideaIds } } })
    await prisma.prediction.deleteMany({ where: { predictedIdeaId: { in: ideaIds } } })
    await prisma.cellIdea.deleteMany({ where: { ideaId: { in: ideaIds } } })
    // Notifications may also reference ideas
    await prisma.notification.deleteMany({ where: { ideaId: { in: ideaIds } } })
  }

  // 3. Delete other related records
  await prisma.comment.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.cellParticipation.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.deliberationMember.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.idea.deleteMany({ where: { authorId: { in: userIds } } })
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.pushSubscription.deleteMany({ where: { userId: { in: userIds } } })

  // Now delete the users
  const result = await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  })

  addTestLog(`Cleanup complete: deleted ${result.count} test users`)
  return result.count
}
