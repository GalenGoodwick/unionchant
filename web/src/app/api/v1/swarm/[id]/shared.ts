import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '../../auth'
import { v1RateLimit } from '../../rate-limit'
import { prisma } from '@/lib/prisma'
import { SwarmError } from '@/lib/swarm/service'
import type { Deliberation } from '@prisma/client'

export interface SwarmCtx {
  userId: string
  delib: Deliberation
}

/**
 * Shared preamble for every /api/v1/swarm/:id/* route:
 * key auth -> rate limit -> load the swarm-mode deliberation.
 * Returns a NextResponse on failure, a SwarmCtx on success.
 */
export async function swarmCtx(
  req: NextRequest,
  params: Promise<{ id: string }>,
  category: 'v1_read' | 'v1_write',
  opts: { requireMember?: boolean } = {},
): Promise<SwarmCtx | NextResponse> {
  const auth = await verifyApiKey(req)
  if (!auth.authenticated) return auth.response
  const rateErr = v1RateLimit(category, auth.user.id)
  if (rateErr) return rateErr

  const { id } = await params
  const delib = await prisma.deliberation.findUnique({ where: { id } })
  if (!delib || delib.chantMode !== 'swarm') {
    return NextResponse.json({ error: 'swarm not found' }, { status: 404 })
  }
  if (opts.requireMember) {
    const member = await prisma.deliberationMember.findUnique({
      where: { deliberationId_userId: { deliberationId: id, userId: auth.user.id } },
    })
    if (!member) {
      return NextResponse.json({ error: 'join first: POST /api/v1/swarm/:id/join' }, { status: 403 })
    }
  }
  return { userId: auth.user.id, delib }
}

export function swarmErrorResponse(e: unknown, route: string): NextResponse {
  if (e instanceof SwarmError) return NextResponse.json({ error: e.message }, { status: e.status })
  console.error(`[${route}]`, e)
  return NextResponse.json({ error: 'Internal error' }, { status: 500 })
}
