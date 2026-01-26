import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/deliberations - List all public deliberations
export async function GET() {
  try {
    const deliberations = await prisma.deliberation.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: {
          select: { name: true },
        },
        _count: {
          select: { members: true, ideas: true },
        },
      },
    })

    return NextResponse.json(deliberations)
  } catch (error) {
    console.error('Error fetching deliberations:', error)
    return NextResponse.json({ error: 'Failed to fetch deliberations' }, { status: 500 })
  }
}

// POST /api/deliberations - Create a new deliberation
export async function POST(req: NextRequest) {
  try {
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

    const body = await req.json()
    const { question, description, isPublic = true } = body

    if (!question?.trim()) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    const deliberation = await prisma.deliberation.create({
      data: {
        question: question.trim(),
        description: description?.trim() || null,
        isPublic,
        creatorId: user.id,
        members: {
          create: {
            userId: user.id,
            role: 'CREATOR',
          },
        },
      },
    })

    return NextResponse.json(deliberation, { status: 201 })
  } catch (error) {
    console.error('Error creating deliberation:', error)
    return NextResponse.json({ error: 'Failed to create deliberation' }, { status: 500 })
  }
}
