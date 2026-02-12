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
 *   IDEA      — idea submitted (single part, fits in one tx)
 *   IDEA+     — idea continuation (multi-part chain for long text)
 *   CELL      — cell formed
 *   VOTE      — vote cast (allocation vector)
 *   TIER      — tier completed
 *   PHASE     — phase changed
 *   COMMENT   — cell discussion comment (multi-part if long: COMMENT / COMMENT+)
 *   UPVOTE    — upvote on a comment (links to comment tx sig)
 *   FACIL     — facilitator action (start voting, declare priority, force-close, etc.)
 *   CHAMPION  — winner declared (go-ahead key)
 *
 * Multi-part memos (signature-chained):
 *   When idea text exceeds one transaction, it splits across a chain:
 *   Part 1: UC|IDEA|{chantId}|{index}|p:1/N|by:{author}|{text_chunk}
 *   Part 2: UC|IDEA+|{chantId}|{index}|p:2/N|prev:{sig16}|{text_chunk}
 *   Part 3: UC|IDEA+|{chantId}|{index}|p:3/N|prev:{sig16}|{text_chunk}
 *   Each part links to the previous tx signature (first 16 chars).
 *   Verifier follows the chain: look up prev sig, confirm it exists, concatenate text.
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
const SIG_LINK_LEN = 16 // chars of prev signature to include in chain

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

  const memoBytes = Buffer.from(memo, 'utf-8')
  if (memoBytes.length > MAX_MEMO_BYTES) {
    throw new Error(`Memo exceeds ${MAX_MEMO_BYTES} bytes (${memoBytes.length}). Use sendChainedMemo for long content.`)
  }

  const instruction = new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: memoBytes,
  })

  const tx = new Transaction().add(instruction)
  const signature = await sendAndConfirmTransaction(connection, tx, [keypair], {
    commitment: 'confirmed',
  })

  return signature
}

// ── Multi-part signature-chained memos ──

/**
 * Split content into a chain of memo transactions, each linking to the previous
 * via its tx signature. Creates a verifiable linked list on-chain.
 *
 * @param firstMemoFn  - builds the first memo string given (partStr, textChunk)
 * @param contMemoFn   - builds continuation memos given (partStr, prevSigShort, textChunk)
 * @param content      - the full text to chain across transactions
 * @param firstOverhead - byte budget used by the first memo's header (before text)
 * @param contOverhead  - byte budget used by continuation headers (before text)
 * @returns all signatures and the concatenated memo strings
 */
async function sendChainedMemo(
  firstMemoFn: (partStr: string, chunk: string) => string,
  contMemoFn: (partStr: string, prevSig: string, chunk: string) => string,
  content: string,
  firstOverhead: number,
  contOverhead: number,
): Promise<{ signatures: string[]; memos: string[] }> {
  const firstAvailable = MAX_MEMO_BYTES - firstOverhead
  const contAvailable = MAX_MEMO_BYTES - contOverhead

  // Pre-calculate chunks to know total count
  // First pass: estimate with single-digit part numbers, adjust if needed
  const chunks: string[] = []
  let offset = 0
  let isFirst = true
  while (offset < content.length) {
    const available = isFirst ? firstAvailable : contAvailable
    let end = offset
    let byteLen = 0
    while (end < content.length) {
      const charBytes = Buffer.from(content[end], 'utf-8').length
      if (byteLen + charBytes > available) break
      byteLen += charBytes
      end++
    }
    if (end === offset) {
      // Safety: advance at least one character to prevent infinite loop
      end = offset + 1
    }
    chunks.push(content.slice(offset, end))
    offset = end
    isFirst = false
  }

  const total = chunks.length

  if (total === 1) {
    // Fits in one memo
    const memo = firstMemoFn(`1/1`, chunks[0])
    const sig = await sendMemo(memo)
    return { signatures: [sig], memos: [memo] }
  }

  const signatures: string[] = []
  const memos: string[] = []

  for (let i = 0; i < total; i++) {
    const partStr = `${i + 1}/${total}`
    let memo: string
    if (i === 0) {
      memo = firstMemoFn(partStr, chunks[i])
    } else {
      const prevSig = signatures[i - 1].slice(0, SIG_LINK_LEN)
      memo = contMemoFn(partStr, prevSig, chunks[i])
    }
    const sig = await sendMemo(memo)
    signatures.push(sig)
    memos.push(memo)
  }

  return { signatures, memos }
}

