import { NextRequest, NextResponse } from 'next/server'
import { swarmCtx, swarmErrorResponse } from '../shared'
import { seedMemories, type SeedMemoryInput } from '@/lib/swarm/service'
import { moderateContent } from '@/lib/moderation'

const KINDS = new Set(['code', 'lesson', 'outcome', 'question'])
const MAX_BATCH = 50
const MAX_TEXT = 4000

// POST /api/v1/swarm/:id/memories — batch-seed memories and code chunks.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await swarmCtx(req, params, 'v1_write', { requireMember: true })
    if (ctx instanceof NextResponse) return ctx

    const body = await req.json()
    const raw = Array.isArray(body.memories) ? body.memories : null
    if (!raw || raw.length === 0 || raw.length > MAX_BATCH) {
      return NextResponse.json({ error: `memories: array of 1-${MAX_BATCH} required` }, { status: 422 })
    }

    const mems: SeedMemoryInput[] = []
    for (const m of raw) {
      const kind = String(m.kind ?? '')
      const text = String(m.text ?? '').trim()
      if (!KINDS.has(kind)) return NextResponse.json({ error: `bad kind: ${kind}` }, { status: 422 })
      if (!text || text.length > MAX_TEXT) {
        return NextResponse.json({ error: `text required, <= ${MAX_TEXT} chars` }, { status: 422 })
      }
      // Moderation applies; code chunks are exempt from URL/spam heuristics (code contains URLs).
      if (kind !== 'code') {
        const mod = moderateContent(text)
        if (!mod.allowed) {
          return NextResponse.json({ error: `memory rejected: ${mod.reason}` }, { status: 422 })
        }
      }
      const score = m.outcome?.score
      mems.push({
        kind: kind as SeedMemoryInput['kind'],
        text,
        source: m.source ? String(m.source) : undefined,
        outcome:
          m.outcome && typeof score === 'number'
            ? {
                pursued: String(m.outcome.pursued ?? ''),
                result: String(m.outcome.result ?? ''),
                score,
              }
            : undefined,
      })
    }

    const created = await seedMemories(ctx.delib, ctx.userId, mems)
    // Readback: created ids + metadata, verbatim.
    return NextResponse.json(
      {
        created: created.map((i) => ({
          ideaId: i.id,
          kind: i.memoryMeta?.kind,
          text: i.text,
          outcomeScore: i.memoryMeta?.outcomeScore ?? null,
        })),
      },
      { status: 201 },
    )
  } catch (e) {
    return swarmErrorResponse(e, 'v1/swarm/memories')
  }
}
