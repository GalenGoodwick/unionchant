import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { startChallengeRound } from '@/lib/challenge'
import prisma from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Check if user is the creator or admin
  const deliberation = await prisma.deliberation.findUnique({
    where: { id },
    include: {
      creator: true,
    },
  })

  if (!deliberation) {
    return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
  }

  // Only creator can start challenge (or admin)
  const isCreator = deliberation.creator.email === session.user.email
  const isAdmin = process.env.ADMIN_EMAILS?.split(',').includes(session.user.email)

  if (!isCreator && !isAdmin) {
    return NextResponse.json({ error: 'Only the creator can start a challenge round' }, { status: 403 })
  }

  if (deliberation.phase !== 'ACCUMULATING') {
    return NextResponse.json({ error: 'Deliberation is not in accumulation phase' }, { status: 400 })
  }

  try {
    const result = await startChallengeRound(id)

    // Handle cases where the challenge didn't actually start
    if (!result) {
      return NextResponse.json(
        { error: 'Challenge round already in progress' },
        { status: 409 }
      )
    }
    if (result.completed) {
      return NextResponse.json(
        { error: `No challenger ideas available. ${result.reason || 'Talk has been completed.'}` },
        { status: 400 }
      )
    }
    if (result.extended) {
      return NextResponse.json(
        { error: `No challenger ideas to compete. ${result.reason || 'Submit new ideas first.'}` },
        { status: 400 }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to start challenge round:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start challenge round' },
      { status: 500 }
    )
  }
}
