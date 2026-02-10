import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, requireScope } from '../../../auth'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'
import { tryCreateContinuousFlowCell } from '@/lib/voting'
import { startVotingPhase } from '@/lib/voting'
import { fireWebhookEvent } from '@/lib/webhooks'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const scopeErr = requireScope(auth.scopes, 'write')
    if (scopeErr) return scopeErr

    const { id } = await params
    const body = await req.json()
    const { text } = body

    if (!text?.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    // Content moderation
    const mod = moderateContent(text)
    if (!mod.allowed) {
      return NextResponse.json({ error: mod.reason }, { status: 400 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })
    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.submissionsClosed) {
      return NextResponse.json({ error: 'Submissions are closed' }, { status: 400 })
    }

    // Ideas are always attributed to the API key owner
    const authorId = auth.user.id

    // Auto-join as member if not already
    await prisma.deliberationMember.upsert({
      where: { deliberationId_userId: { deliberationId: id, userId: authorId } },
      update: {},
      create: { deliberationId: id, userId: authorId, role: 'PARTICIPANT' },
    })

    const isContinuousFlow = deliberation.continuousFlow && deliberation.phase === 'VOTING'
    const isContinuousFlowTier1 = isContinuousFlow // Ideas always enter at tier 1 in continuous flow

    // Determine idea status based on phase
    let status: 'SUBMITTED' | 'PENDING' = 'SUBMITTED'
    if (deliberation.phase === 'VOTING' && !isContinuousFlowTier1) {
      status = 'PENDING'
    }
    if (deliberation.phase === 'ACCUMULATING') {
      status = 'PENDING'
    }

    const idea = await prisma.idea.create({
      data: {
        text: text.trim(),
        deliberationId: id,
        authorId,
        status,
        isNew: deliberation.phase !== 'SUBMISSION',
      },
    })

    // Auto-start voting if idea goal reached
    if (deliberation.phase === 'SUBMISSION' && deliberation.ideaGoal) {
      const ideaCount = await prisma.idea.count({
        where: { deliberationId: id, status: 'SUBMITTED' },
      })
      if (ideaCount >= deliberation.ideaGoal) {
        await startVotingPhase(id)
      }
    }

    // Continuous flow: try to create a new cell
    if (isContinuousFlowTier1) {
      try {
        await tryCreateContinuousFlowCell(id)
      } catch (err) {
        console.error('CF cell creation failed:', err)
      }
    }

    // Fire webhook (fire-and-forget)
    fireWebhookEvent('idea_submitted', {
      deliberationId: id,
      ideaId: idea.id,
      text: idea.text,
      authorId,
    })

    return NextResponse.json({ id: idea.id, text: idea.text, status: idea.status })
  } catch (err) {
    console.error('v1 submit idea error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
