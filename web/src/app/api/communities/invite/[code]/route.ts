import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/communities/invite/[code] - Lookup community by invite code
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params

    const community = await prisma.community.findUnique({
      where: { inviteCode: code },
      include: {
        creator: { select: { name: true, status: true } },
        _count: { select: { members: true, deliberations: true } },
      },
    })

    if (!community) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })
    }

    return NextResponse.json(community)
  } catch (error) {
    console.error('Error looking up community invite:', error)
    return NextResponse.json({ error: 'Failed to lookup invite' }, { status: 500 })
  }
}
