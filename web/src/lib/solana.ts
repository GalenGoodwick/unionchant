import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js'

const NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'mainnet-beta' | 'testnet'

export function getConnection(): Connection {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(NETWORK)
  return new Connection(endpoint, 'confirmed')
}

export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address)
    return true
  } catch {
    return false
  }
}

/**
 * Verify a Solana transaction exists and matches expected parameters.
 * Phase 2: full on-chain verification. Phase 1: returns true (honor system).
 */
export async function verifyTransaction(
  txSignature: string,
  _expectedLamports?: bigint,
  _expectedRecipient?: string
): Promise<{ verified: boolean; error?: string }> {
  if (!txSignature) return { verified: false, error: 'No transaction signature' }

  try {
    const connection = getConnection()
    const tx = await connection.getTransaction(txSignature, { maxSupportedTransactionVersion: 0 })
    if (!tx) return { verified: false, error: 'Transaction not found' }
    if (tx.meta?.err) return { verified: false, error: 'Transaction failed on-chain' }

    // Phase 2: verify amount + recipient match
    // For now, just confirm the tx exists and succeeded
    return { verified: true }
  } catch (err) {
    return { verified: false, error: `Verification failed: ${err}` }
  }
}

export const LAMPORTS_PER_SOL = 1_000_000_000

export function solToLamports(sol: number): bigint {
  return BigInt(Math.round(sol * LAMPORTS_PER_SOL))
}

export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL
}
