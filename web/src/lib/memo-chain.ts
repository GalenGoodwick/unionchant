/**
 * Memo Chain — On-chain audit log for Unity Chant deliberations.
 *
 * Records every event (idea, cell, vote, tier result, champion) as a Solana
 * memo transaction. The transaction history IS the immutable audit trail.
 * The CHAMPION transaction signature = the go-ahead key.
 *
 * Memo format: UC|{type}|{chant_id}|{payload}
 *
 * Types:
 *   INIT      — chant created
 *   IDEA      — idea submitted
 *   CELL      — cell formed
 *   VOTE      — vote cast (allocation vector)
 *   TIER      — tier completed
 *   PHASE     — phase changed
 *   CHAMPION  — winner declared (go-ahead key)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import { createHash } from 'crypto'

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
const NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'mainnet-beta' | 'testnet'
const MAX_MEMO_BYTES = 566 // safe memo limit

// ── Keypair management ──

let _keypair: Keypair | null = null

function getKeypair(): Keypair {
  if (_keypair) return _keypair

  const secret = process.env.MEMO_CHAIN_KEYPAIR
  if (!secret) {
    console.warn('[memo-chain] MEMO_CHAIN_KEYPAIR not set, memo chain disabled')
    throw new Error('MEMO_CHAIN_KEYPAIR not configured')
  }

  try {
    const secretKey = Uint8Array.from(JSON.parse(secret))
    _keypair = Keypair.fromSecretKey(secretKey)
    return _keypair
  } catch {
    throw new Error('Invalid MEMO_CHAIN_KEYPAIR format')
  }
}

function getConnection(): Connection {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(NETWORK)
  return new Connection(endpoint, 'confirmed')
}

// ── Core: send a memo transaction ──

async function sendMemo(memo: string): Promise<string> {
  const keypair = getKeypair()
  const connection = getConnection()

  // Truncate if too long
  const memoBytes = Buffer.from(memo, 'utf-8')
  const data = memoBytes.length > MAX_MEMO_BYTES
    ? memoBytes.subarray(0, MAX_MEMO_BYTES)
    : memoBytes

  const instruction = new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data,
  })

  const tx = new Transaction().add(instruction)
  const signature = await sendAndConfirmTransaction(connection, tx, [keypair], {
    commitment: 'confirmed',
  })

  return signature
}

// ── Memo formatting helpers ──

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 3) + '...'
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

// ── Public API: record events ──

export interface MemoResult {
  signature: string
  explorer: string
  memo: string
}

function explorerUrl(sig: string): string {
  const cluster = NETWORK === 'mainnet-beta' ? '' : `?cluster=${NETWORK}`
  return `https://explorer.solana.com/tx/${sig}${cluster}`
}

/**
 * Record chant initialization.
 */
export async function recordChantInit(chantId: string, question: string, cellSize: number, continuousFlow: boolean): Promise<MemoResult> {
  const memo = `UC|INIT|${chantId}|q:${truncate(question, 200)}|cs:${cellSize}|cf:${continuousFlow ? 1 : 0}`
  const signature = await sendMemo(memo)
  return { signature, explorer: explorerUrl(signature), memo }
}

/**
 * Record an idea submission.
 * If facilitator is true, marks the idea as facilitator-submitted (not a participant's own idea).
 */
export async function recordIdea(chantId: string, ideaIndex: number, text: string, authorId: string, facilitator?: boolean): Promise<MemoResult> {
  const role = facilitator ? '|role:facilitator' : ''
  const memo = `UC|IDEA|${chantId}|${ideaIndex}|${truncate(text, 280)}|by:${authorId}${role}`
  const signature = await sendMemo(memo)
  return { signature, explorer: explorerUrl(signature), memo }
}

/**
 * Record a cell creation.
 */
export async function recordCell(chantId: string, cellIndex: number, tier: number, batch: number, ideaIndices: number[]): Promise<MemoResult> {
  const memo = `UC|CELL|${chantId}|${cellIndex}|t:${tier}|b:${batch}|ideas:${ideaIndices.join(',')}`
  const signature = await sendMemo(memo)
  return { signature, explorer: explorerUrl(signature), memo }
}

/**
 * Record a vote (XP allocation vector).
 */
export async function recordVote(chantId: string, cellIndex: number, voterId: string, allocations: { ideaIndex: number; points: number }[]): Promise<MemoResult> {
  const alloc = allocations.map(a => `${a.ideaIndex}:${a.points}`).join(',')
  const memo = `UC|VOTE|${chantId}|c:${cellIndex}|v:${voterId}|${alloc}`
  const signature = await sendMemo(memo)
  return { signature, explorer: explorerUrl(signature), memo }
}

