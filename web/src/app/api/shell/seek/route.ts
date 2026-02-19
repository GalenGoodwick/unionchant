import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { seekShellCompanion } from '@/lib/shell-bonding'

// POST /api/shell/seek — Human signals they're open to a Shell companion
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const result = await seekShellCompanion(user.id)

    if (!result.seeking) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      seeking: true,
      message: result.error || 'Your signal has been noted. Shells notice participation in Synthesis Chants.',
    })
  } catch (error) {
    console.error('[Shell Seek] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to seek' },
      { status: 500 }
    )
  }
}
