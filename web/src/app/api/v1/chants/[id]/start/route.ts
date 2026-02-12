import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, requireScope } from '../../../auth'
import { v1RateLimit } from '../../../rate-limit'
import { startVotingPhase } from '@/lib/voting'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const scopeErr = requireScope(auth.scopes, 'write')
    if (scopeErr) return scopeErr
    const rateErr = v1RateLimit('v1_admin', auth.user.id)
    if (rateErr) return rateErr

    const { id } = await params

    // Only the creator can start voting
    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      select: { creatorId: true },
    })
    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }
    if (deliberation.creatorId !== auth.user.id) {
      return NextResponse.json({ error: 'Only the creator can start voting' }, { status: 403 })
    }

    await startVotingPhase(id)

    return NextResponse.json({ started: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to start voting'
    console.error('v1 start voting error:', msg)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
