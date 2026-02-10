import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { solToLamports, verifyTransaction } from '@/lib/solana'

/**
 * POST /api/launches/:id/contribute — Contribute SOL to a launch pool
 *
 * Body: { amountSol: number, txSignature?: string }
 * Phase 1: honor system (no txSignature required)
 * Phase 2: on-chain verification
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const { amountSol, txSignature } = body

    if (!amountSol || typeof amountSol !== 'number' || amountSol <= 0) {
      return NextResponse.json({ error: 'amountSol must be a positive number' }, { status: 400 })
    }

    const launch = await prisma.launchPool.findUnique({ where: { id } })
    if (!launch) {
      return NextResponse.json({ error: 'Launch not found' }, { status: 404 })
    }
    if (launch.status !== 'FUNDING') {
      return NextResponse.json({ error: `Launch is ${launch.status}, not accepting contributions` }, { status: 400 })
    }
    if (new Date() > launch.poolDeadline) {
      return NextResponse.json({ error: 'Pool deadline has passed' }, { status: 400 })
    }

    const amountLamports = solToLamports(amountSol)

    // Phase 2: verify on-chain
    let verified = false
    if (txSignature) {
      const result = await verifyTransaction(txSignature, amountLamports)
      if (!result.verified) {
        return NextResponse.json({ error: result.error || 'Transaction verification failed' }, { status: 400 })
      }
      verified = true
    }

    // Create contribution + update pool total atomically
    const [contribution] = await prisma.$transaction([
      prisma.contribution.create({
        data: {
          launchPoolId: id,
          userId: session.user.id,
          amountLamports,
          txSignature: txSignature || null,
          verified,
        },
      }),
      prisma.launchPool.update({
        where: { id },
        data: {
          currentLamports: { increment: amountLamports },
        },
      }),
    ])

    return NextResponse.json({
      success: true,
      contribution: {
        id: contribution.id,
        amountLamports: contribution.amountLamports.toString(),
        verified: contribution.verified,
        launchId: id,
      },
    })
  } catch (err) {
    console.error('Contribute error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
