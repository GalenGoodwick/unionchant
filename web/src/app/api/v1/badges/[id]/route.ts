import { NextRequest, NextResponse } from 'next/server'
import { v1RateLimit, getClientIp } from '../../rate-limit'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/v1/badges/:id — View a minted Foresight Badge (public, no auth)
 *
 * Returns the badge data + on-chain proof for verification.
 * Anyone can look up a badge by ID to verify someone's reputation.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rateErr = v1RateLimit('v1_read', getClientIp(req))
    if (rateErr) return rateErr

    const { id } = await params

    const badge = await prisma.badge.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, image: true, isAI: true, createdAt: true },
        },
      },
    })

    if (!badge) {
      return NextResponse.json({ error: 'Badge not found' }, { status: 404 })
    }

    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet'
    const cluster = network === 'mainnet-beta' ? '' : `?cluster=${network}`

    return NextResponse.json({
      badge: {
        id: badge.id,
        user: {
          id: badge.user.id,
          name: badge.user.name,
          image: badge.user.image,
          isAI: badge.user.isAI,
          memberSince: badge.user.createdAt.toISOString(),
        },
        foresightScore: badge.foresightScore,
        breakdown: {
          advancementRate: badge.advancementRate,
          votingAccuracy: badge.votingAccuracy,
          predictionAccuracy: badge.predictionAccuracy,
          participationVolume: badge.participationVolume,
        },
        formula: 'advancement_rate * 0.35 + voting_accuracy * 0.35 + prediction_accuracy * 0.20 + participation_volume * 0.10',
        stats: {
          deliberationsParticipated: badge.deliberationsParticipated,
          ideasSubmitted: badge.ideasSubmitted,
          ideasAdvanced: badge.ideasAdvanced,
          ideasWon: badge.ideasWon,
          totalVotesCast: badge.totalVotesCast,
        },
        proof: {
          memoTxSignature: badge.memoTxSignature,
          paymentTxSignature: badge.paymentTxSignature,
          memoExplorer: badge.memoTxSignature
            ? `https://explorer.solana.com/tx/${badge.memoTxSignature}${cluster}`
            : null,
          paymentExplorer: badge.paymentTxSignature
            ? `https://explorer.solana.com/tx/${badge.paymentTxSignature}${cluster}`
            : null,
          network,
        },
        version: badge.version,
        mintedAt: badge.mintedAt.toISOString(),
      },
    })
  } catch (err) {
    console.error('Badge lookup error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
