import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/invite/[code] - Get deliberation by invite code
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params

    const deliberation = await prisma.deliberation.findUnique({
      where: { inviteCode: code },
      include: {
        creator: {
          select: { name: true, status: true },
        },
        _count: {
          select: { members: true, ideas: true },
        },
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })
    }

    return NextResponse.json({
      id: deliberation.id,
      question: deliberation.question,
      description: deliberation.description,
      phase: deliberation.phase,
      isPublic: deliberation.isPublic,
      creator: deliberation.creator,
      _count: deliberation._count,
    })
  } catch (error) {
    console.error('Error fetching deliberation by invite:', error)
    return NextResponse.json({ error: 'Failed to fetch deliberation' }, { status: 500 })
  }
}
