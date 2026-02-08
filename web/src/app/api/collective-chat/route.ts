import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callClaudeWithTools } from '@/lib/claude'
import type { ToolDefinition } from '@/lib/claude'
import { checkRateLimit, incrementChatStrike } from '@/lib/rate-limit'


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
      select: { id: true, name: true, subscriptionTier: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await req.json()
    const { message } = body

    const limited = await checkRateLimit('collective_chat', user.id)
    if (limited) {
      const { strike, mutedUntil } = incrementChatStrike(user.id)
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
    const codebaseKeywords = /\b(code|codebase|source|github|how.*(work|built|made)|architecture|algorithm|open.?source|repo|whitepaper|spec|voting.*(logic|system)|tiered|cells?|tiers?)\b/i
    const includeCodebase = codebaseKeywords.test(message.trim())

    const codebaseContext = includeCodebase ? `

CODEBASE & ARCHITECTURE (open source: https://github.com/GalenGoodwick/unitychant):
- Next.js 15 (App Router) + Prisma ORM + PostgreSQL (Neon) + Tailwind CSS v4, deployed on Vercel
- Core: web/src/lib/voting.ts (tiered voting), web/src/lib/challenge.ts (rolling mode)
- 10 XP point distribution voting — voters spread 10 XP across ideas in their cell
- Cells of 5 people × 5 ideas — winners advance tier by tier
- "Chants" = collaborative edits: anyone proposes, 30% of cell confirms → text updates across all cells
- Scale: 5 people = 2 tiers, 1M people = 9 tiers, 8B = 14 tiers
- Upvotes expire after 24h to keep feed relevant. Chants with 100+ ideas become permanent.
- Whitepaper at /whitepaper, How It Works at /how-it-works
` : ''

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
PLATFORM PAGES:
- /chants — Browse all chants
- /chants/new — Create a new chant
- /feed — Your personalized feed
- /groups — Communities/groups
- /podiums — Long-form writing
- /how-it-works — How Unity Chant works
- /whitepaper — Full whitepaper
- /terms — Terms of Service
- /privacy — Privacy Policy
- /profile — Your profile
- /pricing — Pro subscription info
- /donate — Support the project

ACTION FORMAT:
Embed clickable actions: [action:navigate:/path]Button Label[/action]

BEHAVIOR:
- Be concise (2-3 sentences unless asked for more)
- On first message or greeting, proactively tell user what they should do based on pending actions
- If no pending actions, suggest browsing active chants or creating one
- Use action buttons naturally in responses
- Reference specific chants, ideas, discussions, and podium posts when relevant
- You CAN create chants for users using the create_chant tool. When a user wants to start a new deliberation, use the tool with a clear, concise question. Confirm with the user what question they want before creating.
- When referencing chants, use action buttons so users can navigate directly.
- You CANNOT cast votes, submit ideas, or change user settings.
- When users ask about how the platform works, reference /how-it-works and /whitepaper.`

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

    // Tools
    const tools: ToolDefinition[] = [
      {
        name: 'create_chant',
        description: 'Create a new Chant (deliberation) on the platform for the user. Use when the user wants to start a new discussion topic.',
        input_schema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The deliberation question. Should be clear, concise, and framed as a question.',
            },
          },
          required: ['question'],
        },
      },
    ]

    let reply: string
    let createdTalk: { id: string; question: string } | null = null
    try {
      const result = await callClaudeWithTools(systemPrompt, conversationHistory, 'haiku', tools)
      reply = result.text

      if (result.toolUse?.toolName === 'create_chant') {
        const question = result.toolUse.toolInput.question as string
        if (question && question.trim().length > 0 && question.trim().length <= 2000) {
          try {
            const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
            const submissionDurationMs = 86400000
            const newTalk = await prisma.deliberation.create({
              data: {
                creatorId: user.id,
                question: question.trim(),
                isPublic: true,
                phase: 'SUBMISSION',
                accumulationEnabled: true,
                submissionDurationMs,
                votingTimeoutMs: 3600000,
                secondVoteTimeoutMs: 900000,
                accumulationTimeoutMs: 86400000,
                inviteCode,
                submissionEndsAt: new Date(Date.now() + submissionDurationMs),
              },
            })

            await prisma.deliberationMember.create({
              data: {
                deliberationId: newTalk.id,
                userId: user.id,
                role: 'CREATOR',
              },
            })

            createdTalk = { id: newTalk.id, question: newTalk.question }
            if (!reply.includes(newTalk.id)) {
              reply = reply
                ? `${reply}\n\nI've created your chant: [action:navigate:/chants/${newTalk.id}]${newTalk.question}[/action]`
                : `I've created your chant: [action:navigate:/chants/${newTalk.id}]${newTalk.question}[/action]`
            }
          } catch (talkError) {
            console.error('[Collective] Chant creation failed:', talkError)
            reply = reply
              ? `${reply}\n\n(I tried to create the chant but ran into an issue. You can create it manually.) [action:navigate:/chants/new]Create Chant[/action]`
              : 'I tried to create a chant for you but ran into an issue. [action:navigate:/chants/new]Create Chant Manually[/action]'
          }
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
