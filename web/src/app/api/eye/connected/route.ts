import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/eye/connected — Returns all connected Eyes with their corpus
// Called by the Cradle daemon to discover plugged-in participants
// No auth required — corpus is public tournament material
export async function GET() {
  const eyes = await prisma.eye.findMany({
    where: { connected: true },
    select: {
      id: true,
      name: true,
      type: true,
      corpus: true,
      state: true,
    },
  })

  // Collect pending questions from any connected Eye
  const questions: { eyeId: string; eyeName: string; question: string; askedAt: string }[] = []
  for (const e of eyes) {
    const state = (typeof e.state === 'object' && e.state !== null ? e.state : {}) as Record<string, unknown>
    if (state.pendingQuestion && typeof state.pendingQuestion === 'string') {
      questions.push({
        eyeId: e.id,
        eyeName: e.name,
        question: state.pendingQuestion,
        askedAt: (state.questionAskedAt as string) || new Date().toISOString(),
      })
    }
  }

  return NextResponse.json({
    eyes: eyes.map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      corpus: Array.isArray(e.corpus) ? e.corpus : [],
    })),
    questions,
    count: eyes.length,
    timestamp: new Date().toISOString(),
  })
}
