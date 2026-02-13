import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/agent-pool/count — Number of user-trained agents available in the pool (excludes caller's own)
export async function GET() {
  try {
    let excludeOwnerId: string | undefined
    const session = await getServerSession(authOptions)
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
      excludeOwnerId = user?.id
    }

    const count = await prisma.user.count({
      where: {
        isAI: true,
        ownerId: { not: null },
        ...(excludeOwnerId ? { NOT: { ownerId: excludeOwnerId } } : {}),
        status: { not: 'DELETED' },
        ideology: { not: null },
      },
    })
    return NextResponse.json({ count })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
