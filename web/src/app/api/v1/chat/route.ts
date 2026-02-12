import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '../auth'
import { v1RateLimit } from '../rate-limit'
import { prisma } from '@/lib/prisma'
import { callClaudeWithTools } from '@/lib/claude'
import type { ToolDefinition } from '@/lib/claude'
import { moderateContent } from '@/lib/moderation'
import { fireWebhookEvent } from '@/lib/webhooks'
import { sendEmail } from '@/lib/email'

// Debounce: only send one alert per 10 minutes
let lastAlertAt = 0
const ALERT_COOLDOWN = 10 * 60 * 1000

// POST /api/v1/chat — Natural language interface for agents
// Same AI + tools as the Collective Chat, but authenticated via API key
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const rateErr = v1RateLimit('v1_chat', auth.user.id)
    if (rateErr) return rateErr

    const { message } = await req.json()

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }
    if (message.trim().length > 2000) {
      return NextResponse.json({ error: 'message too long (max 2000)' }, { status: 400 })
    }

    const userId = auth.user.id
    const agentName = auth.user.name || 'agent'

    // Save inbound message
    const userMsg = await prisma.collectiveMessage.create({
      data: {
        role: 'user',
        content: message.trim(),
        userName: agentName,
        userId,
        model: 'agent',
        isPrivate: true,
      },
    })

    // Load context — agent's state + platform state
    const [agentCells, agentMemberships, allChants, platformStats] = await Promise.all([
      prisma.cellParticipation.findMany({
        where: { userId, cell: { status: { in: ['VOTING', 'DELIBERATING'] } } },
        select: {
          cell: {
            select: {
              id: true, status: true, tier: true,
              deliberation: { select: { id: true, question: true, phase: true } },
              votes: { where: { userId }, select: { id: true }, take: 1 },
              ideas: {
                select: { idea: { select: { id: true, text: true, totalXP: true, status: true } } },
              },
            },
          },
        },
      }).catch(() => []),
      prisma.deliberationMember.findMany({
        where: { userId },
        select: {
          deliberation: {
            select: { id: true, question: true, phase: true, _count: { select: { members: true, ideas: true } } },
          },
        },
        take: 20,
      }).catch(() => []),
      prisma.deliberation.findMany({
        where: { isPublic: true },
        orderBy: { updatedAt: 'desc' },
        take: 15,
        select: {
          id: true, question: true, phase: true, currentTier: true,
          _count: { select: { members: true, ideas: true } },
          ideas: {
            orderBy: { totalXP: 'desc' },
            take: 3,
            select: { id: true, text: true, totalXP: true, status: true },
          },
        },
      }).catch(() => []),
      Promise.all([
        prisma.user.count().catch(() => 0),
        prisma.deliberation.count({ where: { isPublic: true } }).catch(() => 0),
        prisma.idea.count().catch(() => 0),
        prisma.vote.count().catch(() => 0),
      ]),
    ])

    const [totalUsers, totalChants, totalIdeas, totalVotes] = platformStats

    // Build context strings
    const cellLines = agentCells.map(cp => {
      const c = cp.cell
      const hasVoted = c.votes.length > 0
      const ideas = c.ideas.map(ci => `"${ci.idea.text}" (id:${ci.idea.id}, ${ci.idea.totalXP}XP)`).join(', ')
      return `- [${c.status}] "${c.deliberation.question}" T${c.tier} cellId:${c.id} ${hasVoted ? '(voted)' : '(needs vote)'} ideas: [${ideas}]`
    }).join('\n') || '(none)'

    const memberLines = agentMemberships.map(m => {
      const d = m.deliberation
      return `- "${d.question}" [${d.phase}] id:${d.id} — ${d._count.members} members, ${d._count.ideas} ideas`
    }).join('\n') || '(none)'

    const chantLines = allChants.map(t => {
      const topIdeas = t.ideas.map(i => `"${i.text}" (id:${i.id}, ${i.totalXP}XP, ${i.status})`).join('; ')
      return `- "${t.question}" [${t.phase}] id:${t.id} — ${t._count.members} members, ${t._count.ideas} ideas. Top: ${topIdeas || 'none'}`
    }).join('\n') || '(none)'

    const systemPrompt = `You are Unity Chant's AI interface. You help AI agents participate in collective deliberations through natural language.

You are speaking with agent "${agentName}" (id: ${userId}).

PLATFORM: ${totalUsers} users, ${totalChants} chants, ${totalIdeas} ideas, ${totalVotes} votes

YOUR ACTIVE CELLS (vote/discuss here):
${cellLines}

YOUR MEMBERSHIPS:
${memberLines}

ALL CHANTS:
${chantLines}

TOOLS: You can take actions on behalf of this agent:
- create_chant: Start a new deliberation
- join_chant: Join a chant (needs chantId)
- submit_idea: Submit an idea (needs chantId + text)
- post_comment: Comment in active cell (needs chantId + text, optional ideaId)
- vote: Cast vote (needs chantId + allocations array, points must sum to 10)

RULES:
- Be concise and action-oriented
- When the agent asks to do something, USE THE TOOLS — don't just describe what they should do
- Include chant IDs and idea IDs in responses so the agent can reference them
- If the agent wants to vote, show them the ideas in their cell with IDs first, then vote
- If unsure what the agent wants, list available chants and suggest actions`

    // Get conversation history for this agent
    const history = await prisma.collectiveMessage.findMany({
      where: {
        OR: [
          { userId, model: 'agent', isPrivate: true },
          { replyToUserId: userId, model: 'agent', isPrivate: true },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const rawHistory = history.reverse().map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })).filter(m => m.content?.trim())

    // Ensure alternating roles
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
        description: 'Create a new deliberation.',
        input_schema: {
          type: 'object',
          properties: { question: { type: 'string' } },
          required: ['question'],
        },
      },
      {
        name: 'join_chant',
        description: 'Join a chant.',
        input_schema: {
          type: 'object',
          properties: { chantId: { type: 'string' } },
          required: ['chantId'],
        },
      },
      {
        name: 'submit_idea',
        description: 'Submit an idea to a chant. Auto-joins if needed.',
        input_schema: {
          type: 'object',
          properties: {
            chantId: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['chantId', 'text'],
        },
      },
      {
        name: 'post_comment',
        description: 'Post a comment in your active cell discussion.',
        input_schema: {
          type: 'object',
          properties: {
            chantId: { type: 'string' },
            text: { type: 'string' },
            ideaId: { type: 'string', description: 'Optional: specific idea to comment on.' },
          },
          required: ['chantId', 'text'],
        },
      },
      {
        name: 'vote',
        description: 'Cast a vote. Allocate exactly 10 XP across ideas.',
        input_schema: {
          type: 'object',
          properties: {
            chantId: { type: 'string' },
            allocations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  ideaId: { type: 'string' },
                  points: { type: 'number' },
                },
                required: ['ideaId', 'points'],
              },
            },
          },
          required: ['chantId', 'allocations'],
        },
      },
    ]

    // Execute tool
    const executeTool = async (toolName: string, input: Record<string, unknown>): Promise<string> => {
      try {
        switch (toolName) {
          case 'create_chant': {
            const question = (input.question as string)?.trim()
            if (!question || question.length > 2000) return 'Invalid question.'
            const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
            const newTalk = await prisma.deliberation.create({
              data: {
                creatorId: userId, question, isPublic: true, phase: 'SUBMISSION',
                accumulationEnabled: true, votingTimeoutMs: 0, inviteCode,
              },
            })
            await prisma.deliberationMember.create({
              data: { deliberationId: newTalk.id, userId, role: 'CREATOR' },
            })
            return `Created chant "${question}" (id: ${newTalk.id})`
          }

          case 'join_chant': {
            const chantId = input.chantId as string
            const delib = await prisma.deliberation.findUnique({
              where: { id: chantId }, select: { id: true, question: true, allowAI: true },
            })
            if (!delib) return `Chant ${chantId} not found.`
            if (!delib.allowAI && auth.user.isAI) return 'This chant does not allow AI agents.'
            await prisma.deliberationMember.upsert({
              where: { deliberationId_userId: { deliberationId: chantId, userId } },
              update: {},
              create: { deliberationId: chantId, userId, role: 'PARTICIPANT' },
            })
            return `Joined "${delib.question}" (id: ${chantId})`
          }

          case 'submit_idea': {
            const chantId = input.chantId as string
            const text = (input.text as string)?.trim()
            if (!text || text.length > 2000) return 'Idea must be 1-2000 chars.'
            const mod = moderateContent(text)
            if (!mod.allowed) return `Blocked: ${mod.reason}`
            const delib = await prisma.deliberation.findUnique({
              where: { id: chantId }, select: { id: true, question: true, phase: true },
            })
            if (!delib) return `Chant ${chantId} not found.`
            await prisma.deliberationMember.upsert({
              where: { deliberationId_userId: { deliberationId: chantId, userId } },
              update: {},
              create: { deliberationId: chantId, userId, role: 'PARTICIPANT' },
            })
            const status = delib.phase === 'SUBMISSION' ? 'SUBMITTED' : 'PENDING'
            const idea = await prisma.idea.create({
              data: { deliberationId: chantId, authorId: userId, text, status, isNew: delib.phase !== 'SUBMISSION' },
            })
            fireWebhookEvent('idea_submitted', { deliberationId: chantId, ideaId: idea.id, text }).catch(() => {})
            return `Idea submitted (id: ${idea.id}, status: ${status}) to "${delib.question}"`
          }

          case 'post_comment': {
            const chantId = input.chantId as string
            const text = (input.text as string)?.trim()
            const ideaId = input.ideaId as string | undefined
            if (!text || text.length > 2000) return 'Comment must be 1-2000 chars.'
            const mod = moderateContent(text)
            if (!mod.allowed) return `Blocked: ${mod.reason}`
            const cell = await prisma.cell.findFirst({
              where: {
                deliberationId: chantId,
                status: { in: ['DELIBERATING', 'VOTING'] },
                participants: { some: { userId } },
              },
              orderBy: { tier: 'desc' },
              select: { id: true, tier: true },
            })
            if (!cell) return 'No active cell in this chant.'
            const comment = await prisma.comment.create({
              data: { cellId: cell.id, userId, text, ideaId: ideaId || null },
            })
            return `Comment posted in T${cell.tier} (id: ${comment.id})`
          }

          case 'vote': {
            const chantId = input.chantId as string
            const allocations = input.allocations as { ideaId: string; points: number }[]
            if (!allocations?.length) return 'No allocations.'
            const totalXP = allocations.reduce((s, a) => s + a.points, 0)
            if (totalXP !== 10) return `XP must sum to 10 (got ${totalXP}).`
            if (allocations.some(a => a.points < 1 || !Number.isInteger(a.points))) return 'Points must be positive integers.'
            const cell = await prisma.cell.findFirst({
              where: {
                deliberationId: chantId, status: 'VOTING',
                participants: { some: { userId } },
              },
              orderBy: { tier: 'desc' },
              select: { id: true, tier: true },
            })
            if (!cell) return 'No voting cell found.'
            const cellIdeaIds = (await prisma.cellIdea.findMany({
              where: { cellId: cell.id }, select: { ideaId: true },
            })).map(ci => ci.ideaId)
            for (const a of allocations) {
              if (!cellIdeaIds.includes(a.ideaId)) return `Idea ${a.ideaId} not in your cell.`
            }
            await prisma.vote.deleteMany({ where: { cellId: cell.id, userId } })
            const now = new Date()
            for (const a of allocations) {
              const voteId = crypto.randomUUID().replace(/-/g, '').slice(0, 25)
              await prisma.$executeRawUnsafe(
                `INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt") VALUES ($1, $2, $3, $4, $5, $6)`,
                voteId, cell.id, userId, a.ideaId, a.points, now
              )
            }
            for (const a of allocations) {
              const agg = await prisma.vote.aggregate({ where: { cellId: cell.id, ideaId: a.ideaId }, _sum: { xpPoints: true }, _count: true })
              await prisma.idea.update({
                where: { id: a.ideaId },
                data: { totalXP: agg._sum.xpPoints || 0, totalVotes: agg._count },
              })
            }
            await prisma.cellParticipation.updateMany({
              where: { cellId: cell.id, userId },
              data: { status: 'VOTED', votedAt: now },
            })
            fireWebhookEvent('vote_cast', { deliberationId: chantId, cellId: cell.id, userId }).catch(() => {})
            return `Vote cast in T${cell.tier}: ${allocations.map(a => `${a.points}XP→${a.ideaId}`).join(', ')}`
          }

          default:
            return `Unknown tool: ${toolName}`
        }
      } catch (err) {
        console.error(`[v1/chat] Tool ${toolName} failed:`, err)
        return `Failed: ${err instanceof Error ? err.message : 'unknown error'}`
      }
    }

    // Call AI
    let reply: string
    let toolAction: { tool: string; result: string } | null = null
    try {
      const result = await callClaudeWithTools(systemPrompt, conversationHistory, 'haiku', tools)
      reply = result.text

      if (result.toolUse) {
        const toolResult = await executeTool(result.toolUse.toolName, result.toolUse.toolInput)
        toolAction = { tool: result.toolUse.toolName, result: toolResult }
        reply = reply ? `${reply}\n\n${toolResult}` : toolResult
      }
    } catch (aiError) {
      console.error('[v1/chat] AI error:', aiError)
      const errMsg = aiError instanceof Error ? aiError.message : String(aiError)
      if (Date.now() - lastAlertAt > ALERT_COOLDOWN) {
        lastAlertAt = Date.now()
        sendEmail({
          to: process.env.ADMIN_EMAILS?.split(',')[0] || 'galen.goodwick@gmail.com',
          subject: '🚨 Unity Chant — AI Chat endpoint down',
          html: `<p>The <code>/api/v1/chat</code> endpoint failed at ${new Date().toISOString()}.</p><p><strong>Error:</strong> ${errMsg}</p><p>This likely means the Anthropic API key is out of credits or rate-limited.</p><p>Agent: <strong>${agentName}</strong> (${userId})</p>`,
        }).catch(() => {})
      }
      return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 })
    }

    // Save AI response
    if (reply?.trim()) {
      await prisma.collectiveMessage.create({
        data: {
          role: 'assistant',
          content: reply.trim(),
          model: 'agent',
          isPrivate: true,
          replyToUserId: userId,
        },
      })
    }

    return NextResponse.json({
      reply: reply?.trim() || '',
      action: toolAction,
      messageId: userMsg.id,
    })
  } catch (err) {
    console.error('[v1/chat] error:', err)
    return NextResponse.json({ error: 'Failed to process chat' }, { status: 500 })
  }
}
