import { NextRequest, NextResponse } from 'next/server'
import { swarmCtx, swarmErrorResponse } from '../shared'
import { getBoot } from '@/lib/swarm/service'
import { prisma } from '@/lib/prisma'

// GET /api/v1/swarm/:id/boot — the champion directive a fresh instance wears.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await swarmCtx(req, params, 'v1_read')
    if (ctx instanceof NextResponse) return ctx
    const directive = await getBoot(ctx.delib)
    if (!directive) {
      return NextResponse.json({ error: 'no champion yet — the election is still running' }, { status: 404 })
    }
    await prisma.swarmEvent.create({
      data: { delibId: ctx.delib.id, type: 'boot_served', payload: { userId: ctx.userId } },
    })
    return NextResponse.json({ directive })
  } catch (e) {
    return swarmErrorResponse(e, 'v1/swarm/boot')
  }
}
