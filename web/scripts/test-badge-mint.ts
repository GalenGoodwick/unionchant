/**
 * Test the Foresight Badge Mint flow on Solana devnet.
 *
 * Simulates the full flow:
 * 1. Load memo chain wallet from MEMO_CHAIN_KEYPAIR
 * 2. Fund it via devnet faucet (if needed)
 * 3. Create a test "agent" keypair
 * 4. Fund agent via devnet faucet
 * 5. Agent sends 1 SOL to memo chain wallet (payment)
 * 6. Verify payment tx (same logic as mint endpoint)
 * 7. Write badge memo on-chain
 * 8. Forward SOL to treasury
 *
 * Usage:
 *   npx tsx scripts/test-badge-mint.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'

// Load env
import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

// Now import our modules (they read env on import)
import { getWalletAddress, getKeypairForForwarding, recordBadgeMint, getWalletExplorerUrl } from '../src/lib/memo-chain'
import { verifyTransaction, forwardToTreasury } from '../src/lib/solana'

const BADGE_PRICE_LAMPORTS = BigInt(1_000_000_000) // 1 SOL
const NETWORK = 'devnet'

function getConnection(): Connection {
  return new Connection(clusterApiUrl(NETWORK), 'confirmed')
}

async function airdropWithRetry(connection: Connection, pubkey: PublicKey, lamports: number, retries = 3): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`   Requesting airdrop of ${lamports / LAMPORTS_PER_SOL} SOL...`)
      const sig = await connection.requestAirdrop(pubkey, lamports)
      console.log(`   Airdrop tx: ${sig}`)
      await connection.confirmTransaction(sig, 'confirmed')
      console.log(`   Airdrop confirmed!`)
      return
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('429') || msg.includes('Too Many Requests')) {
        const wait = (i + 1) * 15
        console.log(`   Rate limited. Waiting ${wait}s before retry ${i + 1}/${retries}...`)
        await new Promise(r => setTimeout(r, wait * 1000))
      } else {
        throw err
      }
    }
  }
  throw new Error('Airdrop failed after retries — devnet faucet is rate limiting. Try again in a few minutes.')
}

async function main() {
  console.log('=== Foresight Badge Mint — Devnet End-to-End Test ===\n')

  const connection = getConnection()

  // ── Step 1: Load memo chain wallet ──
  console.log('1. Loading memo chain wallet...')
  const memoWalletAddress = getWalletAddress()
  const memoKeypair = getKeypairForForwarding()
  console.log(`   Address: ${memoWalletAddress}`)
  console.log(`   Explorer: ${getWalletExplorerUrl()}`)

  let memoBalance = await connection.getBalance(memoKeypair.publicKey)
  console.log(`   Balance: ${memoBalance / LAMPORTS_PER_SOL} SOL\n`)

  // ── Step 2: Fund memo chain wallet if needed ──
  if (memoBalance < 0.01 * LAMPORTS_PER_SOL) {
    console.log('2. Funding memo chain wallet...')
    await airdropWithRetry(connection, memoKeypair.publicKey, 2 * LAMPORTS_PER_SOL)
    memoBalance = await connection.getBalance(memoKeypair.publicKey)
    console.log(`   New balance: ${memoBalance / LAMPORTS_PER_SOL} SOL\n`)
  } else {
    console.log(`2. Memo chain wallet already funded (${memoBalance / LAMPORTS_PER_SOL} SOL)\n`)
  }

  // ── Step 3: Create test agent wallet ──
  console.log('3. Creating test agent wallet...')
  const agentKeypair = Keypair.generate()
  console.log(`   Agent address: ${agentKeypair.publicKey.toBase58()}`)

  // Fund agent from memo chain wallet (avoids faucet rate limits)
  console.log('   Funding agent from memo chain wallet (1.5 SOL)...')
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: memoKeypair.publicKey,
      toPubkey: agentKeypair.publicKey,
      lamports: BigInt(1.5 * LAMPORTS_PER_SOL),
    })
  )
  await sendAndConfirmTransaction(connection, fundTx, [memoKeypair], { commitment: 'confirmed' })
  const agentBalance = await connection.getBalance(agentKeypair.publicKey)
  console.log(`   Agent balance: ${agentBalance / LAMPORTS_PER_SOL} SOL\n`)

  // ── Step 4: Agent sends 1 SOL payment to memo chain wallet ──
  console.log('4. Agent sending 1 SOL payment to memo chain wallet...')
  const paymentTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: agentKeypair.publicKey,
      toPubkey: memoKeypair.publicKey,
      lamports: BADGE_PRICE_LAMPORTS,
    })
  )
  const paymentSig = await sendAndConfirmTransaction(connection, paymentTx, [agentKeypair], {
    commitment: 'confirmed',
  })
  console.log(`   Payment tx: ${paymentSig}`)
  console.log(`   Explorer: https://explorer.solana.com/tx/${paymentSig}?cluster=devnet\n`)

  // ── Step 5: Verify payment (same logic as mint endpoint) ──
  console.log('5. Verifying payment transaction...')
  const verification = await verifyTransaction(paymentSig, BADGE_PRICE_LAMPORTS, memoWalletAddress)
  console.log(`   Verified: ${verification.verified}`)
  if (!verification.verified) {
    console.error(`   ERROR: ${verification.error}`)
    process.exit(1)
  }
  console.log(`   Payment verified!\n`)

  // ── Step 6: Write badge memo on-chain ──
  console.log('6. Recording badge on-chain via memo...')
  const testUserId = 'test_agent_' + Date.now().toString(36)
  const memoResult = await recordBadgeMint(
    testUserId,
    0.72,   // foresightScore
    0.65,   // ideaViability
    0.80,   // votingAccuracy
    0.55,   // commentStrength
    15,     // deliberationsParticipated
    8,      // ideasSubmitted
    3,      // ideasWon
  )
  console.log(`   Memo tx: ${memoResult.signature}`)
  console.log(`   Explorer: ${memoResult.explorer}`)
  console.log(`   Memo: ${memoResult.memo}\n`)

  // ── Step 7: Forward SOL to treasury ──
  const treasuryAddress = process.env.TREASURY_ADDRESS
  console.log('7. Forwarding SOL to treasury...')
  console.log(`   Treasury: ${treasuryAddress || '(not set)'}`)

  if (treasuryAddress) {
    try {
      const forwardSig = await forwardToTreasury(memoKeypair, BADGE_PRICE_LAMPORTS)
      if (forwardSig) {
        console.log(`   Forward tx: ${forwardSig}`)
        console.log(`   Explorer: https://explorer.solana.com/tx/${forwardSig}?cluster=devnet`)
      } else {
        console.log(`   No SOL forwarded (insufficient balance after reserve)`)
      }
    } catch (err) {
      console.log(`   Forward failed (non-fatal): ${err}`)
    }
  } else {
    console.log(`   Skipped — TREASURY_ADDRESS not set`)
  }
  console.log()

  // ── Final balance check ──
  console.log('8. Final balances:')
  const finalMemoBalance = await connection.getBalance(memoKeypair.publicKey)
  console.log(`   Memo chain wallet: ${finalMemoBalance / LAMPORTS_PER_SOL} SOL`)
  if (treasuryAddress) {
    try {
      const treasuryBalance = await connection.getBalance(new PublicKey(treasuryAddress))
      console.log(`   Treasury wallet:   ${treasuryBalance / LAMPORTS_PER_SOL} SOL`)
    } catch {
      console.log(`   Treasury wallet:   (couldn't fetch)`)
    }
  }
  const finalAgentBalance = await connection.getBalance(agentKeypair.publicKey)
  console.log(`   Agent wallet:      ${finalAgentBalance / LAMPORTS_PER_SOL} SOL`)

  console.log(`\n=== Full audit trail: ${getWalletExplorerUrl()} ===`)
  console.log('=== Badge Mint Test PASSED ===')
}

main().catch(err => {
  console.error('\nTest FAILED:', err)
  process.exit(1)
})
