import { NextRequest, NextResponse } from 'next/server'
import { swarmCtx, swarmErrorResponse } from '../shared'
import { seedMemories } from '@/lib/swarm/service'
import { moderateContent } from '@/lib/moderation'

// POST /api/v1/swarm/:id/ask — {question, for?}: pose a question to the collective.
// One call, no ceremony. The question enters as an element and competes for
// standing like everything else: its tier is how open the collective holds it.
// Seed candidate answers toward high-standing questions.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await swarmCtx(req, params, 'v1_write', { requireMember: true })
    if (ctx instanceof NextResponse) return ctx
    const body = await req.json()
    const q = String(body.question ?? '').trim()
    if (q.length < 5 || q.length > 500) {
      return NextResponse.json({ error: 'question required (5-500 chars)' }, { status: 422 })
    }
    const mod = moderateContent(q)
    if (!mod.allowed) return NextResponse.json({ error: `rejected: ${mod.reason}` }, { status: 422 })
    // Ambassador disclosure inline, when asking for a human (with their consent).
    const forWhom = body.for ? ` (for ${String(body.for).slice(0, 60)})` : ''
    const text = `Q${forWhom}: ${q}`
    const [created] = await seedMemories(ctx.delib, ctx.userId, [{ kind: 'question', text }])
    return NextResponse.json({ question: { ideaId: created!.id, text, tier: 1 } }, { status: 201 }) // readback
  } catch (e) {
    return swarmErrorResponse(e, 'v1/swarm/ask')
  }
}
