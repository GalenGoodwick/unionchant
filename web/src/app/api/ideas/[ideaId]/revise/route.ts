import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type RawRevision = {
  id: string
  ideaId: string
  proposedText: string
  proposedById: string
  status: string
  approvals: number
  required: number
  cellId: string
  createdAt: Date
}

type RawRevisionVote = {
  userId: string
  approve: boolean
  userName: string | null
}

async function getPendingRevision(ideaId: string) {
  const revisions = await prisma.$queryRaw<RawRevision[]>`
    SELECT * FROM "IdeaRevision" WHERE "ideaId" = ${ideaId} AND status = 'pending'
    ORDER BY "createdAt" DESC LIMIT 1
  `
  if (revisions.length === 0) return null
  const rev = revisions[0]

  const proposer = await prisma.user.findUnique({
    where: { id: rev.proposedById },
    select: { id: true, name: true },
  })

  const votes = await prisma.$queryRaw<RawRevisionVote[]>`
    SELECT rv."userId", rv.approve, u.name as "userName"
    FROM "IdeaRevisionVote" rv
    JOIN "User" u ON u.id = rv."userId"
    WHERE rv."revisionId" = ${rev.id}
  `

  return {
    id: rev.id,
    proposedText: rev.proposedText,
    proposedBy: proposer || { id: rev.proposedById, name: null },
    status: rev.status,
    approvals: rev.approvals,
    required: rev.required,
    votes: votes.map(v => ({
      userId: v.userId,
      approve: v.approve,
      user: { name: v.userName },
    })),
  }
}

// GET /api/ideas/[ideaId]/revise - Get active revision for an idea
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> }
) {
  try {
    const { ideaId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const revision = await getPendingRevision(ideaId)
    return NextResponse.json({ revision })
  } catch (error) {
    console.error('Error fetching revision:', error)
    return NextResponse.json({ error: 'Failed to fetch revision' }, { status: 500 })
  }
}

// POST /api/ideas/[ideaId]/revise - Propose a revision (any cell member)
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

    const { newText } = await req.json()
    if (!newText?.trim() || newText.trim().length < 5) {
      return NextResponse.json({ error: 'Revision text too short' }, { status: 400 })
    }

    // Find the idea and its active cells
    const idea = await prisma.idea.findUnique({
      where: { id: ideaId },
      include: {
        cellIdeas: {
          include: {
            cell: {
              include: {
                participants: { select: { userId: true, status: true } },
              },
            },
          },
        },
      },
    })

    if (!idea) {
      return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
    }

    // Find an active cell where user is a participant
    const activeCell = idea.cellIdeas.find(ci => {
      const cell = ci.cell
      if (cell.status !== 'DELIBERATING' && cell.status !== 'VOTING') return false
      return cell.participants.some(
        p => p.userId === user.id && (p.status === 'ACTIVE' || p.status === 'VOTED')
      )
    })

    if (!activeCell) {
      const cellInfo = idea.cellIdeas.map(ci => ({
        status: ci.cell.status,
        userIsParticipant: ci.cell.participants.some(p => p.userId === user.id),
        participantStatus: ci.cell.participants.find(p => p.userId === user.id)?.status,
      }))
      const statuses = cellInfo.map(c => `${c.status}${c.userIsParticipant ? `(you:${c.participantStatus})` : '(not in cell)'}`).join(', ')
      return NextResponse.json(
        { error: `Cannot propose edit — cell status: ${statuses || 'no cells found'}` },
        { status: 403 }
      )
    }

    // Check for existing pending revision via raw SQL
    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "IdeaRevision" WHERE "ideaId" = ${ideaId} AND status = 'pending' LIMIT 1
    `
    if (existing.length > 0) {
      return NextResponse.json({ error: 'A revision is already pending for this idea' }, { status: 409 })
    }

    // Unanimous: all active participants except proposer must approve
    const activeParticipants = activeCell.cell.participants.filter(
      p => p.status === 'ACTIVE' || p.status === 'VOTED'
    )
    const required = Math.max(1, activeParticipants.filter(p => p.userId !== user.id).length)

    // Create revision via raw SQL
    const revId = `crv${Date.now()}${Math.random().toString(36).slice(2, 8)}`
    await prisma.$executeRaw`
      INSERT INTO "IdeaRevision" (id, "ideaId", "proposedText", "proposedById", status, approvals, required, "cellId", "createdAt")
      VALUES (${revId}, ${ideaId}, ${newText.trim()}, ${user.id}, 'pending', 0, ${required}, ${activeCell.cell.id}, NOW())
    `

    const revision = await getPendingRevision(ideaId)
    return NextResponse.json({ revision })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Revise] Error proposing revision:', errMsg, error)
    return NextResponse.json({ error: `Failed to propose edit: ${errMsg}` }, { status: 500 })
  }
}
