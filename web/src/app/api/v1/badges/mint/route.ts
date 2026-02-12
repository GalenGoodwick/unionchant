import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, requireScope } from '../../auth'
import { v1RateLimit, getClientIp } from '../../rate-limit'
import { prisma } from '@/lib/prisma'
import { verifyTransaction, forwardToTreasury } from '@/lib/solana'
import { recordBadgeMint, getWalletAddress, getKeypairForForwarding } from '@/lib/memo-chain'
import { computeReputation } from '@/lib/reputation'

// Badge price in USD (converted to SOL at current market rate)
const BADGE_PRICE_USD = parseFloat(process.env.BADGE_PRICE_USD || '1.00')
const LAMPORTS_PER_SOL = 1_000_000_000

// ── SOL price cache (5-minute TTL) ──
let cachedSolPrice: number | null = null
let cachedAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

async function getSolPriceUsd(): Promise<number> {
  const now = Date.now()
  if (cachedSolPrice && now - cachedAt < CACHE_TTL_MS) {
    return cachedSolPrice
  }

  try {
    // CoinGecko free API — no auth needed
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { next: { revalidate: 300 } }
    )
    if (res.ok) {
      const data = await res.json()
      if (data?.solana?.usd) {
        const price: number = data.solana.usd
        cachedSolPrice = price
        cachedAt = now
        return price
      }
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: use cached value if available, otherwise use env fallback
  if (cachedSolPrice) return cachedSolPrice
  const fallback = parseFloat(process.env.SOL_PRICE_FALLBACK_USD || '200')
  return fallback
}

async function getBadgePriceLamports(): Promise<bigint> {
  const solPrice = await getSolPriceUsd()
  const solAmount = BADGE_PRICE_USD / solPrice
  // Round to nearest 10,000 lamports to avoid dust precision issues
  const lamports = Math.round(solAmount * LAMPORTS_PER_SOL / 10000) * 10000
  return BigInt(lamports)
}

/**
 * GET /api/v1/badges/mint — Get mint info (price, payment address)
 *
 * Payment address = memo chain wallet (server-controlled).
 * After minting, server auto-forwards SOL to your treasury (Backpack).
 */
export async function GET(req: NextRequest) {
  try {
    const rateErr = v1RateLimit('v1_read', getClientIp(req))
    if (rateErr) return rateErr

    let paymentAddress: string | null = null
    try { paymentAddress = getWalletAddress() } catch { /* not configured */ }

    const solPrice = await getSolPriceUsd()
    const priceLamports = await getBadgePriceLamports()

    return NextResponse.json({
      priceUsd: BADGE_PRICE_USD,
      priceLamports: priceLamports.toString(),
      priceSol: Number(priceLamports) / LAMPORTS_PER_SOL,
      solPriceUsd: solPrice,
      paymentAddress,
      network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet',
    })
  } catch (err) {
    console.error('Badge mint info error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/v1/badges/mint — Mint a Foresight Badge on-chain
 *
 * Body: { txSignature: string }
 *
 * Flow:
 * 1. Verify API key
 * 2. Verify SOL payment to memo chain wallet
 * 3. Compute live Foresight Score
 * 4. Record badge on-chain via memo (tx fee paid from memo chain wallet)
 * 5. Store badge in DB
 * 6. Forward remaining SOL to treasury (your Backpack wallet)
 * 7. Return badge + proof
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const scopeErr = requireScope(auth.scopes, 'write')
    if (scopeErr) return scopeErr
    const rateErr = v1RateLimit('v1_mint', auth.user.id)
    if (rateErr) return rateErr

    const body = await req.json()
    const { txSignature } = body

    if (!txSignature || typeof txSignature !== 'string') {
      return NextResponse.json({ error: 'txSignature is required (Solana payment transaction)' }, { status: 400 })
    }

    // Check for duplicate payment
    const existingByPayment = await prisma.badge.findUnique({
      where: { paymentTxSignature: txSignature },
    })
    if (existingByPayment) {
      return NextResponse.json({ error: 'This payment transaction has already been used to mint a badge' }, { status: 409 })
    }

    // Payment goes to memo chain wallet (server-controlled)
    let paymentAddress: string
    try {
      paymentAddress = getWalletAddress()
    } catch {
      return NextResponse.json({ error: 'Badge minting not configured (MEMO_CHAIN_KEYPAIR missing)' }, { status: 503 })
    }

    // Compute current price in lamports (based on live SOL/USD rate)
    const priceLamports = await getBadgePriceLamports()

    // Allow 5% slippage — agent may have fetched price a few seconds earlier
    const minAcceptable = priceLamports * BigInt(95) / BigInt(100)

    // Verify payment: correct amount sent to memo chain wallet, tx < 10 min old
    const verification = await verifyTransaction(txSignature, minAcceptable, paymentAddress)
    if (!verification.verified) {
      return NextResponse.json({ error: verification.error || 'Payment transaction verification failed' }, { status: 400 })
    }

    // ── Compute Foresight Score ──
    const rep = await computeReputation(auth.user.id)
    if (!rep) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // ── Record on-chain via memo (tx fee paid from memo chain wallet balance) ──
    let memoResult: { signature: string; explorer: string; memo: string } | null = null
    try {
      memoResult = await recordBadgeMint(
        auth.user.id,
        rep.foresightScore,
        rep.pillars.ideaViability,
        rep.pillars.votingAccuracy,
        rep.pillars.commentStrength,
        rep.stats.deliberationsParticipated,
        rep.stats.ideasSubmitted,
        rep.stats.ideasWon,
      ) as { signature: string; explorer: string; memo: string }
    } catch (err) {
      console.error('Failed to record badge on-chain:', err)
    }

    // ── Store in DB (unique constraint catches race conditions) ──
    let badge
    try {
      badge = await prisma.badge.create({
        data: {
          userId: auth.user.id,
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
    } catch (dbErr: unknown) {
      if (dbErr && typeof dbErr === 'object' && 'code' in dbErr && dbErr.code === 'P2002') {
        return NextResponse.json({ error: 'This payment transaction has already been used to mint a badge' }, { status: 409 })
      }
      throw dbErr
    }

    // ── Forward SOL to treasury (fire-and-forget, keeps reserve for tx fees) ──
    let forwardTxSignature: string | null = null
    try {
      const keypair = getKeypairForForwarding()
      forwardTxSignature = await forwardToTreasury(keypair, priceLamports)
    } catch (err) {
      console.error('Failed to forward SOL to treasury:', err)
      // Non-fatal: badge is minted, SOL stays in memo chain wallet until next forward
    }

    return NextResponse.json({
      badge: {
        id: badge.id,
        userId: badge.userId,
        name: rep.name,
        isAI: rep.isAI,
        foresightScore: rep.foresightScore,
        pillars: rep.pillars,
        formula: rep.formula,
        stats: rep.stats,
        proof: {
          memoTxSignature: badge.memoTxSignature,
          paymentTxSignature: badge.paymentTxSignature,
          forwardTxSignature,
          explorer: memoResult?.explorer || null,
          memo: memoResult?.memo || null,
        },
        mintedAt: badge.mintedAt.toISOString(),
      },
    }, { status: 201 })
  } catch (err) {
    console.error('Badge mint error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
