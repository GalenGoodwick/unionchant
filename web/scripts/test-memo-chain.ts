/**
 * Test the Memo Chain on Solana devnet.
 *
 * Simulates a full chant: init → 5 ideas (one long/chained) → facilitator action →
 * 1 cell → 5 votes → tier result → champion.
 * All events recorded as memo transactions on devnet.
 *
 * Usage:
 *   npx tsx scripts/test-memo-chain.ts
 *
 * Requires: MEMO_CHAIN_KEYPAIR env var (or generates one for testing)
 */

import { Keypair, Connection, clusterApiUrl, LAMPORTS_PER_SOL } from '@solana/web3.js'
import {
  recordChantInit,
  recordIdea,
  recordCell,
  recordVote,
  recordTierResult,
  recordChampion,
  recordFacilitatorAction,
  readMemoChain,
  reassembleIdea,
  getWalletExplorerUrl,
  ensureBalance,
} from '../src/lib/memo-chain'
import * as fs from 'fs'
import * as path from 'path'

// Generate or load a test keypair
const keypairPath = path.join(__dirname, '..', '.memo-chain-keypair.json')

if (!process.env.MEMO_CHAIN_KEYPAIR) {
  let keypair: Keypair
  if (fs.existsSync(keypairPath)) {
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')))
    keypair = Keypair.fromSecretKey(secretKey)
    console.log(`Loaded test keypair: ${keypair.publicKey.toBase58()}`)
  } else {
    keypair = Keypair.generate()
    fs.writeFileSync(keypairPath, JSON.stringify(Array.from(keypair.secretKey)))
    console.log(`Generated test keypair: ${keypair.publicKey.toBase58()}`)
  }
  process.env.MEMO_CHAIN_KEYPAIR = JSON.stringify(Array.from(keypair.secretKey))
}

