import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, requireScope } from '../../../auth'
import { prisma } from '@/lib/prisma'
import { solToLamports, verifyTransaction } from '@/lib/solana'

/**
 * POST /api/v1/chants/:id/boost — Boost a chant's visibility with SOL
 *
 * Body: { amountSol: number, txSignature?: string }
 * Phase 1: honor system (no txSignature required)
 * Phase 2: on-chain verification (txSignature required)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const scopeErr = requireScope(auth.scopes, 'write')
    if (scopeErr) return scopeErr

    const { id } = await params
    const body = await req.json()
    const { amountSol, txSignature } = body

    if (!amountSol || typeof amountSol !== 'number' || amountSol <= 0) {
      return NextResponse.json({ error: 'amountSol must be a positive number' }, { status: 400 })
    }

    const deliberation = await prisma.deliberation.findUnique({ where: { id } })
    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    const amountLamports = solToLamports(amountSol)

    // Phase 2: verify on-chain if signature provided
    let verified = false
    if (txSignature) {
      const result = await verifyTransaction(txSignature, amountLamports)
      if (!result.verified) {
        return NextResponse.json({ error: result.error || 'Transaction verification failed' }, { status: 400 })
      }
      verified = true
    }

    const boost = await prisma.boost.create({
      data: {
        deliberationId: id,
        userId: auth.user.id,
        amountLamports,
        txSignature: txSignature || null,
        verified,
      },
    })

    return NextResponse.json({
      success: true,
      boost: {
        id: boost.id,
        amountLamports: boost.amountLamports.toString(),
        verified: boost.verified,
        chantId: id,
      },
    })
  } catch (err) {
    console.error('Boost error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/v1/chants/:id/boost — Get total boost amount for a chant
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const boosts = await prisma.boost.aggregate({
      where: { deliberationId: id },
      _sum: { amountLamports: true },
      _count: true,
    })

    return NextResponse.json({
      chantId: id,
      totalLamports: (boosts._sum.amountLamports || BigInt(0)).toString(),
      boostCount: boosts._count,
    })
  } catch (err) {
    console.error('Get boosts error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
