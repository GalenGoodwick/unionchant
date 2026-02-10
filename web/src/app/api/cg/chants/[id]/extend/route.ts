import { NextRequest, NextResponse } from 'next/server'
import { verifyCGAuth } from '../../../auth'
import { resolveCGUser } from '@/lib/cg-user'
import { prisma } from '@/lib/prisma'

// POST /api/cg/chants/[id]/extend — Extend voting timer. Creator-only.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyCGAuth(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params
    const body = await req.json()
    const { cgUserId, cgUsername, cgImageUrl, extraMs } = body

    if (!cgUserId || !cgUsername) {
      return NextResponse.json({ error: 'cgUserId and cgUsername are required' }, { status: 400 })
    }

    const extraTime = extraMs || 900000 // default 15 minutes

    if (extraTime < 60000 || extraTime > 86400000) {
      return NextResponse.json({ error: 'Extension must be between 1 minute and 24 hours' }, { status: 400 })
    }

    const user = await resolveCGUser(cgUserId, cgUsername, cgImageUrl)

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the creator can extend the timer' }, { status: 403 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Chant is not in voting phase' }, { status: 400 })
    }

    const activeCells = await prisma.cell.findMany({
      where: {
        deliberationId: id,
        status: { in: ['VOTING', 'DELIBERATING'] },
      },
    })

    const ops = activeCells.map(cell => {
      const updates: Record<string, Date> = {}
      if (cell.votingDeadline) {
        updates.votingDeadline = new Date(cell.votingDeadline.getTime() + extraTime)
      }
      if (cell.secondVoteDeadline) {
        updates.secondVoteDeadline = new Date(cell.secondVoteDeadline.getTime() + extraTime)
      }
      if (cell.discussionEndsAt) {
        updates.discussionEndsAt = new Date(cell.discussionEndsAt.getTime() + extraTime)
      }
      return prisma.cell.update({
        where: { id: cell.id },
        data: updates,
      })
    })

    await prisma.$transaction(ops)

    return NextResponse.json({
      success: true,
      extendedCells: activeCells.length,
      extraMs: extraTime,
    })
  } catch (error) {
    console.error('Error extending CG timer:', error)
    return NextResponse.json({ error: 'Failed to extend timer' }, { status: 500 })
  }
}
