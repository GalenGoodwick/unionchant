import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/user/reset-score — Reset your own Foresight Score
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { scoreResetAt: new Date() },
    })

    return NextResponse.json({ success: true, scoreResetAt: new Date().toISOString() })
  } catch (err) {
    console.error('reset user score error:', err)
    return NextResponse.json({ error: 'Failed to reset score' }, { status: 500 })
  }
}
