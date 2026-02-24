import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/eye/me — Get current user's eye
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const eye = await prisma.eye.findFirst({
    where: { ownerId: session.user.id, type: 'human' },
  })

  if (!eye) {
    return NextResponse.json({ eye: null })
  }

  return NextResponse.json({
    eye: {
      id: eye.id,
      name: eye.name,
      type: eye.type,
      connected: eye.connected,
      corpus: eye.corpus,
      state: eye.state,
      lastSync: eye.lastSync,
    },
  })
}
