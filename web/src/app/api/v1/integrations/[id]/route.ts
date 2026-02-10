import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, requireScope } from '../../auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/v1/integrations/:id — Update integration
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const scopeErr = requireScope(auth.scopes, 'write')
    if (scopeErr) return scopeErr

    const { id } = await params

    const existing = await prisma.integration.findUnique({ where: { id } })
    if (!existing || existing.userId !== auth.user.id) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    }

    const body = await req.json()
    const update: Record<string, unknown> = {}

    if (body.webhookUrl !== undefined) {
      if (!body.webhookUrl?.startsWith('https://')) {
        return NextResponse.json({ error: 'webhookUrl must use HTTPS' }, { status: 400 })
      }
      update.webhookUrl = body.webhookUrl.trim()
    }

    if (body.events !== undefined) {
      const VALID = ['idea_submitted', 'vote_cast', 'tier_complete', 'winner_declared']
      if (!Array.isArray(body.events) || body.events.some((e: string) => !VALID.includes(e))) {
        return NextResponse.json({ error: `Invalid events. Valid: ${VALID.join(', ')}` }, { status: 400 })
      }
      update.events = body.events
    }

    if (body.enabled !== undefined) {
      update.enabled = !!body.enabled
      if (body.enabled) update.failCount = 0 // reset on re-enable
    }

    const updated = await prisma.integration.update({
      where: { id },
      data: update,
      select: { id: true, name: true, webhookUrl: true, events: true, enabled: true, failCount: true },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('v1 integration PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/v1/integrations/:id — Remove integration
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params

    const existing = await prisma.integration.findUnique({ where: { id } })
    if (!existing || existing.userId !== auth.user.id) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    }

    await prisma.integration.delete({ where: { id } })

    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('v1 integration DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