/**
 * Record tier completion.
 */
export async function recordTierResult(chantId: string, tier: number, advancing: { ideaIndex: number; xp: number }[]): Promise<MemoResult> {
  const adv = advancing.map(a => `${a.ideaIndex}=${a.xp}`).join(',')
  const memo = `UC|TIER|${chantId}|${tier}|adv:${adv}`
  const signature = await sendMemo(memo)
  return { signature, explorer: explorerUrl(signature), memo }
}

/**
 * Record phase change.
 */
export async function recordPhaseChange(chantId: string, oldPhase: string, newPhase: string): Promise<MemoResult> {
  const memo = `UC|PHASE|${chantId}|${oldPhase}->${newPhase}`
  const signature = await sendMemo(memo)
  return { signature, explorer: explorerUrl(signature), memo }
}

/**
 * Record champion declaration — THE GO-AHEAD KEY.
 * The returned transaction signature is the verifiable proof that a
 * legitimate deliberation completed and produced this winner.
 */
export async function recordChampion(
  chantId: string,
  ideaIndex: number,
  ideaText: string,
  totalTiers: number,
  totalVoters: number,
  merkleRoot?: string,
): Promise<MemoResult> {
  const textHash = sha256(ideaText)
  const memo = `UC|CHAMPION|${chantId}|idea:${ideaIndex}|hash:${textHash}|tiers:${totalTiers}|voters:${totalVoters}${merkleRoot ? `|root:${merkleRoot.slice(0, 16)}` : ''}`
  const signature = await sendMemo(memo)
  return { signature, explorer: explorerUrl(signature), memo }
}

// ── Read: reconstruct chant from memo history ──

export interface MemoEntry {
  signature: string
  memo: string
  type: string
  timestamp: number | null
}

/**
 * Fetch all UC memo transactions for the configured wallet.
 * Filters by chantId if provided.
 */
export async function readMemoChain(chantId?: string): Promise<MemoEntry[]> {
  const keypair = getKeypair()
  const connection = getConnection()

  const signatures = await connection.getSignaturesForAddress(keypair.publicKey, { limit: 1000 })
  const entries: MemoEntry[] = []

  for (const sigInfo of signatures) {
    const tx = await connection.getTransaction(sigInfo.signature, {
      maxSupportedTransactionVersion: 0,
    })
    if (!tx || tx.meta?.err) continue

    // Extract memo from log messages
    const logs = tx.meta?.logMessages || []
    const memoLog = logs.find(l => l.startsWith('Program log: Memo'))
    if (!memoLog) continue

    // Parse memo text from log
    const memoMatch = memoLog.match(/Memo \(len \d+\): "(.*)"/) ||
                      memoLog.match(/Memo \(len \d+\): (.*)/)
    if (!memoMatch) continue

    const memo = memoMatch[1]
    if (!memo.startsWith('UC|')) continue
    if (chantId && !memo.includes(chantId)) continue

    const parts = memo.split('|')
    entries.push({
      signature: sigInfo.signature,
      memo,
      type: parts[1] || 'UNKNOWN',
      timestamp: tx.blockTime || null,
    })
  }

  return entries.reverse() // chronological order
}

/**
 * Get the wallet public key used for memo chain.
 * Useful for explorer links.
 */
export function getWalletAddress(): string {
  return getKeypair().publicKey.toBase58()
}

/**
 * Get explorer URL for the memo chain wallet (shows all transactions).
 */
export function getWalletExplorerUrl(): string {
  const cluster = NETWORK === 'mainnet-beta' ? '' : `?cluster=${NETWORK}`
  return `https://explorer.solana.com/address/${getWalletAddress()}${cluster}`
}

/**
 * Ensure the wallet has enough SOL for transactions.
 * On devnet, requests an airdrop if balance is low.
 */
export async function ensureBalance(): Promise<number> {
  const keypair = getKeypair()
  const connection = getConnection()

  let balance = await connection.getBalance(keypair.publicKey)

  if (NETWORK === 'devnet' && balance < 0.01 * LAMPORTS_PER_SOL) {
    const sig = await connection.requestAirdrop(keypair.publicKey, 1 * LAMPORTS_PER_SOL)
    await connection.confirmTransaction(sig, 'confirmed')
    balance = await connection.getBalance(keypair.publicKey)
  }

  return balance / LAMPORTS_PER_SOL
}
