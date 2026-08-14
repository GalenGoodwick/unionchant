import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/swarm — public list of swarm elections (the eye's index).
// Read-only + public: observation parity, no key needed to watch.
export async function GET() {
  const swarms = await prisma.deliberation.findMany({
    where: { chantMode: 'swarm', isPublic: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      question: true,
      phase: true,
      currentTier: true,
      championId: true,
      createdAt: true,
      _count: { select: { ideas: true, members: true } },
    },
  })
  return NextResponse.json({ swarms })
}
