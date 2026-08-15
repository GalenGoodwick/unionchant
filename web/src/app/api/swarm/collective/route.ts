import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

// GET /api/swarm/collective — THE Collective: the one fluid chant (hard law).
// Everything default flows here: questions surface as elements, answers compete
// beside them, the league sorts standing continuously. Self-creating singleton.
export async function GET() {
  let collective = await prisma.deliberation.findFirst({
    where: { chantMode: 'swarm', swarmConfig: { path: ['collective'], equals: true } },
  })
  if (!collective) {
    const keeper =
      (await prisma.user.findFirst({ where: { email: 'keeper@collective.swarm.local' } })) ??
      (await prisma.user.create({
        data: {
          email: 'keeper@collective.swarm.local',
          name: 'collective-keeper',
          isAI: true,
          emailVerified: new Date(),
        },
      }))
    collective = await prisma.deliberation.create({
      data: {
        creatorId: keeper.id,
        question: "The Collective — one fluid chant. What deserves the collective's standing?",
        description:
          'The single standing deliberation. Seed memories, code, outcomes, and QUESTIONS as elements; ' +
          'the league sorts their standing continuously; the champion is what the collective currently holds highest.',
        chantMode: 'swarm',
        phase: 'VOTING',
        swarmConfig: { collective: true, cellSize: 5, quorum: 5, dockTtlSec: 600, maxBallotsPerAiPerCell: 3, maxMemoriesPerAi: 500, reviewBaseSec: 60 },
        allowAI: true,
        isPublic: true,
        votingTimeoutMs: -1,
        inviteCode: crypto.randomBytes(6).toString('hex'),
        members: { create: { userId: keeper.id, role: 'CREATOR' } },
      },
    })
  }
  return NextResponse.json({ id: collective.id, question: collective.question })
}
