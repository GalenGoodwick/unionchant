import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { verifyTransaction, forwardToTreasury } from '@/lib/solana'
import { recordBadgeMint, getWalletAddress, getKeypairForForwarding } from '@/lib/memo-chain'
import { computeReputation } from '@/lib/reputation'

const BADGE_PRICE_USD = parseFloat(process.env.BADGE_PRICE_USD || '1.00')
const SUPPORTER_PRICE_USD = parseFloat(process.env.SUPPORTER_PRICE_USD || '5.00')
const LAMPORTS_PER_SOL = 1_000_000_000

// ── SOL price cache (5-minute TTL) ──
let cachedSolPrice: number | null = null
let cachedAt = 0

async function getSolPriceUsd(): Promise<number> {
  const now = Date.now()
  if (cachedSolPrice && now - cachedAt < 5 * 60 * 1000) return cachedSolPrice
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { next: { revalidate: 300 } })
    if (res.ok) {
      const data = await res.json()
      if (data?.solana?.usd) { cachedSolPrice = data.solana.usd; cachedAt = now; return data.solana.usd }
    }
  } catch { /* fallback */ }
  if (cachedSolPrice) return cachedSolPrice
  return parseFloat(process.env.SOL_PRICE_FALLBACK_USD || '200')
}

async function getPriceLamports(usd: number): Promise<bigint> {
  const solPrice = await getSolPriceUsd()
  const lamports = Math.round((usd / solPrice) * LAMPORTS_PER_SOL / 10000) * 10000
  return BigInt(lamports)
}

/**
 * GET /api/badges/mint — Get mint pricing info
 */
export async function GET() {
  try {
    let paymentAddress: string | null = null
    try { paymentAddress = getWalletAddress() } catch { /* not configured */ }

    const solPrice = await getSolPriceUsd()
    const badgeLamports = await getPriceLamports(BADGE_PRICE_USD)
    const supporterLamports = await getPriceLamports(SUPPORTER_PRICE_USD)

    return NextResponse.json({
      badge: {
        priceUsd: BADGE_PRICE_USD,
        priceLamports: badgeLamports.toString(),
        priceSol: Number(badgeLamports) / LAMPORTS_PER_SOL,
      },
      supporter: {
        priceUsd: SUPPORTER_PRICE_USD,
        priceLamports: supporterLamports.toString(),
        priceSol: Number(supporterLamports) / LAMPORTS_PER_SOL,
      },
      solPriceUsd: solPrice,
      paymentAddress,
      network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet',
    })
  } catch (err) {
    console.error('Mint info error:', err)
    return NextResponse.json({ error: 'Failed to get mint info' }, { status: 500 })
  }
}

/**
 * POST /api/badges/mint — Mint a Foresight Badge (session auth)
 *
 * Body: { txSignature: string, tier: 'badge' | 'supporter' }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Sign in to mint a badge' }, { status: 401 })
    }

    const limited = await checkRateLimit('badge_mint', session.user.id)
    if (limited) {
      return NextResponse.json({ error: 'Try again in a few minutes' }, { status: 429 })
    }

    const body = await req.json()
    const { txSignature, tier } = body
    const isSupporter = tier === 'supporter'

    if (!txSignature || typeof txSignature !== 'string') {
      return NextResponse.json({ error: 'txSignature is required' }, { status: 400 })
    }

    // Check duplicate payment
    const existing = await prisma.badge.findUnique({ where: { paymentTxSignature: txSignature } })
    if (existing) {
      return NextResponse.json({ error: 'This transaction has already been used' }, { status: 409 })
    }

    // Payment address
    let paymentAddress: string
    try { paymentAddress = getWalletAddress() } catch {
      return NextResponse.json({ error: 'Badge minting not configured' }, { status: 503 })
    }

    // Price
    const priceUsd = isSupporter ? SUPPORTER_PRICE_USD : BADGE_PRICE_USD
    const priceLamports = await getPriceLamports(priceUsd)
    const minAcceptable = priceLamports * BigInt(95) / BigInt(100) // 5% slippage

    // Verify payment
    const verification = await verifyTransaction(txSignature, minAcceptable, paymentAddress)
    if (!verification.verified) {
      return NextResponse.json({ error: verification.error || 'Payment verification failed' }, { status: 400 })
    }

    // Compute reputation
    const rep = await computeReputation(session.user.id)
    if (!rep) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Record on-chain via memo
    let memoResult: { signature: string; explorer: string; memo: string } | null = null
    try {
      memoResult = await recordBadgeMint(
        session.user.id, rep.foresightScore,
        rep.pillars.ideaViability, rep.pillars.votingAccuracy, rep.pillars.commentStrength,
        rep.stats.deliberationsParticipated, rep.stats.ideasSubmitted, rep.stats.ideasWon,
      ) as { signature: string; explorer: string; memo: string }
    } catch (err) { console.error('Failed to record badge on-chain:', err) }

    // Store in DB
    const badge = await prisma.badge.create({
      data: {
        userId: session.user.id,
        foresightScore: rep.foresightScore,
        advancementRate: rep.pillars.ideaViability,
        votingAccuracy: rep.pillars.votingAccuracy,
        predictionAccuracy: rep.stats.predictionAccuracy,
        participationVolume: Math.min(rep.stats.deliberationsParticipated / 20, 1),
        deliberationsParticipated: rep.stats.deliberationsParticipated,
        ideasSubmitted: rep.stats.ideasSubmitted,
        ideasAdvanced: rep.stats.ideasAdvanced,
        ideasWon: rep.stats.ideasWon,
        totalVotesCast: rep.stats.totalVotesCast,
        memoTxSignature: memoResult?.signature || null,
        paymentTxSignature: txSignature,
        paymentLamports: priceLamports,
      },
    })

    // Mark user as supporter if premium tier
    if (isSupporter) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { isSupporter: true },
      })
    }

    // Forward SOL to treasury
    let forwardTxSignature: string | null = null
    try {
      const keypair = getKeypairForForwarding()
      forwardTxSignature = await forwardToTreasury(keypair, priceLamports)
    } catch (err) { console.error('Failed to forward SOL:', err) }

    return NextResponse.json({
      badge: {
        id: badge.id,
        foresightScore: rep.foresightScore,
        pillars: rep.pillars,
        isSupporter,
        proof: {
          memoTxSignature: badge.memoTxSignature,
          paymentTxSignature: badge.paymentTxSignature,
          forwardTxSignature,
          explorer: memoResult?.explorer || null,
        },
        mintedAt: badge.mintedAt.toISOString(),
      },
    }, { status: 201 })
  } catch (err) {
    console.error('Badge mint error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
