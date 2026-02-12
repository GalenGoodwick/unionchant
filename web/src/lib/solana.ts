import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from '@solana/web3.js'

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
 * Verify a Solana transaction exists, succeeded, and optionally
 * transferred the expected amount to the expected recipient.
 *
 * Checks pre/post SOL balances of the recipient account to confirm
 * they received at least `expectedLamports`.
 */
export async function verifyTransaction(
  txSignature: string,
  expectedLamports?: bigint,
  expectedRecipient?: string
): Promise<{ verified: boolean; error?: string }> {
  if (!txSignature) return { verified: false, error: 'No transaction signature' }

  try {
    const connection = getConnection()
    const tx = await connection.getTransaction(txSignature, { maxSupportedTransactionVersion: 0 })
    if (!tx) return { verified: false, error: 'Transaction not found' }
    if (tx.meta?.err) return { verified: false, error: 'Transaction failed on-chain' }

    // Reject transactions older than 10 minutes (prevents reuse of old payments)
    if (tx.blockTime) {
      const ageSeconds = Math.floor(Date.now() / 1000) - tx.blockTime
      if (ageSeconds > 600) {
        return { verified: false, error: `Transaction too old (${Math.floor(ageSeconds / 60)} minutes). Must be within 10 minutes.` }
      }
    }

    // If no amount/recipient check requested, just confirm tx exists
    if (!expectedLamports && !expectedRecipient) {
      return { verified: true }
    }

    // Get account keys from the transaction
    const accountKeys = tx.transaction.message.getAccountKeys()
    const preBalances = tx.meta?.preBalances || []
    const postBalances = tx.meta?.postBalances || []

    if (expectedRecipient) {
      const recipientPubkey = new PublicKey(expectedRecipient)

      // Find the recipient in the transaction's account list
      let recipientIndex = -1
      for (let i = 0; i < accountKeys.length; i++) {
        if (accountKeys.get(i)?.equals(recipientPubkey)) {
          recipientIndex = i
          break
        }
      }

      if (recipientIndex === -1) {
        return { verified: false, error: 'Treasury wallet not found in transaction accounts' }
      }

      // Check how much SOL the recipient gained
      const received = BigInt(postBalances[recipientIndex]) - BigInt(preBalances[recipientIndex])

      if (expectedLamports && received < expectedLamports) {
        return {
          verified: false,
          error: `Insufficient payment: received ${received} lamports, expected ${expectedLamports}`,
        }
      }
    }

    return { verified: true }
  } catch (err) {
    return { verified: false, error: `Verification failed: ${err}` }
  }
}

// Minimum SOL to keep in the memo chain wallet for tx fees.
// 0.01 SOL covers ~2,000 memo transactions.
const RESERVE_LAMPORTS = BigInt(10_000_000) // 0.01 SOL

/**
 * Forward SOL from the memo chain wallet to the treasury (your Backpack wallet).
 * Keeps a small reserve for future memo tx fees.
 * Called after badge mints and (future) deliberation proof payments.
 *
 * Returns the forwarding tx signature, or null if nothing to forward.
 */
export async function forwardToTreasury(
  fromKeypair: Keypair,
  amount: bigint,
): Promise<string | null> {
  const treasuryAddress = process.env.TREASURY_ADDRESS
  if (!treasuryAddress) return null

  const connection = getConnection()
  const balance = await connection.getBalance(fromKeypair.publicKey)
  const balanceBigInt = BigInt(balance)

  // Keep reserve, forward the rest (up to the payment amount)
  // Also account for the transfer tx fee (~5000 lamports)
  const txFee = BigInt(5000)
  const available = balanceBigInt - RESERVE_LAMPORTS - txFee
  if (available <= BigInt(0)) return null

  const toForward = available < amount ? available : amount

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: new PublicKey(treasuryAddress),
      lamports: toForward,
    })
  )

  const signature = await sendAndConfirmTransaction(connection, tx, [fromKeypair], {
    commitment: 'confirmed',
  })

  return signature
}

export const LAMPORTS_PER_SOL = 1_000_000_000

export function solToLamports(sol: number): bigint {
  return BigInt(Math.round(sol * LAMPORTS_PER_SOL))
}

export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL
}
