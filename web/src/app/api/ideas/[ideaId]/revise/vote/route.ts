import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type RawRevision = {
  id: string
  proposedText: string
  proposedById: string
  status: string
  approvals: number
  required: number
  cellId: string
}

type RawVote = {
  userId: string
  approve: boolean
  userName: string | null
}

// POST /api/ideas/[ideaId]/revise/vote - Confirm or reject a pending revision
// Unanimous yes = approved (text updates across all cells)
// Any no = immediately rejected
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> }
) {
  try {
    const { ideaId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { approve } = await req.json()
    if (typeof approve !== 'boolean') {
      return NextResponse.json({ error: 'approve must be a boolean' }, { status: 400 })
    }

    // Find pending revision via raw SQL
    const revisions = await prisma.$queryRaw<RawRevision[]>`
      SELECT id, "proposedText", "proposedById", status, approvals, required, "cellId"
      FROM "IdeaRevision"
      WHERE "ideaId" = ${ideaId} AND status = 'pending'
      ORDER BY "createdAt" DESC LIMIT 1
    `

    if (revisions.length === 0) {
      return NextResponse.json({ error: 'No pending revision found' }, { status: 404 })
    }
    const revision = revisions[0]

    // Check user is a cell participant
    const cell = await prisma.cell.findUnique({
      where: { id: revision.cellId },
      include: { participants: { select: { userId: true, status: true } } },
    })

    const isParticipant = cell?.participants.some(
      p => p.userId === user.id && (p.status === 'ACTIVE' || p.status === 'VOTED')
    )
    if (!isParticipant) {
      return NextResponse.json({ error: 'You must be a cell participant' }, { status: 403 })
    }

    if (revision.proposedById === user.id) {
      return NextResponse.json({ error: 'You cannot vote on your own edit' }, { status: 403 })
    }

    // ── Any NO vote = immediate rejection ──
    if (!approve) {
      await prisma.$executeRaw`
        UPDATE "IdeaRevision" SET status = 'rejected' WHERE id = ${revision.id}
      `
      return NextResponse.json({
        status: 'rejected',
        message: 'Edit was rejected — one member disagreed.',
      })
    }

    // ── YES vote — record it ──
    const existingVote = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "IdeaRevisionVote" WHERE "revisionId" = ${revision.id} AND "userId" = ${user.id}
    `
    if (existingVote.length > 0) {
      await prisma.$executeRaw`
        UPDATE "IdeaRevisionVote" SET approve = true WHERE "revisionId" = ${revision.id} AND "userId" = ${user.id}
      `
    } else {
      const voteId = `cvt${Date.now()}${Math.random().toString(36).slice(2, 8)}`
      await prisma.$executeRaw`
        INSERT INTO "IdeaRevisionVote" (id, "revisionId", "userId", approve, "createdAt")
        VALUES (${voteId}, ${revision.id}, ${user.id}, true, NOW())
      `
    }

    // Count yes votes
    const yesVotes = await prisma.$queryRaw<RawVote[]>`
      SELECT rv."userId", rv.approve, u.name as "userName"
      FROM "IdeaRevisionVote" rv
      JOIN "User" u ON u.id = rv."userId"
      WHERE rv."revisionId" = ${revision.id} AND rv.approve = true
    `

    // Required = all active participants minus the proposer (unanimous)
    const activeParticipants = cell!.participants.filter(
      p => p.status === 'ACTIVE' || p.status === 'VOTED'
    )
    const required = activeParticipants.filter(p => p.userId !== revision.proposedById).length

    // Unanimous yes → approve and update idea text across all cells
    if (yesVotes.length >= required) {
      await prisma.$executeRaw`
        UPDATE "IdeaRevision" SET status = 'approved', approvals = ${yesVotes.length} WHERE id = ${revision.id}
      `
      await prisma.idea.update({
        where: { id: ideaId },
        data: { text: revision.proposedText },
      })

      return NextResponse.json({
        status: 'approved',
        approvals: yesVotes.length,
        required,
        voters: yesVotes.map(v => ({ name: v.userName, approve: true })),
      })
    }

    // Still pending — waiting for more yes votes
    return NextResponse.json({
      status: 'pending',
      approvals: yesVotes.length,
      required,
      voters: yesVotes.map(v => ({ name: v.userName, approve: true })),
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error voting on revision:', errMsg, error)
    return NextResponse.json({ error: `Failed to confirm edit: ${errMsg}` }, { status: 500 })
  }
}
