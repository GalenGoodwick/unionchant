import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/invite/[code]/join - Join deliberation via invite code
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
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

    const deliberation = await prisma.deliberation.findUnique({
      where: { inviteCode: code },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })
    }

    // Check if already a member
    const existingMember = await prisma.deliberationMember.findUnique({
      where: {
        deliberationId_userId: {
          deliberationId: deliberation.id,
          userId: user.id,
        },
      },
    })

    if (existingMember) {
      // Already a member, just redirect
      return NextResponse.json({
        deliberationId: deliberation.id,
        message: 'Already a member'
      })
    }

    // Check if deliberation is still accepting members
    if (deliberation.phase === 'COMPLETED') {
      return NextResponse.json({ error: 'This deliberation has ended' }, { status: 400 })
    }

    // Join the deliberation
    await prisma.deliberationMember.create({
      data: {
        deliberationId: deliberation.id,
        userId: user.id,
        role: 'PARTICIPANT',
      },
    })

    return NextResponse.json({
      deliberationId: deliberation.id,
      message: 'Successfully joined'
    })
  } catch (error) {
    console.error('Error joining via invite:', error)
    return NextResponse.json({ error: 'Failed to join deliberation' }, { status: 500 })
  }
}
