import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { moderateContent, aiModerateContent, checkModerationLock, recordModerationStrike, resetModerationStrikes } from '@/lib/moderation'
import { runAskAI } from '@/lib/ask-ai'
import { isAdmin } from '@/lib/admin'

export const maxDuration = 300

const VALID_COUNTS = [5, 10, 15, 20, 25]

// Higher limits by tier — admin gets up to 500
const MAX_AGENTS: Record<string, number> = {
  free: 25,
  pro: 50,
  business: 100,
  scale: 250,
  admin: 500,
}

const ASK_AI_DAILY_LIMITS: Record<string, number> = {
  free: 2,
  pro: 10,
  business: 30,
  scale: 100,
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Sign in to use Ask AI' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Admin bypass all limits
    const userIsAdmin = await isAdmin(session.user.email)

    if (!userIsAdmin) {
      // Daily quota based on subscription tier
      const dailyLimit = ASK_AI_DAILY_LIMITS[user.subscriptionTier] || 2
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayCount = await prisma.deliberation.count({
        where: {
          creatorId: user.id,
          tags: { has: 'ask-ai' },
          createdAt: { gte: todayStart },
        },
      })
      if (todayCount >= dailyLimit) {
        return NextResponse.json({
          error: `Daily limit reached (${dailyLimit}/day on ${user.subscriptionTier}). Upgrade for more.`,
          code: 'ASK_AI_LIMIT',
        }, { status: 429 })
      }

      // Rate limit: 1 per 5 minutes (burst protection)
      const limited = await checkRateLimit('ask_ai', user.id)
      if (limited) {
        return NextResponse.json({ error: 'Try again in a few minutes' }, { status: 429 })
      }
    }

    const body = await req.json()
    const { question, description, agentCount, sources } = body

    if (!question?.trim() || question.trim().length < 5) {
      return NextResponse.json({ error: 'Question must be at least 5 characters' }, { status: 400 })
    }
    if (question.trim().length > 300) {
      return NextResponse.json({ error: 'Question too long (max 300 characters)' }, { status: 400 })
    }

    // Check moderation lockout
    const lock = checkModerationLock(user.id)
    if (lock.locked) {
      return NextResponse.json({ error: `Too many content violations. Try again in ${lock.remaining} minutes.` }, { status: 429 })
    }

    // Content moderation — block before sending to Claude
    const qMod = moderateContent(question.trim())
    if (!qMod.allowed) {
      recordModerationStrike(user.id)
      return NextResponse.json({ error: qMod.reason || 'Question violates community guidelines' }, { status: 400 })
    }
    if (description?.trim()) {
      const dMod = moderateContent(description.trim())
      if (!dMod.allowed) {
        recordModerationStrike(user.id)
        return NextResponse.json({ error: dMod.reason || 'Description violates community guidelines' }, { status: 400 })
      }
    }

    // AI moderation — catch profanity, gibberish, hate speech
    const aiChecks = [aiModerateContent(question.trim())]
    if (description?.trim()) aiChecks.push(aiModerateContent(description.trim()))
    const aiResults = await Promise.all(aiChecks)
    if (!aiResults[0].allowed) {
      recordModerationStrike(user.id)
      return NextResponse.json({ error: 'Your question didn\'t pass our content check. Please remove profanity, hate speech, or gibberish and try again.' }, { status: 400 })
    }
    if (aiResults[1] && !aiResults[1].allowed) {
      recordModerationStrike(user.id)
      return NextResponse.json({ error: 'Your description didn\'t pass our content check. Please remove profanity, hate speech, or gibberish and try again.' }, { status: 400 })
    }

    // Passed moderation — reset strikes
    resetModerationStrikes(user.id)

    // Admin/paid users can specify any count up to their tier max
    const tierKey = userIsAdmin ? 'admin' : (user.subscriptionTier || 'free')
    const maxAllowed = MAX_AGENTS[tierKey] || 25
    const count = (typeof agentCount === 'number' && agentCount >= 5 && agentCount <= maxAllowed)
      ? agentCount
      : VALID_COUNTS.includes(agentCount) ? agentCount : 15
    const validSources = {
      standard: sources?.standard === true,
      pool: sources?.pool === true,
      mine: sources?.mine === true,
      children: sources?.children === true,
      collective: sources?.collective === true,
      cradle: sources?.cradle === true,
    }
    // Default to standard if nothing checked
    if (!validSources.standard && !validSources.pool && !validSources.mine && !validSources.children && !validSources.collective && !validSources.cradle) {
      validSources.standard = true
    }

    // Stream SSE response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        function send(data: Record<string, unknown>) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        try {
          const result = await runAskAI({
            question: question.trim(),
            description: description?.trim(),
            creatorId: user.id,
            agentCount: count,
            sources: validSources,
            onProgress: (step, detail, progress, extra) => {
              send({ step, detail, progress, ...extra })
            },
          })

          send({
            step: 'complete',
            deliberationId: result.deliberationId,
            champion: result.champion,
            ranked: result.ranked,
            progress: 100,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Ask AI failed'
          send({ step: 'error', detail: msg, progress: 0 })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (err) {
    console.error('Ask AI error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
