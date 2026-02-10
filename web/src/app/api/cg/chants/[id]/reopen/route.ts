import { NextRequest, NextResponse } from 'next/server'
import { verifyCGAuth } from '../../../auth'
import { resolveCGUser } from '@/lib/cg-user'
import { prisma } from '@/lib/prisma'

// POST /api/cg/chants/[id]/reopen — Reopen for submissions. Creator-only.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyCGAuth(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params
    const body = await req.json()
    const { cgUserId, cgUsername, cgImageUrl } = body

    if (!cgUserId || !cgUsername) {
      return NextResponse.json({ error: 'cgUserId and cgUsername are required' }, { status: 400 })
    }

    const user = await resolveCGUser(cgUserId, cgUsername, cgImageUrl)

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      select: { id: true, question: true, phase: true, creatorId: true },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the creator can reopen this chant' }, { status: 403 })
    }

    if (deliberation.phase === 'SUBMISSION') {
      return NextResponse.json({ error: 'Chant is already accepting ideas' }, { status: 400 })
    }

    await prisma.deliberation.update({
      where: { id },
      data: {
        phase: 'SUBMISSION',
        submissionEndsAt: null,
        submissionsClosed: false,
      },
    })

    console.log(`[CG] Reopened deliberation ${id} (${deliberation.question})`)

    return NextResponse.json({ success: true, question: deliberation.question })
  } catch (error) {
    console.error('Error reopening CG chant:', error)
    return NextResponse.json({ error: 'Failed to reopen chant' }, { status: 500 })
  }
}
