import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkDeliberationAccess } from '@/lib/privacy'

// GET /api/deliberations/[id]/members - Public member list
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const session = await getServerSession(authOptions)
    const access = await checkDeliberationAccess(id, session?.user?.email)
    if (!access.allowed) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    const members = await prisma.deliberationMember.findMany({
      where: { deliberationId: id },
      select: {
        role: true,
        joinedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    })

    const result = members.map(m => ({
      id: m.user.id,
      name: m.user.name,
      image: m.user.image,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching members:', error)
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 })
  }
}
