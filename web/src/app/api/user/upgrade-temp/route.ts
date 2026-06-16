import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/user/upgrade-temp — Upgrade current temp account to full anonymous (can act)
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, isAnonymous: true, lastChallengePassedAt: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.isAnonymous || user.lastChallengePassedAt) {
      // Already a real or full anonymous account
      return NextResponse.json({ ok: true })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastChallengePassedAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error upgrading temp account:', error)
    return NextResponse.json({ error: 'Failed to upgrade account' }, { status: 500 })
  }
}
