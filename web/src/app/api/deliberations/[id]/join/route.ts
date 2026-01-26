import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/deliberations/[id]/join - Join a deliberation
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    // Check if already a member
    const existingMembership = await prisma.deliberationMember.findUnique({
      where: {
        deliberationId_userId: {
          deliberationId: id,
          userId: user.id,
        },
      },
    })

    if (existingMembership) {
      return NextResponse.json({ message: 'Already a member' })
    }

    // Join the deliberation
    const membership = await prisma.deliberationMember.create({
      data: {
        deliberationId: id,
        userId: user.id,
        role: 'PARTICIPANT',
      },
    })

    return NextResponse.json(membership, { status: 201 })
  } catch (error) {
    console.error('Error joining deliberation:', error)
    return NextResponse.json({ error: 'Failed to join deliberation' }, { status: 500 })
  }
}