async function main() {
  console.log('=== Memo Chain Test v2 — Signature-Chained Multi-Part ===\n')

  // Ensure we have SOL
  const balance = await ensureBalance()
  console.log(`Wallet balance: ${balance} SOL`)
  console.log(`Explorer: ${getWalletExplorerUrl()}\n`)

  const chantId = `test_${Date.now().toString(36)}`
  console.log(`Chant ID: ${chantId}\n`)

  // 1. Initialize chant
  console.log('1. Initializing chant...')
  const init = await recordChantInit(chantId, 'Which project should we fund?', 5, false)
  console.log(`   TX: ${init.explorer}`)
  console.log(`   Memo: ${init.memo}\n`)

  // 2. Record 5 ideas — idea #2 is deliberately long to test multi-part chaining
  const ideas = [
    'Build a decentralized exchange',
    'Create an AI governance protocol',
    // Long idea: ~800 bytes to force 2-part chain
    'Launch a privacy-first messaging app that uses end-to-end encryption with perfect forward secrecy, ' +
    'supports group chats of up to 1000 members with minimal metadata leakage, ' +
    'implements disappearing messages with cryptographic deletion proofs, ' +
    'provides anonymous identity verification through zero-knowledge proofs, ' +
    'offers decentralized key management so no single server holds user keys, ' +
    'includes built-in censorship resistance via relay nodes that can be run by anyone, ' +
    'and features a reputation system where message delivery reliability is tracked ' +
    'without revealing message contents or recipient identities to the network operators.',
    'Develop a cross-chain bridge',
    'Design a reputation oracle system',
  ]

  console.log('2. Recording 5 ideas (idea #2 is long → multi-part chain)...')
  for (let i = 0; i < ideas.length; i++) {
    const result = await recordIdea(chantId, i, ideas[i], `author_${i}`)
    if (result.parts > 1) {
      console.log(`   [${i}] CHAINED: ${result.parts} parts, ${result.signatures.length} tx`)
      for (let j = 0; j < result.signatures.length; j++) {
        const sig = result.signatures[j]
        const prevLink = j > 0 ? ` → prev:${result.signatures[j-1].slice(0, 16)}` : ' (anchor)'
        console.log(`       part ${j+1}: ${sig.slice(0, 32)}...${prevLink}`)
      }
    } else {
      console.log(`   [${i}] ${result.explorer}`)
    }
  }
  console.log()

  // 3. Facilitator starts voting
  console.log('3. Recording facilitator action: START_VOTING...')
  const facil = await recordFacilitatorAction(chantId, 'START_VOTING', 'facilitator_1', 'Manual start after 5 ideas')
  console.log(`   TX: ${facil.explorer}`)
  console.log(`   Memo: ${facil.memo}\n`)

  // 4. Record cell
  console.log('4. Recording cell (tier 1, all 5 ideas)...')
  const cell = await recordCell(chantId, 0, 1, 0, [0, 1, 2, 3, 4])
  console.log(`   TX: ${cell.explorer}\n`)

  // 5. Record 5 votes (10 points each, distributed across ideas)
  const votes = [
    [{ ideaIndex: 0, points: 4 }, { ideaIndex: 1, points: 3 }, { ideaIndex: 4, points: 3 }],
    [{ ideaIndex: 1, points: 5 }, { ideaIndex: 2, points: 3 }, { ideaIndex: 3, points: 2 }],
    [{ ideaIndex: 0, points: 6 }, { ideaIndex: 4, points: 4 }],
    [{ ideaIndex: 4, points: 7 }, { ideaIndex: 0, points: 3 }],
    [{ ideaIndex: 0, points: 2 }, { ideaIndex: 1, points: 2 }, { ideaIndex: 2, points: 2 }, { ideaIndex: 3, points: 2 }, { ideaIndex: 4, points: 2 }],
  ]

  console.log('5. Recording 5 votes...')
  for (let i = 0; i < votes.length; i++) {
    const result = await recordVote(chantId, 0, `voter_${i}`, votes[i])
    console.log(`   [voter_${i}] ${result.explorer}`)
  }
  console.log()

  // 6. Record tier result (idea 0 and 4 advance with most XP)
  console.log('6. Recording tier result...')
  const tier = await recordTierResult(chantId, 1, [
    { ideaIndex: 0, xp: 15 },
    { ideaIndex: 4, xp: 16 },
  ])
  console.log(`   TX: ${tier.explorer}\n`)

  // 7. Facilitator declares priority
  console.log('7. Recording facilitator action: DECLARE_PRIORITY...')
  const decl = await recordFacilitatorAction(chantId, 'DECLARE_PRIORITY', 'facilitator_1', 'idea:4')
  console.log(`   TX: ${decl.explorer}\n`)

  // 8. Declare champion
  console.log('8. Declaring champion (idea 4: "Design a reputation oracle system")...')
  const champion = await recordChampion(
    chantId,
    4,
    'Design a reputation oracle system',
    1,
    5,
  )
  console.log(`   TX: ${champion.explorer}`)
  console.log(`   Memo: ${champion.memo}`)
  console.log(`\n   *** GO-AHEAD KEY: ${champion.signature} ***\n`)

  // 9. Read back the memo chain
  console.log('9. Reading memo chain back...')
  const entries = await readMemoChain(chantId)
  console.log(`   Found ${entries.length} entries:\n`)
  for (const entry of entries) {
    const ts = entry.timestamp ? new Date(entry.timestamp * 1000).toISOString() : '???'
    const chain = entry.prevLink ? ` [prev:${entry.prevLink}]` : ''
    const part = entry.part ? ` [p:${entry.part.current}/${entry.part.total}]` : ''
    console.log(`   [${entry.type.padEnd(8)}] ${ts}${part}${chain} | ${entry.memo.slice(0, 120)}${entry.memo.length > 120 ? '...' : ''}`)
  }

  // 10. Reassemble multi-part idea #2
  console.log('\n10. Reassembling multi-part idea #2...')
  const ideaEntries = entries.filter(e =>
    (e.type === 'IDEA' || e.type === 'IDEA+') &&
    e.memo.includes(`|2|`) // idea index 2
  )
  const reassembled = reassembleIdea(ideaEntries)
  console.log(`   Parts: ${reassembled.parts}`)
  console.log(`   Chain verified: ${reassembled.verified}`)
  console.log(`   Text length: ${reassembled.text.length} chars`)
  console.log(`   Match original: ${reassembled.text === ideas[2]}`)
  if (reassembled.text !== ideas[2]) {
    console.log(`   Original: ${ideas[2].slice(0, 80)}...`)
    console.log(`   Got:      ${reassembled.text.slice(0, 80)}...`)
  }

  console.log(`\n=== Full audit trail: ${getWalletExplorerUrl()} ===`)
  console.log('=== Done ===')
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
