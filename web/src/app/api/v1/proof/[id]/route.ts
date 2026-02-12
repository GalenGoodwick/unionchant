import { NextRequest, NextResponse } from 'next/server'
import { v1RateLimit, getClientIp } from '../../rate-limit'
import * as fs from 'fs'
import * as path from 'path'

// GET /api/v1/proof/:id — Serve deliberation proof JSON for on-chain verification
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rateErr = v1RateLimit('v1_read', getClientIp(req))
  if (rateErr) return rateErr

  const { id } = await params

  // Sanitize ID to prevent path traversal
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safeId || safeId !== id) {
    return NextResponse.json({ error: 'Invalid proof ID' }, { status: 400 })
  }

  const proofPath = path.join(process.cwd(), 'public', 'proofs', `${safeId}.json`)

  if (!fs.existsSync(proofPath)) {
    return NextResponse.json({ error: 'Proof not found' }, { status: 404 })
  }

  try {
    const proofData = JSON.parse(fs.readFileSync(proofPath, 'utf-8'))

    return NextResponse.json({
      ...proofData,
      verification: {
        instructions: 'To verify: 1) Remove merkleRoot and solanaTxSignature fields from this JSON, 2) JSON.stringify with no spacing, 3) Compute SHA-256, 4) Compare with merkleRoot, 5) Check on-chain memo matches at the Solana explorer URL',
        explorerUrl: proofData.solanaTxSignature
          ? `https://explorer.solana.com/tx/${proofData.solanaTxSignature}?cluster=${proofData.solanaCluster || 'devnet'}`
          : null,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to read proof' }, { status: 500 })
  }
}