// ── Memo formatting helpers ──

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 3) + '...'
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

function memoByteLen(s: string): number {
  return Buffer.from(s, 'utf-8').length
}

// ── Public API: record events ──

export interface MemoResult {
  signature: string
  explorer: string
  memo: string
}

export interface MultiPartMemoResult {
  /** First signature (primary — use for indexing) */
  signature: string
  /** All signatures in the chain */
  signatures: string[]
  explorer: string
  memos: string[]
  parts: number
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
 * Record an idea submission — full text on-chain.
 * Short ideas fit in one tx. Long ideas chain across multiple tx,
 * each linking to the previous via its signature.
 *
 * Chain structure:
 *   Part 1: UC|IDEA|{chantId}|{index}|p:1/N|by:{author}[|role:facilitator]|{text}
 *   Part 2: UC|IDEA+|{chantId}|{index}|p:2/N|prev:{sig16}|{text}
 *   ...
 */
export async function recordIdea(
  chantId: string,
  ideaIndex: number,
  text: string,
  authorId: string,
  facilitator?: boolean,
): Promise<MultiPartMemoResult> {
  const role = facilitator ? '|role:facilitator' : ''

  // Header for part 1: UC|IDEA|{chantId}|{index}|p:X/Y|by:{author}[|role:facilitator]|
  const firstHeaderBase = `UC|IDEA|${chantId}|${ideaIndex}|p:XX/XX|by:${authorId}${role}|`
  const firstOverhead = memoByteLen(firstHeaderBase)

  // Header for continuations: UC|IDEA+|{chantId}|{index}|p:X/Y|prev:XXXXXXXXXXXXXXXX|
  const contHeaderBase = `UC|IDEA+|${chantId}|${ideaIndex}|p:XX/XX|prev:${'X'.repeat(SIG_LINK_LEN)}|`
  const contOverhead = memoByteLen(contHeaderBase)

  // Check if it fits in a single memo
  const singleMemo = `UC|IDEA|${chantId}|${ideaIndex}|by:${authorId}${role}|${text}`
  if (memoByteLen(singleMemo) <= MAX_MEMO_BYTES) {
    const signature = await sendMemo(singleMemo)
    return {
      signature,
      signatures: [signature],
      explorer: explorerUrl(signature),
      memos: [singleMemo],
      parts: 1,
    }
  }

  // Multi-part chain
  const { signatures, memos } = await sendChainedMemo(
    (partStr, chunk) => `UC|IDEA|${chantId}|${ideaIndex}|p:${partStr}|by:${authorId}${role}|${chunk}`,
    (partStr, prevSig, chunk) => `UC|IDEA+|${chantId}|${ideaIndex}|p:${partStr}|prev:${prevSig}|${chunk}`,
    text,
    firstOverhead,
    contOverhead,
  )

  return {
    signature: signatures[0],
    signatures,
    explorer: explorerUrl(signatures[0]),
    memos,
    parts: signatures.length,
  }
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

// ── Facilitator actions ──

export type FacilitatorAction =
  | 'START_VOTING'
  | 'DECLARE_PRIORITY'
  | 'FORCE_CLOSE_CELL'
  | 'END_CHANT'
  | 'START_ACCUMULATION'
  | 'START_CHALLENGE'
  | 'SEED_IDEA'
  | 'REMOVE_IDEA'
  | 'EXTEND_TIMER'

/**
 * Record a facilitator action on-chain.
 * Captures who did what and when — full accountability.
 *
 * Format: UC|FACIL|{chantId}|{action}|by:{userId}[|{detail}]
 */
export async function recordFacilitatorAction(
  chantId: string,
  action: FacilitatorAction,
  userId: string,
  detail?: string,
): Promise<MemoResult> {
  const detailPart = detail ? `|${truncate(detail, 200)}` : ''
  const memo = `UC|FACIL|${chantId}|${action}|by:${userId}${detailPart}`
  const signature = await sendMemo(memo)
  return { signature, explorer: explorerUrl(signature), memo }
}

// ── Discussion: comments + upvotes ──

/**
 * Record a comment in a cell discussion.
 * Format: UC|COMMENT|{chantId}|c:{cellIndex}|by:{agentId}|idea:{ideaIndex}|{text}
 * If text is long, uses multi-part chaining (COMMENT / COMMENT+).
 */
export async function recordComment(
  chantId: string,
  cellIndex: number,
  agentId: string,
  text: string,
  ideaIndex?: number,
): Promise<MultiPartMemoResult> {
  const ideaPart = ideaIndex !== undefined ? `|idea:${ideaIndex}` : ''

  // Check single memo fit
  const singleMemo = `UC|COMMENT|${chantId}|c:${cellIndex}|by:${agentId}${ideaPart}|${text}`
  if (memoByteLen(singleMemo) <= MAX_MEMO_BYTES) {
    const signature = await sendMemo(singleMemo)
    return {
      signature,
      signatures: [signature],
      explorer: explorerUrl(signature),
      memos: [singleMemo],
      parts: 1,
    }
  }

  // Multi-part chain for long comments
  const firstHeaderBase = `UC|COMMENT|${chantId}|c:${cellIndex}|p:XX/XX|by:${agentId}${ideaPart}|`
  const firstOverhead = memoByteLen(firstHeaderBase)
  const contHeaderBase = `UC|COMMENT+|${chantId}|c:${cellIndex}|p:XX/XX|prev:${'X'.repeat(SIG_LINK_LEN)}|`
  const contOverhead = memoByteLen(contHeaderBase)

  const { signatures, memos } = await sendChainedMemo(
    (partStr, chunk) => `UC|COMMENT|${chantId}|c:${cellIndex}|p:${partStr}|by:${agentId}${ideaPart}|${chunk}`,
    (partStr, prevSig, chunk) => `UC|COMMENT+|${chantId}|c:${cellIndex}|p:${partStr}|prev:${prevSig}|${chunk}`,
    text,
    firstOverhead,
    contOverhead,
  )

  return {
    signature: signatures[0],
    signatures,
    explorer: explorerUrl(signatures[0]),
    memos,
    parts: signatures.length,
  }
}

/**
 * Record an upvote on a comment.
 * Links to the comment's tx signature — verifiable on-chain reference.
 * Format: UC|UPVOTE|{chantId}|c:{cellIndex}|by:{agentId}|comment:{sig16}
 */
export async function recordUpvote(
  chantId: string,
  cellIndex: number,
  agentId: string,
  commentSig: string,
): Promise<MemoResult> {
  const memo = `UC|UPVOTE|${chantId}|c:${cellIndex}|by:${agentId}|comment:${commentSig.slice(0, SIG_LINK_LEN)}`
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

// ── Foresight Badge ──

/**
 * Record a Foresight Badge mint on-chain.
 * This is the paid attestation — permanent, verifiable proof of reputation.
 *
 * Format: UC|BADGE|{userId}|score:{score}|idea:{pct}|vote:{pct}|comment:{pct}|delibs:{n}|ideas:{n}|wins:{n}|ts:{unix}
 */
export async function recordBadgeMint(
  userId: string,
  foresightScore: number,
  ideaViability: number,
  votingAccuracy: number,
  commentStrength: number,
  deliberationsParticipated: number,
  ideasSubmitted: number,
  ideasWon: number,
): Promise<MemoResult> {
  const ts = Math.floor(Date.now() / 1000)
  const memo = `UC|BADGE|${userId}|score:${foresightScore}|idea:${ideaViability}|vote:${votingAccuracy}|comment:${commentStrength}|delibs:${deliberationsParticipated}|ideas:${ideasSubmitted}|wins:${ideasWon}|ts:${ts}`
  const signature = await sendMemo(memo)
  return { signature, explorer: explorerUrl(signature), memo }
}

// ── Read: reconstruct chant from memo history ──

export interface MemoEntry {
  signature: string
  memo: string
  type: string
  timestamp: number | null
  /** For IDEA+ parts: previous tx signature link */
  prevLink?: string
  /** For IDEA/IDEA+ parts: part number info */
  part?: { current: number; total: number }
}

/**
 * Fetch all UC memo transactions for the configured wallet.
 * Filters by chantId if provided. Reassembles multi-part ideas.
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
    const type = parts[1] || 'UNKNOWN'

    const entry: MemoEntry = {
      signature: sigInfo.signature,
      memo,
      type,
      timestamp: tx.blockTime || null,
    }

    // Parse chain links from IDEA+ parts
    if (type === 'IDEA+') {
      const prevMatch = memo.match(/prev:([A-Za-z0-9]{16})/)
      if (prevMatch) entry.prevLink = prevMatch[1]
    }

    // Parse part info from IDEA or IDEA+
    if (type === 'IDEA' || type === 'IDEA+') {
      const partMatch = memo.match(/p:(\d+)\/(\d+)/)
      if (partMatch) {
        entry.part = { current: parseInt(partMatch[1]), total: parseInt(partMatch[2]) }
      }
    }

    entries.push(entry)
  }

  return entries.reverse() // chronological order
}

/**
 * Reassemble a multi-part idea from memo entries.
 * Follows the signature chain to verify integrity and concatenates text.
 */
export function reassembleIdea(entries: MemoEntry[]): { text: string; verified: boolean; parts: number } {
  if (entries.length === 0) return { text: '', verified: false, parts: 0 }

  // Single-part idea (no p: field or p:1/1)
  if (entries.length === 1 && (!entries[0].part || entries[0].part.total === 1)) {
    // Extract text after the last metadata field
    const memo = entries[0].memo
    const byPrefix = memo.lastIndexOf('|by:')
    const roleEnd = memo.indexOf('|role:facilitator')
    const textStart = roleEnd !== -1
      ? memo.indexOf('|', roleEnd + 1)
      : memo.indexOf('|', byPrefix + 1)
    // For single-part with p: field
    const pMatch = memo.match(/\|p:\d+\/\d+\|/)
    if (pMatch) {
      // Text is everything after by:{author}| or role:facilitator|
      const afterBy = memo.indexOf('|', byPrefix + 4)
      const text = afterBy !== -1 ? memo.slice(afterBy + 1) : ''
      return { text, verified: true, parts: 1 }
    }
    // Single-part without p: (old format)
    const text = textStart !== -1 ? memo.slice(textStart + 1) : ''
    return { text, verified: true, parts: 1 }
  }

  // Sort by part number
  const sorted = [...entries].sort((a, b) => (a.part?.current || 0) - (b.part?.current || 0))

  // Verify chain integrity
  let verified = true
  for (let i = 1; i < sorted.length; i++) {
    const prevSig = sorted[i - 1].signature.slice(0, SIG_LINK_LEN)
    if (sorted[i].prevLink !== prevSig) {
      verified = false
      break
    }
  }

  // Concatenate text chunks
  const textParts: string[] = []
  for (const entry of sorted) {
    const memo = entry.memo
    // Text is everything after the last | before the content
    // For part 1: ...by:{author}|{text} or ...role:facilitator|{text}
    // For part 2+: ...prev:{sig16}|{text}
    if (entry.type === 'IDEA+') {
      const prevMatch = memo.match(/\|prev:[A-Za-z0-9]{16}\|/)
      if (prevMatch) {
        textParts.push(memo.slice(prevMatch.index! + prevMatch[0].length))
      }
    } else {
      // First part (IDEA type)
      const byIdx = memo.lastIndexOf('|by:')
      if (byIdx !== -1) {
        // Find end of by: and optional role: fields
        let searchFrom = byIdx + 4
        const roleIdx = memo.indexOf('|role:facilitator', searchFrom)
        if (roleIdx !== -1) searchFrom = roleIdx + '|role:facilitator'.length
        const nextPipe = memo.indexOf('|', searchFrom)
        if (nextPipe !== -1) {
          textParts.push(memo.slice(nextPipe + 1))
        }
      }
    }
  }

  return { text: textParts.join(''), verified, parts: sorted.length }
}

/**
 * Get the wallet public key used for memo chain.
 * Useful for explorer links.
 */
export function getWalletAddress(): string {
  return getKeypair().publicKey.toBase58()
}

/**
 * Get the keypair for SOL forwarding (memo chain wallet → treasury).
 * Only used by the payment forwarding system after badge/proof mints.
 */
export function getKeypairForForwarding(): Keypair {
  return getKeypair()
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
