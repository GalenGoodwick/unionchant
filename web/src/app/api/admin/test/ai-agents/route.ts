import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminVerified } from '@/lib/admin'
import {
  runAgentTest,
  getTestProgress,
  cleanupTestAgents,
  AgentConfig,
} from '@/lib/ai-test-agent'

// GET /api/admin/test/ai-agents - Get current test progress
export async function GET(req: NextRequest) {
  try {
    // Block test endpoints in production
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Test endpoints disabled in production' }, { status: 403 })
    }

    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    // Also get count of existing test agents
    const existingTestAgents = await prisma.user.count({
      where: {
        AND: [
          { email: { contains: 'testbot-' } },
          { email: { endsWith: '@test.bot' } },
        ],
      },
    })

    return NextResponse.json({
      ...getTestProgress(),
      existingTestAgents,
    })
  } catch (error) {
    console.error('Error getting test progress:', error)
    return NextResponse.json({ error: 'Failed to get progress' }, { status: 500 })
  }
}

// POST /api/admin/test/ai-agents - Start a new AI agent test
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    const body = await req.json()
    const {
      deliberationId,
      totalAgents = 100,
      votingTimePerTierMs = 30000, // 30 seconds
      dropoutRate = 0.1, // 10% dropout
      commentRate = 0.2, // 20% comment
      upvoteRate = 0.3, // 30% upvote
      newJoinRate = 0.05, // 5% new joins (not implemented yet)
      forceStartVoting = true, // Force start even if trigger not met
      excludeAdmin = false, // Remove admin from deliberation before voting
    } = body

    if (!deliberationId) {
      return NextResponse.json({ error: 'deliberationId is required' }, { status: 400 })
    }

    // Validate deliberation exists
    const deliberation = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    const config: AgentConfig = {
      totalAgents,
      votingTimePerTierMs,
      dropoutRate,
      commentRate,
      upvoteRate,
      newJoinRate,
      forceStartVoting,
      excludeAdminEmail: excludeAdmin ? auth.email : undefined,
    }

    // Run test in background (don't await)
    runAgentTest(deliberationId, config).catch(err => {
      console.error('AI agent test failed:', err)
    })

    return NextResponse.json({
      message: 'AI agent test started',
      config,
      deliberationId,
    })
  } catch (error) {
    console.error('Error starting AI agent test:', error)
    return NextResponse.json({ error: 'Failed to start test' }, { status: 500 })
  }
}

// PUT /api/admin/test/ai-agents - Stop the running test
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    const { stopTest } = await import('@/lib/ai-test-agent')
    stopTest()

    return NextResponse.json({
      message: 'Stop signal sent',
    })
  } catch (error) {
    console.error('Error stopping test:', error)
    return NextResponse.json({ error: 'Failed to stop test' }, { status: 500 })
  }
}

// DELETE /api/admin/test/ai-agents - Clean up test data
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    const deleted = await cleanupTestAgents()

    return NextResponse.json({
      message: 'Test agents cleaned up',
      deleted,
    })
  } catch (error) {
    console.error('Error cleaning up test agents:', error)
    return NextResponse.json({ error: 'Failed to cleanup' }, { status: 500 })
  }
}
