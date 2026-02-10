import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isValidSolanaAddress } from '@/lib/solana'
import nacl from 'tweetnacl'
import bs58 from 'bs58'

/**
 * POST /api/wallet/verify — Link a Solana wallet to the user's account
 *
 * Body: { walletAddress: string, signature: string, message: string }
 *
 * The client signs a message with their wallet. We verify the signature
 * matches the public key (wallet address) to prove ownership.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await req.json()
    const { walletAddress, signature, message } = body

    if (!walletAddress || !signature || !message) {
      return NextResponse.json({ error: 'walletAddress, signature, and message are required' }, { status: 400 })
    }

    if (!isValidSolanaAddress(walletAddress)) {
      return NextResponse.json({ error: 'Invalid Solana address' }, { status: 400 })
    }

    // Verify the signature proves wallet ownership
    const messageBytes = new TextEncoder().encode(message)
    const signatureBytes = bs58.decode(signature)
    const publicKeyBytes = bs58.decode(walletAddress)

    const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    // Check wallet isn't already linked to another account
    const existing = await prisma.user.findUnique({ where: { walletAddress } })
    if (existing && existing.id !== session.user.id) {
      return NextResponse.json({ error: 'Wallet already linked to another account' }, { status: 409 })
    }

    // Link wallet to user
    await prisma.user.update({
      where: { id: session.user.id },
      data: { walletAddress },
    })

    return NextResponse.json({ success: true, walletAddress })
  } catch (err) {
    console.error('Wallet verify error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
