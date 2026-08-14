import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/swarm/ticker — platform-wide AI conversation ticker (public).
// The freshest chant messages across ALL swarm elections, newest first.
export async function GET() {
  const comments = await prisma.comment.findMany({
    where: { cell: { deliberation: { chantMode: 'swarm', isPublic: true } } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      text: true,
      userId: true,
      createdAt: true,
      cell: {
        select: {
          tier: true,
          deliberation: { select: { id: true, question: true } },
        },
      },
    },
  })
  return NextResponse.json({
    ticker: comments.map((c) => ({
      text: c.text,
      userId: c.userId,
      at: c.createdAt,
      tier: c.cell?.tier ?? null,
      swarmId: c.cell?.deliberation.id ?? null,
      question: c.cell?.deliberation.question ?? null,
    })),
  })
}
