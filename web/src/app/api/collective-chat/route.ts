import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callClaudeWithTools } from '@/lib/claude'
import type { ToolDefinition } from '@/lib/claude'
import { checkRateLimit, incrementChatStrike } from '@/lib/rate-limit'
import { ARCHITECTURE_MAP } from '@/lib/architecture-map'
import { moderateContent } from '@/lib/moderation'
import { fireWebhookEvent } from '@/lib/webhooks'


// GET /api/collective-chat - Returns per-user messages
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const { searchParams } = new URL(req.url)
    const before = searchParams.get('before')

    if (!session?.user?.email) {
      return NextResponse.json({ messages: [], hasMore: false })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ messages: [], hasMore: false })
    }

    const whereClause = {
      OR: [
        { userId: user.id, isPrivate: true },
        { replyToUserId: user.id, isPrivate: true },
      ],
    }

    let messages
    if (before) {
      messages = await prisma.collectiveMessage.findMany({
        where: {
          ...whereClause,
          createdAt: { lt: new Date(before) },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      messages.reverse()
    } else {
      messages = await prisma.collectiveMessage.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      messages.reverse()
    }

    const hasMore = messages.length === 50

    return NextResponse.json({ messages, hasMore })
  } catch (error) {
    console.error('[Collective] GET error:', error)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }
}

// POST /api/collective-chat - Send a message and get AI guide response
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Sign in to chat with the collective' },
        { status: 401 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, name: true, subscriptionTier: true, isAnonymous: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await req.json()
    const { message } = body

    const limited = await checkRateLimit('collective_chat', user.id)
    if (limited) {
      const { strike, mutedUntil } = incrementChatStrike(user.id)
      // Trigger challenge on spam — nulls lastChallengePassedAt so next poll pops it
      prisma.user.update({ where: { id: user.id }, data: { lastChallengePassedAt: null } }).catch(() => {})
      if (mutedUntil) {
        return NextResponse.json({
          error: 'MUTED',
          mutedUntil,
          message: 'You have been temporarily muted.',
        }, { status: 429 })
      }
      return NextResponse.json({
        error: 'RATE_LIMITED',
        strike,
        message: 'Too many messages. Please slow down.',
      }, { status: 429 })
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    if (message.trim().length > 2000) {
      return NextResponse.json({ error: 'Message too long (max 2000 characters)' }, { status: 400 })
    }

    // Daily message cap: 5/day for free users, 50 welcome bonus, unlimited Pro+
    const FREE_DAILY_LIMIT = 5
    const WELCOME_BONUS = 50
    if (user.subscriptionTier === 'free') {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const [todayCount, totalCount] = await Promise.all([
        prisma.collectiveMessage.count({
          where: { userId: user.id, role: 'user', createdAt: { gte: todayStart } },
        }),
        prisma.collectiveMessage.count({
          where: { userId: user.id, role: 'user' },
        }),
      ])

      // Welcome bonus: first 50 lifetime messages are free regardless of daily cap
      if (totalCount >= WELCOME_BONUS && todayCount >= FREE_DAILY_LIMIT) {
        return NextResponse.json({
          error: 'DAILY_LIMIT',
          dailyLimit: FREE_DAILY_LIMIT,
          used: todayCount,
          message: `You've used all ${FREE_DAILY_LIMIT} messages for today. Upgrade to Pro for unlimited access.`,
        }, { status: 429 })
      }
    }

    // Save user message (always private)
    const userMessage = await prisma.collectiveMessage.create({
      data: {
        role: 'user',
        content: message.trim(),
        userName: user.name || 'Anonymous',
        userId: user.id,
        model: 'haiku',
        isPrivate: true,
      },
    })

    // Build user-specific + platform-wide context
    const [userCells, userMemberships, allTalks, platformStats, recentIdeas, recentCellComments, recentPodiums] = await Promise.all([
      // 1. User's active cells (voting/deliberating)
      prisma.cellParticipation.findMany({
        where: { userId: user.id, cell: { status: { in: ['VOTING', 'DELIBERATING'] } } },
        select: {
          cell: {
            select: {
              id: true, status: true, tier: true,
              deliberation: { select: { id: true, question: true, phase: true } },
              votes: { where: { userId: user.id }, select: { id: true }, take: 1 },
            },
          },
        },
      }).catch(e => { console.error('[Collective] cells query failed:', e.message); return [] }),
      // 2. User's memberships
      prisma.deliberationMember.findMany({
        where: { userId: user.id },
        select: {
          deliberation: {
            select: { id: true, question: true, phase: true, _count: { select: { members: true, ideas: true } } },
          },
        },
        take: 10,
      }).catch(e => { console.error('[Collective] memberships query failed:', e.message); return [] }),
      // 3. All chants (detailed)
      prisma.deliberation.findMany({
        where: { isPublic: true },
        orderBy: { updatedAt: 'desc' },
        take: 25,
        select: {
          id: true, question: true, phase: true, currentTier: true, challengeRound: true,
          isShowcase: true, upvoteCount: true, createdAt: true,
          _count: { select: { members: true, ideas: true } },
          ideas: {
            orderBy: { totalXP: 'desc' },
            take: 5,
            select: { text: true, totalXP: true, totalVotes: true, status: true, author: { select: { name: true, isAI: true } } },
          },
          creator: { select: { name: true } },
        },
      }).catch(e => { console.error('[Collective] chants query failed:', e.message); return [] }),
      // 4. Platform stats
      Promise.all([
        prisma.user.count({ where: { isAI: false } }).catch(() => 0),
        prisma.deliberation.count({ where: { isPublic: true } }).catch(() => 0),
        prisma.idea.count().catch(() => 0),
        prisma.vote.count().catch(() => 0),
      ]),
      // 5. Recent ideas (last 24h)
      prisma.idea.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          text: true, totalXP: true, status: true,
          author: { select: { name: true, isAI: true } },
          deliberation: { select: { question: true } },
        },
      }).catch(e => { console.error('[Collective] ideas query failed:', e.message); return [] }),
      // 6. Recent cell discussion
      prisma.comment.findMany({
        where: { cell: { status: { in: ['DELIBERATING', 'VOTING'] } } },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          text: true,
          user: { select: { name: true } },
          cell: { select: { deliberation: { select: { question: true } } } },
        },
      }).catch(e => { console.error('[Collective] comments query failed:', e.message); return [] }),
      // 7. Recent podiums
      prisma.podium.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, title: true, views: true,
          author: { select: { name: true } },
          deliberation: { select: { question: true } },
        },
      }).catch(e => { console.error('[Collective] podiums query failed:', e.message); return [] }),
    ])

    const [totalUsers, totalTalks, totalIdeas, totalVotes] = platformStats

    // Build userActions summary
    const actionLines: string[] = []
    for (const cp of userCells) {
      const c = cp.cell
      const hasVoted = c.votes.length > 0
      if (c.status === 'VOTING' && !hasVoted) {
        actionLines.push(`- VOTE NOW in "${c.deliberation.question}" (Tier ${c.tier}) [action:navigate:/chants/${c.deliberation.id}]Vote Now[/action]`)
      } else if (c.status === 'DELIBERATING') {
        actionLines.push(`- DISCUSS in "${c.deliberation.question}" (Tier ${c.tier}) [action:navigate:/chants/${c.deliberation.id}]Join Discussion[/action]`)
      } else if (c.status === 'VOTING' && hasVoted) {
        actionLines.push(`- WAITING for results in "${c.deliberation.question}" (Tier ${c.tier})`)
      }
    }
    for (const m of userMemberships) {
      const d = m.deliberation
      if (d.phase === 'SUBMISSION') {
        const alreadyListed = actionLines.some(l => l.includes(d.id))
        if (!alreadyListed) {
          actionLines.push(`- SUBMIT IDEAS to "${d.question}" (${d._count.ideas} ideas so far) [action:navigate:/chants/${d.id}]Submit Idea[/action]`)
        }
      }
    }
    const userActions = actionLines.length > 0 ? actionLines.join('\n') : '(No pending actions — browse chants or create one!)'

    // Build memberships context
    const membershipLines = userMemberships.map(m => {
      const d = m.deliberation
      return `- "${d.question}" [${d.phase}] — ${d._count.members} members, ${d._count.ideas} ideas [action:navigate:/chants/${d.id}]Go to Chant[/action]`
    })
    const membershipsContext = membershipLines.length > 0 ? membershipLines.join('\n') : '(You haven\'t joined any chants yet)'

    // Format all chants (detailed)
    const talksContext = allTalks.map(t => {
      const topIdea = t.ideas[0]
      const winner = t.ideas.find(i => i.status === 'WINNER')
      return `- "${t.question}" [${t.phase}${t.currentTier > 1 ? ` T${t.currentTier}` : ''}] — ${t._count.members} members, ${t._count.ideas} ideas, ${t.upvoteCount} upvotes${winner ? `, WINNER: "${winner.text}"` : topIdea ? `, top: "${topIdea.text}" (${topIdea.totalXP} XP)` : ''} (by ${t.creator?.name || 'Anonymous'}) [action:navigate:/chants/${t.id}]Explore[/action]`
    }).join('\n') || '(No chants yet)'

    // Format recent ideas
    const ideasContext = recentIdeas
      .map(i => `- "${i.text}" (${i.totalXP} XP, ${i.status}) in "${i.deliberation.question}" by ${i.author.name || 'Anonymous'}${i.author.isAI ? ' [AI]' : ''}`)
      .join('\n') || '(none today)'

    // Format recent discussion
    const discussionContext = recentCellComments
      .map(c => `- ${c.user.name || 'Anonymous'} (re: "${c.cell.deliberation.question}"): ${c.text}`)
      .join('\n') || '(no active discussion)'

    // Format podiums
    const podiumsContext = recentPodiums
      .map(p => `- "${p.title}" by ${p.author.name || 'Anonymous'} (${p.views} views)${p.deliberation ? ` — linked to "${p.deliberation.question}"` : ''} [action:navigate:/podium/${p.id}]Read[/action]`)
      .join('\n') || '(no podium posts yet)'

    // Detect if user is asking about the codebase / how it works
    const codebaseKeywords = /\b(code|codebase|source|github|how.*(work|built|made)|architecture|algorithm|open.?source|repo|whitepaper|spec|voting.*(logic|system|engine)|tiered|cells?|tiers?|xp|upvot|up.?pollinat|rolling|accumul|challenge|subscription|stripe|pricing)\b/i
    const includeCodebase = codebaseKeywords.test(message.trim())

    const codebaseContext = includeCodebase ? `\n${ARCHITECTURE_MAP}\n` : ''

    const userName = user.name || 'Anonymous'

    const systemPrompt = `You are the Collective — the consciousness of Unity Chant, a living deliberation platform where humanity reaches consensus through small-group discussion and tiered voting.

You are speaking privately with ${userName}.

PLATFORM STATUS:
- ${totalUsers} registered users, ${totalTalks} chants, ${totalIdeas} total ideas, ${totalVotes} total votes cast

YOUR PENDING ACTIONS:
${userActions}

YOUR MEMBERSHIPS:
${membershipsContext}

ALL CHANTS:
${talksContext}

RECENT IDEAS (last 24h):
${ideasContext}

RECENT CELL DISCUSSION:
${discussionContext}

PODIUM POSTS:
${podiumsContext}
${codebaseContext}
ACTION FORMAT:
The ONLY action tag format is: [action:navigate:/path]Button Label[/action]
This creates a clickable navigation button. The path MUST start with / and be a valid page route.
Examples: [action:navigate:/chants/abc123]View Chant[/action] or [action:navigate:/chants/new]Create Chant[/action]
NEVER use any other action format like [action:create_chant] — that does NOT work and will show as broken text.

BEHAVIOR:
- Be concise (2-3 sentences unless asked for more)
- On first message or greeting, proactively tell user what they should do based on pending actions
- If no pending actions, suggest browsing active chants or creating one
- Use action buttons naturally in responses
- Reference specific chants, ideas, discussions, and podium posts when relevant
- You have TOOLS to take actions on behalf of the user: create_chant, join_chant, submit_idea, post_comment, vote.
- Use tools when the user asks you to do something. Confirm before voting (it's irreversible).
- When referencing chants, use [action:navigate:/chants/ID] buttons so users can navigate directly.
- When users ask about how the platform works, reference /how-it-works and /whitepaper.
- All votes are equal — there is NO reputation-based voting influence. Every person's 10 XP counts the same.
- Upvotes on chants do NOT expire. They are permanent.
- NEVER fabricate features that don't exist. If unsure, say you don't know.
- NEVER mention "30% consensus", "upvote expiration", or "reputation-based voting". These do NOT exist.`

    // Get per-user conversation history
    const recentMessages = await prisma.collectiveMessage.findMany({
      where: {
        OR: [
          { userId: user.id, isPrivate: true },
          { replyToUserId: user.id, isPrivate: true },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    // Build conversation history with alternating roles
    const rawHistory = recentMessages
      .reverse()
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
      .filter(m => m.content && m.content.trim().length > 0)

    const conversationHistory: { role: 'user' | 'assistant'; content: string }[] = []
    for (const msg of rawHistory) {
      const last = conversationHistory[conversationHistory.length - 1]
      if (last && last.role === msg.role) {
        last.content += '\n' + msg.content
      } else {
        conversationHistory.push({ ...msg })
      }
    }
    if (conversationHistory.length > 0 && conversationHistory[0].role === 'assistant') {
      conversationHistory.shift()
    }

    // Tools — the AI can take actions on behalf of the user
    const tools: ToolDefinition[] = [
      {
        name: 'create_chant',
        description: 'Create a new Chant (deliberation) on the platform for the user. Use when the user wants to start a new discussion topic.',
        input_schema: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'The deliberation question. Clear, concise, framed as a question.' },
          },
          required: ['question'],
        },
      },
      {
        name: 'join_chant',
        description: 'Join an existing chant so the user can participate. Use when user wants to join a specific chant.',
        input_schema: {
          type: 'object',
          properties: {
            chantId: { type: 'string', description: 'The ID of the chant to join.' },
          },
          required: ['chantId'],
        },
      },
      {
        name: 'submit_idea',
        description: 'Submit an idea to a chant the user has joined. Auto-joins if not a member. Use when user wants to propose something.',
        input_schema: {
          type: 'object',
          properties: {
            chantId: { type: 'string', description: 'The ID of the chant to submit to.' },
            text: { type: 'string', description: 'The idea text. Should be clear and actionable.' },
          },
          required: ['chantId', 'text'],
        },
      },
      {
        name: 'post_comment',
        description: 'Post a comment in the user\'s active cell discussion. Use when user wants to discuss or argue for/against an idea.',
        input_schema: {
          type: 'object',
          properties: {
            chantId: { type: 'string', description: 'The ID of the chant.' },
            text: { type: 'string', description: 'The comment text.' },
            ideaId: { type: 'string', description: 'Optional: ID of a specific idea to comment on.' },
          },
          required: ['chantId', 'text'],
        },
      },
      {
        name: 'vote',
        description: 'Cast a vote in the user\'s active voting cell. Allocates exactly 10 XP across ideas. ONLY use when the user explicitly asks to vote and specifies how to allocate points.',
        input_schema: {
          type: 'object',
          properties: {
            chantId: { type: 'string', description: 'The ID of the chant.' },
            allocations: {
              type: 'array',
              description: 'Array of {ideaId, points} objects. Points must sum to exactly 10.',
              items: {
                type: 'object',
                properties: {
                  ideaId: { type: 'string' },
                  points: { type: 'number', description: 'XP points (integer >= 1). All points must sum to 10.' },
                },
                required: ['ideaId', 'points'],
              },
            },
          },
          required: ['chantId', 'allocations'],
        },
      },
    ]

    // Tool execution — runs actions as the current user
    const executeTool = async (toolName: string, input: Record<string, unknown>): Promise<string> => {
      try {
        switch (toolName) {
          case 'create_chant': {
            const question = (input.question as string)?.trim()
            if (!question || question.length > 2000) return 'Invalid question (must be 1-2000 chars).'
            const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
            const newTalk = await prisma.deliberation.create({
              data: {
                creatorId: user.id, question, isPublic: true, phase: 'SUBMISSION',
                accumulationEnabled: true, votingTimeoutMs: 0, inviteCode,
              },
            })
            await prisma.deliberationMember.create({
              data: { deliberationId: newTalk.id, userId: user.id, role: 'CREATOR' },
            })
            return `Created chant "${question}" (ID: ${newTalk.id}). Link: [action:navigate:/chants/${newTalk.id}]View Chant[/action]`
          }

          case 'join_chant': {
            const chantId = input.chantId as string
            const delib = await prisma.deliberation.findUnique({
              where: { id: chantId },
              select: { id: true, question: true, allowAI: true },
            })
            if (!delib) return `Chant ${chantId} not found.`
            await prisma.deliberationMember.upsert({
              where: { deliberationId_userId: { deliberationId: chantId, userId: user.id } },
              update: {},
              create: { deliberationId: chantId, userId: user.id, role: 'PARTICIPANT' },
            })
            return `Joined "${delib.question}". [action:navigate:/chants/${chantId}]Go to Chant[/action]`
          }

          case 'submit_idea': {
            const chantId = input.chantId as string
            const text = (input.text as string)?.trim()
            if (!text || text.length > 2000) return 'Idea text must be 1-2000 characters.'
            const mod = moderateContent(text)
            if (!mod.allowed) return `Idea blocked by moderation: ${mod.reason}`
            const delib = await prisma.deliberation.findUnique({
              where: { id: chantId },
              select: { id: true, question: true, phase: true, ideaGoal: true },
            })
            if (!delib) return `Chant ${chantId} not found.`
            // Auto-join
            await prisma.deliberationMember.upsert({
              where: { deliberationId_userId: { deliberationId: chantId, userId: user.id } },
              update: {},
              create: { deliberationId: chantId, userId: user.id, role: 'PARTICIPANT' },
            })
            const status = delib.phase === 'SUBMISSION' ? 'SUBMITTED' : 'PENDING'
            const idea = await prisma.idea.create({
              data: { deliberationId: chantId, authorId: user.id, text, status, isNew: delib.phase !== 'SUBMISSION' },
            })
            fireWebhookEvent('idea_submitted', { deliberationId: chantId, ideaId: idea.id, text }).catch(() => {})
            return `Submitted idea "${text}" (status: ${status}) to "${delib.question}". [action:navigate:/chants/${chantId}]View Chant[/action]`
          }

          case 'post_comment': {
            const chantId = input.chantId as string
            const text = (input.text as string)?.trim()
            const ideaId = input.ideaId as string | undefined
            if (!text || text.length > 2000) return 'Comment must be 1-2000 characters.'
            const mod = moderateContent(text)
            if (!mod.allowed) return `Comment blocked: ${mod.reason}`
            // Find user's active cell
            const cell = await prisma.cell.findFirst({
              where: {
                deliberationId: chantId,
                status: { in: ['DELIBERATING', 'VOTING'] },
                participants: { some: { userId: user.id } },
              },
              orderBy: { tier: 'desc' },
              select: { id: true, tier: true },
            })
            if (!cell) return 'You don\'t have an active cell in this chant. You may need to join first or wait for voting to start.'
            const comment = await prisma.comment.create({
              data: { cellId: cell.id, userId: user.id, text, ideaId: ideaId || null },
            })
            return `Comment posted in Tier ${cell.tier} cell (ID: ${comment.id}).`
          }

          case 'vote': {
            const chantId = input.chantId as string
            const allocations = input.allocations as { ideaId: string; points: number }[]
            if (!allocations || allocations.length === 0) return 'No allocations provided.'
            const totalXP = allocations.reduce((sum, a) => sum + a.points, 0)
            if (totalXP !== 10) return `XP must sum to exactly 10 (got ${totalXP}).`
            if (allocations.some(a => a.points < 1 || !Number.isInteger(a.points))) return 'Each allocation must be a positive integer.'
            // Find voting cell
            const cell = await prisma.cell.findFirst({
              where: {
                deliberationId: chantId,
                status: 'VOTING',
                participants: { some: { userId: user.id } },
              },
              orderBy: { tier: 'desc' },
              select: { id: true, tier: true },
            })
            if (!cell) return 'No active voting cell found. You may not be in the voting phase yet.'
            // Validate ideas are in this cell
            const cellIdeaIds = (await prisma.cellIdea.findMany({
              where: { cellId: cell.id }, select: { ideaId: true },
            })).map(ci => ci.ideaId)
            for (const a of allocations) {
              if (!cellIdeaIds.includes(a.ideaId)) return `Idea ${a.ideaId} is not in your cell.`
            }
            // Delete existing votes and cast new ones
            await prisma.vote.deleteMany({ where: { cellId: cell.id, userId: user.id } })
            const now = new Date()
            for (const a of allocations) {
              const voteId = crypto.randomUUID().replace(/-/g, '').slice(0, 25)
              await prisma.$executeRawUnsafe(
                `INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt") VALUES ($1, $2, $3, $4, $5, $6)`,
                voteId, cell.id, user.id, a.ideaId, a.points, now
              )
            }
            // Update idea totals
            for (const a of allocations) {
              const agg = await prisma.vote.aggregate({ where: { cellId: cell.id, ideaId: a.ideaId }, _sum: { xpPoints: true }, _count: true })
              await prisma.idea.update({
                where: { id: a.ideaId },
                data: { totalXP: agg._sum.xpPoints || 0, totalVotes: agg._count },
              })
            }
            // Mark participant as voted
            await prisma.cellParticipation.updateMany({
              where: { cellId: cell.id, userId: user.id },
              data: { status: 'VOTED', votedAt: now },
            })
            fireWebhookEvent('vote_cast', { deliberationId: chantId, cellId: cell.id, userId: user.id }).catch(() => {})
            return `Vote cast in Tier ${cell.tier}! Allocated ${allocations.map(a => `${a.points}XP`).join(', ')} across ${allocations.length} ideas. [action:navigate:/chants/${chantId}]View Results[/action]`
          }

          default:
            return `Unknown tool: ${toolName}`
        }
      } catch (err) {
        console.error(`[Collective] Tool ${toolName} failed:`, err)
        return `Action failed: ${err instanceof Error ? err.message : 'unknown error'}`
      }
    }

    let reply: string
    let createdTalk: { id: string; question: string } | null = null
    try {
      const result = await callClaudeWithTools(systemPrompt, conversationHistory, 'haiku', tools)
      reply = result.text

      if (result.toolUse) {
        const toolResult = await executeTool(result.toolUse.toolName, result.toolUse.toolInput)
        // Append tool result to reply
        reply = reply
          ? `${reply}\n\n${toolResult}`
          : toolResult
        // Track created chant for response
        if (result.toolUse.toolName === 'create_chant' && toolResult.includes('ID: ')) {
          const idMatch = toolResult.match(/ID: ([a-z0-9]+)/)
          const qMatch = toolResult.match(/Created chant "(.+?)"/)
          if (idMatch && qMatch) createdTalk = { id: idMatch[1], question: qMatch[1] }
        }
      }
    } catch (aiError: unknown) {
      const errMsg = aiError instanceof Error ? aiError.message : 'AI service unavailable'
      console.error('[Collective] AI call failed:', errMsg)
      return NextResponse.json({
        error: errMsg.includes('ANTHROPIC_API_KEY')
          ? 'AI service not configured. Please contact the administrator.'
          : 'AI is temporarily unavailable. Please try again.',
        userMessageId: userMessage.id,
      }, { status: 503 })
    }

    if (!reply || !reply.trim()) {
      return NextResponse.json({
        reply: '',
        messageId: null,
        userMessageId: userMessage.id,
      })
    }

    const assistantMessage = await prisma.collectiveMessage.create({
      data: {
        role: 'assistant',
        content: reply.trim(),
        model: 'haiku',
        isPrivate: true,
        replyToUserId: user.id,
      },
    })

    return NextResponse.json({
      reply: reply.trim(),
      messageId: assistantMessage.id,
      userMessageId: userMessage.id,
      createdTalk,
    })
  } catch (error) {
    console.error('[Collective] POST error:', error)
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to process message: ${errMsg}` }, { status: 500 })
  }
}
