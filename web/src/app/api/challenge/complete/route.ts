import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { invalidate } from '@/lib/cache'
import { createHash } from 'crypto'

const MIN_ELAPSED_MS = 1500   // minimum 1.5s (surrender can happen at 1.5s)
const MAX_ELAPSED_MS = 300000 // maximum 5 minutes

/** Round coordinates to nearest 5, sample every 3rd point, hash the sequence */
function computePathHash(chasePath: { x: number; y: number }[]): string | null {
  if (!Array.isArray(chasePath) || chasePath.length < 5) return null

  const sampled = chasePath
    .filter((_, i) => i % 3 === 0) // every 3rd point
    .map(p => {
      const rx = Math.round((p.x ?? 0) / 5) * 5
      const ry = Math.round((p.y ?? 0) / 5) * 5
      return `${rx},${ry}`
    })
    .join('|')

  return createHash('sha256').update(sampled).digest('hex')
}

// POST /api/challenge/complete — validate and record challenge result
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ verified: false })
    }

    const { result, pointerEvents, chaseDurationMs, evadeCount, surrendered, chasePath, challengeToken } = await req.json()

    const userId = session.user.id
    const pathData = Array.isArray(chasePath) ? chasePath.slice(0, 300) : undefined

    // ── Token validation ──
    if (!challengeToken || typeof challengeToken !== 'string') {
      return NextResponse.json({ verified: false })
    }

    const pendingLog = await prisma.challengeLog.findUnique({
      where: { challengeToken },
    })

    if (!pendingLog || pendingLog.userId !== userId || pendingLog.used) {
      return NextResponse.json({ verified: false })
    }

    // ── Timestamp validation ──
    if (pendingLog.issuedAt) {
      const elapsed = Date.now() - pendingLog.issuedAt.getTime()
      if (elapsed < MIN_ELAPSED_MS || elapsed > MAX_ELAPSED_MS) {
        await prisma.challengeLog.update({
          where: { id: pendingLog.id },
          data: {
            result: 'failed_validation',
            used: true,
            pointerEvents: pointerEvents ?? 0,
            chaseDurationMs: chaseDurationMs ?? 0,
            evadeCount: evadeCount ?? 0,
            surrendered: !!surrendered,
            chasePath: pathData,
          },
        })
        return NextResponse.json({ verified: false })
      }
    }

    if (result === 'passed') {
      // Validate behavioral data — real humans produce these minimums
      // Surrendered challenges have lower thresholds (button stops early)
      const isSurrender = !!surrendered
      const validPointer = typeof pointerEvents === 'number' && pointerEvents >= (isSurrender ? 5 : 10)
      const validDuration = typeof chaseDurationMs === 'number' && chaseDurationMs >= (isSurrender ? 800 : 1200)
      const validEvade = typeof evadeCount === 'number' && evadeCount >= (isSurrender ? 1 : 2)

      if (!validPointer || !validDuration || !validEvade) {
        await prisma.challengeLog.update({
          where: { id: pendingLog.id },
          data: {
            result: 'failed_validation',
            used: true,
            pointerEvents: pointerEvents ?? 0,
            chaseDurationMs: chaseDurationMs ?? 0,
            evadeCount: evadeCount ?? 0,
            surrendered: !!surrendered,
            chasePath: pathData,
          },
        })
        return NextResponse.json({ verified: false })
      }

      // ── Path hash replay detection ──
      const pathHash = computePathHash(chasePath)
      if (pathHash) {
        const replay = await prisma.challengeLog.findFirst({
          where: {
            pathHash,
            result: 'passed',
            NOT: { id: pendingLog.id },
          },
          select: { id: true },
        })

        if (replay) {
          await Promise.all([
            prisma.challengeLog.update({
              where: { id: pendingLog.id },
              data: {
                result: 'failed_replay',
                used: true,
                pointerEvents,
                chaseDurationMs,
                evadeCount,
                surrendered: !!surrendered,
                chasePath: pathData,
                pathHash,
              },
            }),
            prisma.user.update({
              where: { id: userId },
              data: {
                botFlaggedAt: new Date(),
                challengeFailCount: { increment: 1 },
              },
            }),
          ])
          return NextResponse.json({ verified: false })
        }
      }

      // ── Passed — update the pending log row ──
      await Promise.all([
        prisma.user.update({
          where: { id: userId },
          data: { lastChallengePassedAt: new Date() },
        }),
        prisma.challengeLog.update({
          where: { id: pendingLog.id },
          data: {
            result: 'passed',
            used: true,
            pointerEvents,
            chaseDurationMs,
            evadeCount,
            surrendered: !!surrendered,
            chasePath: pathData,
            pathHash,
          },
        }),
      ])

      // Invalidate cached user data so /api/challenge/status sees fresh lastChallengePassedAt
      invalidate(`challenge:${userId}`)

      return NextResponse.json({ verified: true })
    }

    if (result === 'failed_insta_click' || result === 'failed_no_chase') {
      // Log the failure but do NOT mark token as used — user can still retry
      await Promise.all([
        prisma.user.update({
          where: { id: userId },
          data: {
            botFlaggedAt: new Date(),
            challengeFailCount: { increment: 1 },
          },
        }),
        prisma.challengeLog.update({
          where: { id: pendingLog.id },
          data: {
            result: 'failed_attempt',
            pointerEvents: pointerEvents ?? 0,
            chaseDurationMs: chaseDurationMs ?? 0,
            evadeCount: evadeCount ?? 0,
            surrendered: !!surrendered,
            chasePath: pathData,
          },
        }),
      ])

      return NextResponse.json({ verified: false })
    }

    // Unknown result — mark used
    await prisma.challengeLog.update({
      where: { id: pendingLog.id },
      data: { result: result || 'unknown', used: true },
    })

    return NextResponse.json({ verified: false })
  } catch {
    return NextResponse.json({ verified: false })
  }
}
