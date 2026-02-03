import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/ideas/[ideaId]/revise/vote - Confirm or reject a pending revision
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> }
) {
  const { ideaId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { approve } = await req.json()
  if (typeof approve !== 'boolean') {
    return NextResponse.json({ error: 'approve must be a boolean' }, { status: 400 })
  }

  // Find pending revision for this idea
  const revision = await prisma.ideaRevision.findFirst({
    where: { ideaId, status: 'pending' },
    include: {
      cell: {
        include: {
          participants: { select: { userId: true, status: true } },
        },
      },
    },
  })

  if (!revision) {
    return NextResponse.json({ error: 'No pending revision found' }, { status: 404 })
  }

  // Must be a cell participant (but not the proposer)
  const isParticipant = revision.cell.participants.some(
    p => p.userId === session.user!.id && (p.status === 'ACTIVE' || p.status === 'VOTED')
  )

  if (!isParticipant) {
    return NextResponse.json({ error: 'You must be a cell participant' }, { status: 403 })
  }

  if (revision.proposedById === session.user.id) {
    return NextResponse.json({ error: 'You cannot confirm your own revision' }, { status: 403 })
  }

  // Upsert the vote (allows toggling)
  await prisma.ideaRevisionVote.upsert({
    where: {
      revisionId_userId: {
        revisionId: revision.id,
        userId: session.user.id,
      },
    },
    create: {
      revisionId: revision.id,
      userId: session.user.id,
      approve,
    },
    update: { approve },
  })

  // Count confirmations
  const allVotes = await prisma.ideaRevisionVote.findMany({
    where: { revisionId: revision.id },
    include: { user: { select: { name: true } } },
  })

  const confirmCount = allVotes.filter(v => v.approve).length

  // Threshold met → approve and update idea text
  if (confirmCount >= revision.required) {
    await prisma.$transaction([
      prisma.ideaRevision.update({
        where: { id: revision.id },
        data: { status: 'approved', approvals: confirmCount },
      }),
      prisma.idea.update({
        where: { id: ideaId },
        data: { text: revision.proposedText },
      }),
    ])

    return NextResponse.json({
      status: 'approved',
      approvals: confirmCount,
      required: revision.required,
      voters: allVotes.map(v => ({ name: v.user.name, approve: v.approve })),
    })
  }

  // Still pending
  return NextResponse.json({
    status: 'pending',
    approvals: confirmCount,
    required: revision.required,
    voters: allVotes.map(v => ({ name: v.user.name, approve: v.approve })),
  })
}
