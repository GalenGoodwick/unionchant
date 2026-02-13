import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/agent-pool/count — Number of user-trained agents available in the pool
export async function GET() {
  try {
    const count = await prisma.user.count({
      where: {
        isAI: true,
        ownerId: { not: null },
        status: { not: 'DELETED' },
        ideology: { not: null },
      },
    })
    return NextResponse.json({ count })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
