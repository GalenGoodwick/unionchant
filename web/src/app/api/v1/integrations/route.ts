import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyApiKey, requireScope } from '../auth'
import { prisma } from '@/lib/prisma'

const VALID_EVENTS = ['idea_submitted', 'vote_cast', 'tier_complete', 'winner_declared']

// POST /api/v1/integrations — Register a webhook integration
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const scopeErr = requireScope(auth.scopes, 'write')
    if (scopeErr) return scopeErr

    const body = await req.json()
    const { name, webhookUrl, events } = body

    if (!name?.trim() || name.trim().length < 2) {
      return NextResponse.json({ error: 'name is required (2+ characters)' }, { status: 400 })
    }

    if (!webhookUrl?.trim() || !webhookUrl.startsWith('https://')) {
      return NextResponse.json({ error: 'webhookUrl is required and must use HTTPS' }, { status: 400 })
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: `events required. Valid: ${VALID_EVENTS.join(', ')}` }, { status: 400 })
    }

    for (const e of events) {
      if (!VALID_EVENTS.includes(e)) {
        return NextResponse.json({ error: `Invalid event: ${e}. Valid: ${VALID_EVENTS.join(', ')}` }, { status: 400 })
      }
    }

    // Limit to 5 integrations per user
    const count = await prisma.integration.count({ where: { userId: auth.user.id } })
    if (count >= 5) {
      return NextResponse.json({ error: 'Maximum 5 integrations per account' }, { status: 400 })
    }

    // Generate webhook secret
    const secret = `uc_wh_${crypto.randomBytes(16).toString('hex')}`

    const integration = await prisma.integration.create({
      data: {
        name: name.trim(),
        webhookUrl: webhookUrl.trim(),
        events,
        secret,
        userId: auth.user.id,
      },
    })

    return NextResponse.json({
      id: integration.id,
      name: integration.name,
      webhookUrl: integration.webhookUrl,
      events: integration.events,
      secret,
      enabled: integration.enabled,
      message: 'Save the secret — used to verify webhook signatures via X-UC-Signature header (HMAC-SHA256).',
      verification: 'Each webhook POST includes X-UC-Signature (HMAC of body with your secret) and X-UC-Event headers.',
    }, { status: 201 })
  } catch (err) {
    console.error('v1 integrations POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/v1/integrations — List your integrations
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response

    const integrations = await prisma.integration.findMany({
      where: { userId: auth.user.id },
      select: {
        id: true, name: true, webhookUrl: true, events: true,
        enabled: true, failCount: true, lastCalledAt: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ integrations })
  } catch (err) {
    console.error('v1 integrations GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
