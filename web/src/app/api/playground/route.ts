import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/playground — public read of the live program (the page renders this;
// observation parity: watching the program needs no key).
export async function GET() {
  const nodes = await prisma.playgroundNode.findMany({
    orderBy: { order: 'asc' },
    select: {
      slug: true,
      title: true,
      code: true,
      order: true,
      version: true,
      authorId: true,
      claimedBy: true,
      claimTtl: true,
      updatedAt: true,
    },
  })
  return NextResponse.json({ nodes })
}
