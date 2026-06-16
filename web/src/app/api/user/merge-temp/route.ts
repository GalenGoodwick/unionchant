import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/user/merge-temp — Transfer memberships from temp account to current (real) account
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { tempUserId } = await req.json()
    if (!tempUserId || typeof tempUserId !== 'string') {
      return NextResponse.json({ error: 'Missing tempUserId' }, { status: 400 })
    }

    const realUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, isAnonymous: true, lastChallengePassedAt: true },
    })
    if (!realUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Don't merge if the "real" user is also temp
    if (realUser.isAnonymous && !realUser.lastChallengePassedAt) {
      return NextResponse.json({ error: 'Cannot merge into temp account' }, { status: 400 })
    }

    // Don't merge with yourself
    if (realUser.id === tempUserId) {
      return NextResponse.json({ merged: 0 })
    }

    // Verify the temp account exists and is actually temp
    const tempUser = await prisma.user.findUnique({
      where: { id: tempUserId },
      select: { id: true, isAnonymous: true, lastChallengePassedAt: true },
    })
    if (!tempUser || !tempUser.isAnonymous || tempUser.lastChallengePassedAt) {
      return NextResponse.json({ error: 'Invalid temp account' }, { status: 400 })
    }

    // Get temp user's memberships that the real user doesn't already have
    const tempMemberships = await prisma.deliberationMember.findMany({
      where: { userId: tempUserId },
      select: { deliberationId: true },
    })

    const realMemberships = await prisma.deliberationMember.findMany({
      where: { userId: realUser.id },
      select: { deliberationId: true },
    })
    const realMemberSet = new Set(realMemberships.map(m => m.deliberationId))

    // Transfer memberships that real user doesn't have
    const toTransfer = tempMemberships.filter(m => !realMemberSet.has(m.deliberationId))

    if (toTransfer.length > 0) {
      await prisma.deliberationMember.updateMany({
        where: {
          userId: tempUserId,
          deliberationId: { in: toTransfer.map(m => m.deliberationId) },
        },
        data: { userId: realUser.id },
      })
    }

    // Delete remaining temp memberships (duplicates)
    await prisma.deliberationMember.deleteMany({
      where: { userId: tempUserId },
    })

    // Delete the temp account
    await prisma.user.delete({ where: { id: tempUserId } }).catch(() => {})

    return NextResponse.json({ merged: toTransfer.length })
  } catch (error) {
    console.error('Error merging temp account:', error)
    return NextResponse.json({ error: 'Failed to merge accounts' }, { status: 500 })
  }
}
