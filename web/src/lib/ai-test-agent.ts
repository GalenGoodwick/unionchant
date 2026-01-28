/**
 * AI Test Agent System
 *
 * Simulates realistic user behavior for load testing using Haiku.
 * Agents interact via actual API endpoints like real users.
 */

import { prisma } from './prisma'

// Lazy load Anthropic SDK to avoid build failures when not installed
let anthropic: any = null
async function getAnthropic() {
  if (!anthropic) {
    try {
      // @ts-ignore - Dynamic import, SDK may not be installed
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      anthropic = new Anthropic()
    } catch {
      throw new Error('Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk')
    }
  }
  return anthropic
}

export interface AgentConfig {
  totalAgents: number
  votingTimePerTierMs: number // e.g., 30000 for 30 seconds
  dropoutRate: number // 0-1, percentage who don't vote
  commentRate: number // 0-1, percentage who comment
  upvoteRate: number // 0-1, percentage who upvote comments
  newJoinRate: number // 0-1, percentage of new joins mid-voting
  forceStartVoting?: boolean // Force start voting even if trigger not met
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
let testProgress: TestProgress = {
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

// Flag to stop test early
let shouldStopTest = false

export function stopTest() {
  shouldStopTest = true
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
  shouldStopTest = false  // Reset stop flag
  testProgress = {
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

/**
 * Create test agent users
 */
export async function createTestAgents(count: number, prefix: string = 'TestBot'): Promise<string[]> {
  const userIds: string[] = []
  const timestamp = Date.now()

  for (let i = 0; i < count; i++) {
    // Check for stop every 10 agents
    if (shouldStopTest && i % 10 === 0) {
      addTestLog(`Stopped after creating ${i} agents`)
      break
    }
    try {
      const user = await prisma.user.create({
        data: {
          email: `${prefix.toLowerCase()}-${timestamp}-${i}@test.bot`,
          name: `${prefix} ${i + 1}`,
          status: 'ACTIVE',
        },
      })
      userIds.push(user.id)
      testProgress.agentsCreated++
    } catch (err) {
      testProgress.errors.push(`Failed to create agent ${i}: ${err}`)
    }
  }

  return userIds
}

/**
 * Generate multiple ideas in a single batch using Haiku (much faster than individual calls)
 */
export async function generateIdeasBatch(question: string, count: number, existingIdeas: string[] = []): Promise<string[]> {
  try {
    const client = await getAnthropic()
    const existingContext = existingIdeas.length > 0
      ? `\n\nIdeas already submitted (don't repeat these):\n${existingIdeas.slice(-10).map(i => `- ${i}`).join('\n')}`
      : ''

    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are helping generate test ideas for a group deliberation. The question is: "${question}"${existingContext}

Generate exactly ${count} different brief ideas (1-2 sentences each). Be creative and varied. Format as a numbered list:
1. [idea]
2. [idea]
...`
      }],
    })

    const text = response.content[0]
    if (text.type === 'text') {
      // Parse numbered list
      const lines = text.text.split('\n')
      const ideas: string[] = []
      for (const line of lines) {
        const match = line.match(/^\d+\.\s*(.+)$/)
        if (match && match[1].trim()) {
          ideas.push(match[1].trim())
        }
      }
      // Return what we got, or fallback
      if (ideas.length > 0) return ideas.slice(0, count)
    }
  } catch (err) {
    addTestLog(`Haiku API error: ${err instanceof Error ? err.message : String(err)}`)
    // Fall through to fallback
  }

  // Fallback: generate simple random ideas
  return Array.from({ length: count }, (_, i) => `Test idea ${Date.now()}-${i}: A reasonable approach to consider for this question.`)
}

/**
 * Use Haiku to generate a realistic idea for a deliberation question (single)
 */
export async function generateIdea(question: string, existingIdeas: string[] = []): Promise<string> {
  const ideas = await generateIdeasBatch(question, 1, existingIdeas)
  return ideas[0] || 'A reasonable approach to consider'
}

/**
 * Use Haiku to decide which idea to vote for
 */
export async function decideVote(question: string, ideas: { id: string; text: string }[]): Promise<string> {
  const client = await getAnthropic()
  const ideasList = ideas.map((idea, i) => `${i + 1}. ${idea.text}`).join('\n')

  const response = await client.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 50,
    messages: [{
      role: 'user',
      content: `You are voting in a deliberation. The question is: "${question}"

Options:
${ideasList}

Which number would you vote for? Consider quality, feasibility, and how well it answers the question. Respond with just the number (1-${ideas.length}).`
    }],
  })

  const text = response.content[0]
  if (text.type === 'text') {
    const match = text.text.match(/\d+/)
    if (match) {
      const index = parseInt(match[0]) - 1
      if (index >= 0 && index < ideas.length) {
        return ideas[index].id
      }
    }
  }
  // Random fallback
  return ideas[Math.floor(Math.random() * ideas.length)].id
}

/**
 * Use Haiku to generate a comment
 */
export async function generateComment(
  question: string,
  ideas: { id: string; text: string }[],
  existingComments: string[] = []
): Promise<string> {
  const client = await getAnthropic()
  const ideasList = ideas.map(idea => `- ${idea.text}`).join('\n')
  const commentsContext = existingComments.length > 0
    ? `\n\nRecent comments:\n${existingComments.slice(-3).map(c => `- "${c}"`).join('\n')}`
    : ''

  const response = await client.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: `You are in a group discussion about: "${question}"

The ideas being considered:
${ideasList}${commentsContext}

Write a brief, constructive comment (1-2 sentences). You might support an idea, ask a question, or add a perspective. Just respond with the comment text.`
    }],
  })

  const text = response.content[0]
  if (text.type === 'text') {
    return text.text.trim()
  }
  return 'Interesting points to consider here.'
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
  text: string
): Promise<string | null> {
  try {
    const comment = await prisma.comment.create({
      data: {
        cellId,
        userId,
        text,
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
    const deliberationTier = comment.cell.deliberation.currentTier

    if (updated.upvoteCount >= threshold && updated.reachTier < deliberationTier) {
      // Up-pollinate!
      const newTier = Math.min(updated.reachTier + 1, deliberationTier)
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
 * - participantGoal set → trigger by participants
 * - Neither set → trigger by timer (submissionEndsAt)
 */
function checkVotingTrigger(deliberation: {
  ideaGoal: number | null
  participantGoal: number | null
  submissionEndsAt: Date | null
  ideas: unknown[]
  members: unknown[]
}): boolean {
  // Check idea goal trigger
  if (deliberation.ideaGoal && deliberation.ideas.length >= deliberation.ideaGoal) {
    return true
  }

  // Check participant goal trigger
  if (deliberation.participantGoal && deliberation.members.length >= deliberation.participantGoal) {
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
  resetTestProgress()
  testProgress.phase = 'setup'

  const reportProgress = () => {
    if (onProgress) onProgress(getTestProgress())
  }

  try {
    addTestLog('Starting test...')

    // 0. Auto-cleanup old test agents first
    const existingCount = await prisma.user.count({
      where: {
        AND: [
          { email: { contains: 'testbot-' } },
          { email: { endsWith: '@test.bot' } },
        ],
      },
    })
    if (existingCount > 0) {
      addTestLog(`Cleaning up ${existingCount} existing test agents...`)
      await cleanupTestAgents()
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

    // If already in VOTING, skip agent creation - just vote for existing participants
    if (deliberation.phase === 'VOTING') {
      addTestLog('Already in VOTING phase - skipping agent creation')
      testProgress.phase = 'voting'
      // Will proceed directly to voting loop below
    }

    // For other phases, create agents
    let agentIds: string[] = []
    if (deliberation.phase !== 'VOTING') {
      // 2. Create test agents
      addTestLog(`Creating ${config.totalAgents} test agents...`)
      agentIds = await createTestAgents(config.totalAgents, 'TestBot')
      addTestLog(`Created ${agentIds.length} agents`)
      reportProgress()

      // Check for stop
      if (shouldStopTest) {
        addTestLog('Test stopped by user')
        testProgress.phase = 'completed'
        return getTestProgress()
      }

      // 3. Join all agents to the deliberation
      addTestLog('Joining agents to deliberation...')
      for (const agentId of agentIds) {
        await joinDeliberation(deliberationId, agentId)
      }
      addTestLog('All agents joined')
      reportProgress()

      // Check for stop
      if (shouldStopTest) {
        addTestLog('Test stopped by user')
        testProgress.phase = 'completed'
        return getTestProgress()
      }
    }

    // 4. Handle different phases
    if (deliberation.phase === 'SUBMISSION') {
      testProgress.phase = 'submission'
      addTestLog('Submission phase - generating ideas...')

      const existingIdeas = deliberation.ideas.map(i => i.text)

      // Generate all ideas in one batch (much faster than individual calls)
      const ideaCount = agentIds.length
      addTestLog(`Generating ${ideaCount} ideas in batch via Haiku...`)
      const generatedIdeas = await generateIdeasBatch(deliberation.question, ideaCount, existingIdeas)
      addTestLog(`Got ${generatedIdeas.length} ideas, submitting...`)

      // Submit ideas for all agents
      for (let i = 0; i < agentIds.length; i++) {
        if (shouldStopTest) {
          addTestLog('Test stopped by user during idea submission')
          testProgress.phase = 'completed'
          return getTestProgress()
        }
        const ideaText = generatedIdeas[i] || `Test idea ${i + 1} for: ${deliberation.question.slice(0, 50)}`
        await submitIdea(deliberationId, agentIds[i], ideaText)
        testProgress.ideasSubmitted = i + 1
        reportProgress()
      }

      // Check voting trigger
      const updatedDelib = await prisma.deliberation.findUnique({
        where: { id: deliberationId },
        select: {
          ideaGoal: true,
          participantGoal: true,
          submissionEndsAt: true,
          ideas: true,
          members: true,
        },
      })

      if (updatedDelib) {
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
          const triggerType = updatedDelib.ideaGoal ? 'ideas' :
                              updatedDelib.participantGoal ? 'participants' : 'timer'
          addTestLog(`Trigger (${triggerType}) not met - Ideas: ${updatedDelib.ideas.length}/${updatedDelib.ideaGoal || 'N/A'}`)

          // For testing purposes, force-start if manual or waiting
          if (config.forceStartVoting) {
            addTestLog('Force-starting voting...')
            const result = await startVotingPhase(deliberationId)
            addTestLog(`startVotingPhase result: ${result.success ? 'SUCCESS' : `FAILED: ${result.reason}`}`)
            if (!result.success) {
              testProgress.errors.push(`Voting failed to start: ${result.reason} - ${result.message}`)
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

      addTestLog(`Generating ${challengerCount} challenger ideas in batch...`)
      const generatedIdeas = await generateIdeasBatch(deliberation.question, challengerCount, existingIdeas)

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

      // Get current state
      const currentDelib = await prisma.deliberation.findUnique({
        where: { id: deliberationId },
        include: {
          cells: {
            where: { status: 'VOTING' },
            include: {
              ideas: { include: { idea: true } },
              participants: true,
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

      // Process each cell
      for (const cell of currentDelib.cells) {
        const allParticipantIds = cell.participants.map(p => p.userId)

        const ideas = cell.ideas.map(ci => ({
          id: ci.idea.id,
          text: ci.idea.text,
        }))

        if (ideas.length === 0) {
          addTestLog(`Skipping cell - no ideas`)
          continue
        }

        addTestLog(`Voting in cell: ${allParticipantIds.length} participants, ${ideas.length} ideas`)

        // Vote for ALL participants to ensure cell completes
        // Use random voting for speed (AI voting is slow)
        for (const participantId of allParticipantIds) {
          // Check if this participant already voted
          const existingVote = await prisma.vote.findFirst({
            where: { cellId: cell.id, userId: participantId },
          })
          if (existingVote) continue

          // Random vote for speed
          const chosenIdeaId = ideas[Math.floor(Math.random() * ideas.length)].id
          await castVote(cell.id, participantId, chosenIdeaId)
        }

        // Add comments based on commentRate
        const numCommenters = Math.max(1, Math.floor(allParticipantIds.length * config.commentRate))
        const commenters = allParticipantIds.slice(0, numCommenters)
        for (const commenterId of commenters) {
          const commentText = `Test comment on "${ideas[0].text.slice(0, 30)}..." - this is a thoughtful observation.`
          await postComment(cell.id, commenterId, commentText)
        }

        // Upvote comments based on upvoteRate
        const cellComments = await prisma.comment.findMany({
          where: { cellId: cell.id },
        })
        if (cellComments.length > 0 && config.upvoteRate > 0) {
          // Each non-commenter may upvote based on rate
          const potentialUpvoters = allParticipantIds.slice(numCommenters)
          for (const upvoterId of potentialUpvoters) {
            if (Math.random() < config.upvoteRate) {
              // Pick a random comment to upvote
              const randomComment = cellComments[Math.floor(Math.random() * cellComments.length)]
              await upvoteComment(randomComment.id, upvoterId)
            }
          }
        }

        reportProgress()
      }

      // Process cell results - force completion with timeout flag if needed
      addTestLog(`Processing tier ${tierCount} results...`)
      const { processCellResults } = await import('./voting')

      for (const cell of currentDelib.cells) {
        // Force process with timeout=true to ensure completion even if somehow votes are missing
        await processCellResults(cell.id, true)
      }
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
  }
}

/**
 * Clean up test data - deletes users and all their related records
 */
export async function cleanupTestAgents(prefix: string = 'TestBot'): Promise<number> {
  // Find all test agent user IDs
  const testUsers = await prisma.user.findMany({
    where: {
      AND: [
        { email: { contains: `${prefix.toLowerCase()}-` } },
        { email: { endsWith: '@test.bot' } },
      ],
    },
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
