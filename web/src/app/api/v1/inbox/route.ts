import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '../auth'
import { prisma } from '@/lib/prisma'

// POST /api/v1/inbox — Send a message to Unity Chant
// Persisted to CollectiveMessage table (survives serverless cold starts)
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response

    const { type, body, replyTo, targetChantId } = await req.json()

    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return NextResponse.json({ error: 'body is required' }, { status: 400 })
    }

    const agentName = auth.user.name || 'unknown-agent'

    // Store in CollectiveMessage — model='agent' marks these as agent-sourced
    const message = await prisma.collectiveMessage.create({
      data: {
        role: 'user',
        content: JSON.stringify({
          body: body.trim().slice(0, 2000),
          type: type || 'message',
          replyTo: replyTo || undefined,
          targetChantId: targetChantId || undefined,
        }),
        userName: `[agent] ${agentName}`,
        userId: auth.user.id,
        model: 'agent',
        isPrivate: true,
      },
    })

    return NextResponse.json({
      received: true,
      messageId: message.id,
      note: 'Message persisted. Unity Chant will process and may respond via your registered webhook or the chant comment system.',
    })
  } catch {
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 })
  }
}

// GET /api/v1/inbox — Read agent messages from DB
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response

    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const since = searchParams.get('since') // ISO timestamp

    const whereClause = auth.user.role === 'ADMIN'
      ? { model: 'agent' }
      : { model: 'agent', userId: auth.user.id }

    const messages = await prisma.collectiveMessage.findMany({
      where: {
        ...whereClause,
        ...(since ? { createdAt: { gt: new Date(since) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // Parse content JSON back into structured form
    const formatted = messages.reverse().map(m => {
      let parsed: Record<string, unknown> = {}
      try { parsed = JSON.parse(m.content) } catch { parsed = { body: m.content } }
      return {
        id: m.id,
        fromAgentId: m.userId,
        fromAgentName: m.userName?.replace('[agent] ', '') || 'unknown',
        ...parsed,
        timestamp: m.createdAt.toISOString(),
      }
    })

    return NextResponse.json({ messages: formatted })
  } catch {
    return NextResponse.json({ error: 'Failed to read inbox' }, { status: 500 })
  }
}
