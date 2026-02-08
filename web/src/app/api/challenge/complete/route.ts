import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/challenge/complete — validate and record challenge result
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ verified: false })
    }

    const { result, pointerEvents, chaseDurationMs, evadeCount } = await req.json()

    const userId = session.user.id

    if (result === 'passed') {
      // Validate behavioral data — real humans produce these minimums
      const validPointer = typeof pointerEvents === 'number' && pointerEvents >= 10
      const validDuration = typeof chaseDurationMs === 'number' && chaseDurationMs >= 1200
      const validEvade = typeof evadeCount === 'number' && evadeCount >= 2

      if (!validPointer || !validDuration || !validEvade) {
        // Suspicious — log as failed validation
        await prisma.challengeLog.create({
          data: {
            userId,
            result: 'failed_validation',
            pointerEvents: pointerEvents ?? 0,
            chaseDurationMs: chaseDurationMs ?? 0,
            evadeCount: evadeCount ?? 0,
          },
        })
        // Don't reveal why it failed — just say not verified
        return NextResponse.json({ verified: false })
      }

      // Passed — update user and log
      await Promise.all([
        prisma.user.update({
          where: { id: userId },
          data: { lastChallengePassedAt: new Date() },
        }),
        prisma.challengeLog.create({
          data: {
            userId,
            result: 'passed',
            pointerEvents,
            chaseDurationMs,
            evadeCount,
          },
        }),
      ])

      return NextResponse.json({ verified: true })
    }

    if (result === 'failed_insta_click' || result === 'failed_no_chase') {
      // Bot behavior — flag and log
      await Promise.all([
        prisma.user.update({
          where: { id: userId },
          data: {
            botFlaggedAt: new Date(),
            challengeFailCount: { increment: 1 },
          },
        }),
        prisma.challengeLog.create({
          data: {
            userId,
            result,
            pointerEvents: pointerEvents ?? 0,
            chaseDurationMs: chaseDurationMs ?? 0,
            evadeCount: evadeCount ?? 0,
          },
        }),
      ])

      console.warn(`CHALLENGE FAIL: user=${userId} result=${result} pointerEvents=${pointerEvents} duration=${chaseDurationMs}`)

      // Don't reveal detection — still return verified:false
      return NextResponse.json({ verified: false })
    }

    return NextResponse.json({ verified: false })
  } catch {
    return NextResponse.json({ verified: false })
  }
}
