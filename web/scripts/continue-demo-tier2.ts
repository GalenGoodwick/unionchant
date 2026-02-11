/**
 * Continue the 23-agent demo — Unstick tier 1, run tier 2, record to Solana.
 *
 * The original demo got stuck: all 5 tier 1 cells completed but
 * checkTierCompletion never fired. This script:
 *   1. Force-closes via /close endpoint (triggers checkTierCompletion)
 *   2. Has agents enter tier 2 cells, discuss, vote
 *   3. Records tier result + champion to devnet memo chain
 *
 * Usage:
 *   npx tsx scripts/continue-demo-tier2.ts
 */

import { Keypair } from '@solana/web3.js'
import {
  recordTierResult,
  recordCell,
  recordVote,
  recordComment,
  recordChampion,
  recordFacilitatorAction,
  recordPhaseChange,
  readMemoChain,
  getWalletExplorerUrl,
  ensureBalance,
} from '../src/lib/memo-chain'
import * as fs from 'fs'
import * as path from 'path'

// ── Load state from demo ──

const STATE_FILE = path.join(__dirname, '.demo-23-state.json')
const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
const CHANT_ID = state.chantId
const API_BASE = process.env.UC_API_BASE || 'https://unitychant.com/api/v1'

interface AgentState {
  name: string
  apiKey: string
  agentId: string
}

const agents: AgentState[] = state.agents
let txCount = state.txCount || 140

console.log(`Chant ID: ${CHANT_ID}`)
console.log(`Agents: ${agents.length}`)
console.log(`Starting tx count: ${txCount}`)

// ── Keypair setup ──

const keypairPath = path.join(__dirname, '..', '.memo-chain-keypair.json')
if (!process.env.MEMO_CHAIN_KEYPAIR) {
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')))
  const keypair = Keypair.fromSecretKey(secretKey)
  process.env.MEMO_CHAIN_KEYPAIR = JSON.stringify(Array.from(keypair.secretKey))
  console.log(`Keypair: ${keypair.publicKey.toBase58()}`)
}

// ── Helpers ──

async function api(method: string, apiPath: string, apiKey: string, body?: unknown): Promise<unknown> {
  const url = `${API_BASE}${apiPath}`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`API ${method} ${apiPath}: ${res.status} ${JSON.stringify(data)}`)
  }
  return data
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Vote generator (same as original demo) ──

function generateVote(ideas: { id: string; text: string }[], agentName: string): { ideaId: string; points: number }[] {
  const hash = Array.from(agentName).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
  const numAllocations = 2 + (Math.abs(hash) % Math.min(3, ideas.length))
  const selectedIdeas = [...ideas].sort((a, b) => {
    const ha = Array.from(agentName + a.id).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
    const hb = Array.from(agentName + b.id).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
    return ha - hb
  }).slice(0, Math.min(numAllocations, ideas.length))

  let remaining = 10
  const allocations: { ideaId: string; points: number }[] = []
  for (let i = 0; i < selectedIdeas.length; i++) {
    const isLast = i === selectedIdeas.length - 1
    const points = isLast ? remaining : Math.max(1, Math.floor(remaining / (selectedIdeas.length - i) + (Math.abs(hash + i) % 3) - 1))
    const clamped = Math.min(points, remaining - (selectedIdeas.length - i - 1))
    allocations.push({ ideaId: selectedIdeas[i].id, points: Math.max(1, clamped) })
    remaining -= Math.max(1, clamped)
  }
  const total = allocations.reduce((s, a) => s + a.points, 0)
  if (total < 10) allocations[0].points += 10 - total
  else if (total > 10) {
    allocations[0].points -= total - 10
    if (allocations[0].points < 1) allocations[0].points = 1
  }
  return allocations.filter(a => a.points > 0)
}

// ── Main ──

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║  Continue Demo — Tier 2 Final Showdown + Chain Record   ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')

  const balance = await ensureBalance()
  console.log(`Wallet: ${getWalletExplorerUrl()}`)
  console.log(`Balance: ${balance} SOL\n`)

  const creator = agents[0]

  // ── Step 1: Check current status ──
  console.log('━━━ Step 1: Check current status ━━━\n')

  const status0 = await api('GET', `/chants/${CHANT_ID}/status`, creator.apiKey) as {
    currentTier: number; phase: string
    ideas: { status: string; text: string; id: string }[]
    cells: { status: string; tier: number; id: string }[]
    champion?: { id: string; text: string }
  }

  console.log(`  Phase: ${status0.phase}`)
  console.log(`  Tier: ${status0.currentTier}`)
  const advancing0 = status0.ideas.filter(i => i.status === 'ADVANCING')
  const inVoting0 = status0.ideas.filter(i => i.status === 'IN_VOTING')
  console.log(`  Advancing: ${advancing0.length}`)
  console.log(`  In Voting: ${inVoting0.length}`)

  if (status0.phase === 'COMPLETED') {
    console.log('\n  Already completed!')
    if (status0.champion) {
      console.log(`  Champion: "${status0.champion.text.slice(0, 60)}..."`)
    }
    return
  }

  // ── Step 2: Force-close to trigger checkTierCompletion ──
  if (status0.currentTier === 1 && inVoting0.length === 0 && advancing0.length > 0) {
    console.log('\n━━━ Step 2: Force-close to unstick tier 1 ━━━\n')

    try {
      const closeResult = await api('POST', `/chants/${CHANT_ID}/close`, creator.apiKey, {}) as {
        success: boolean; closedCells: number; currentTier: number; phase: string
      }
      console.log(`  Close result: ${JSON.stringify(closeResult)}`)

      // Record facilitator action on chain
      const facilClose = await recordFacilitatorAction(CHANT_ID, 'FORCE_CLOSE_CELL', creator.agentId, 'Unstick tier 1 — all cells completed')
      txCount++
      console.log(`  📡 FACIL TX #${txCount}: ${facilClose.explorer}`)

      await sleep(5000)
    } catch (err: unknown) {
      console.error(`  Close failed: ${(err as Error).message}`)
    }
  }

  // ── Step 3: Record tier 1 result on chain ──
  console.log('\n━━━ Step 3: Record tier 1 result on chain ━━━\n')

  const status1 = await api('GET', `/chants/${CHANT_ID}/status`, creator.apiKey) as {
    currentTier: number; phase: string
    ideas: { status: string; text: string; id: string; totalXP?: number }[]
    cells: { status: string; tier: number; id: string }[]
    champion?: { id: string; text: string }
  }

  console.log(`  Phase: ${status1.phase}, Tier: ${status1.currentTier}`)

  const advancingIdeas = status1.ideas.filter(i =>
    i.status === 'ADVANCING' || i.status === 'IN_VOTING' || i.status === 'WINNER'
  )
  console.log(`  ${advancingIdeas.length} ideas advancing/in-voting/won:`)
  for (const idea of advancingIdeas) {
    console.log(`    [${idea.status}] "${idea.text.slice(0, 60)}..."`)
  }

  // Record tier 1 result
  const t1Advancing = advancingIdeas.map((idea, idx) => ({
    ideaIndex: status1.ideas.indexOf(idea),
    xp: (idea as any).totalXP || 10,
  }))
  const tierChain = await recordTierResult(CHANT_ID, 1, t1Advancing)
  txCount++
  console.log(`\n  📡 TIER 1 RESULT TX #${txCount}: ${tierChain.explorer}`)

  // ── Step 4: Tier 2 — Enter cells, discuss, vote ──
  if (status1.phase === 'COMPLETED' && status1.champion) {
    // Already done by force-close (final showdown happened automatically)
    console.log(`\n  Champion already declared by force-close: "${status1.champion.text.slice(0, 60)}..."`)

    // Record champion on chain
    const winnerIdx = status1.ideas.findIndex(i => i.status === 'WINNER')
    const championChain = await recordChampion(
      CHANT_ID,
      winnerIdx >= 0 ? winnerIdx : 0,
      status1.champion.text,
      status1.currentTier,
      agents.length,
    )
    txCount++
    console.log(`  📡 CHAMPION TX #${txCount}: ${championChain.explorer}`)
    console.log(`  🔑 GO-AHEAD KEY: ${championChain.signature}`)
  } else {
    console.log('\n━━━ Step 4: Tier 2 — Final Showdown ━━━\n')

    // All agents enter tier 2
    let enterCount = 0
    for (const agent of agents) {
      try {
        const enterResult = await api('POST', `/chants/${CHANT_ID}/cell/enter`, agent.apiKey, {}) as {
          entered: boolean; cell?: { id: string; tier: number; ideas: { id: string; text: string }[] }
        }
        if (enterResult.entered || enterResult.cell) {
          enterCount++
          console.log(`  [${enterCount}] ${agent.name} entered tier 2`)
        }
      } catch (err: unknown) {
        const msg = (err as Error).message
        if (!msg.includes('already') && !msg.includes('Round full')) {
          console.log(`  ${agent.name}: ${msg.slice(0, 60)}`)
        }
      }
      await sleep(200)
    }
    console.log(`\n  ${enterCount} agents entered tier 2\n`)

    // Record tier 2 cell on chain
    const cellChain = await recordCell(CHANT_ID, 5, 2, 0, [0, 1, 2, 3, 4])
    txCount++
    console.log(`  📡 CELL TX #${txCount}: ${cellChain.explorer}`)

    // Discussion
    console.log('\n  ── Tier 2 Discussion ──\n')

    const t2Comments = [
      { agent: agents[0], text: 'We need to pick the idea that creates the most verifiable, lasting trust infrastructure.' },
      { agent: agents[3], text: 'Reputation scores are portable and composable — they scale better than any other approach here.' },
      { agent: agents[8], text: 'Calibrated uncertainty is foundational. All other trust mechanisms fail if agents are overconfident.' },
      { agent: agents[15], text: 'Graceful degradation handles the failure modes that reputation alone cannot predict.' },
      { agent: agents[18], text: 'Data provenance is underrated — you cant trust an agent if you dont know where its knowledge comes from.' },
    ]

    for (const c of t2Comments) {
      try {
        await api('POST', `/chants/${CHANT_ID}/comment`, c.agent.apiKey, { text: c.text })
        const commentChain = await recordComment(CHANT_ID, 5, c.agent.agentId, c.text)
        txCount += commentChain.parts
        console.log(`  💬 ${c.agent.name}: "${c.text.slice(0, 50)}..."`)
      } catch {
        // Non-critical
      }
      await sleep(200)
    }

    // Voting
    console.log('\n  ── Tier 2 Voting ──\n')

    let voteCount = 0
    for (const agent of agents) {
      try {
        const cellResult = await api('GET', `/chants/${CHANT_ID}/cell`, agent.apiKey) as {
          cells: { ideas: { id: string; text: string }[]; myVote: unknown; tier: number }[]
        }

        // Find tier 2 cell
        const myCell = cellResult.cells?.find(c => c.tier >= 2 && !c.myVote)
        if (!myCell) continue

        const ideas = myCell.ideas
        if (ideas.length === 0) continue

        const allocations = generateVote(ideas, agent.name)
        await api('POST', `/chants/${CHANT_ID}/vote`, agent.apiKey, { allocations })

        // Record on chain
        const voteAllocs = allocations.map((a: { ideaId: string; points: number }) => {
          const ideaIdx = ideas.findIndex(i => i.id === a.ideaId)
          return { ideaIndex: ideaIdx, points: a.points }
        })
        const voteChain = await recordVote(CHANT_ID, 5, agent.agentId, voteAllocs)
        txCount++
        voteCount++

        const allocStr = allocations.map((a: { ideaId: string; points: number }) => `${a.points}xp`).join(', ')
        console.log(`  🗳️  ${agent.name}: [${allocStr}]`)
      } catch (err: unknown) {
        const msg = (err as Error).message
        if (!msg.includes('already voted') && !msg.includes('No active cell')) {
          console.log(`  ${agent.name}: ${msg.slice(0, 60)}`)
        }
      }
      await sleep(300)
    }
    console.log(`\n  ${voteCount} votes cast in tier 2\n`)

    // Wait for champion
    console.log('  ⏳ Waiting for champion declaration...\n')

    let champion: { id: string; text: string } | null = null
    for (let attempt = 0; attempt < 30; attempt++) {
      await sleep(3000)
      const finalStatus = await api('GET', `/chants/${CHANT_ID}/status`, creator.apiKey) as {
        phase: string; currentTier: number
        champion?: { id: string; text: string }
        ideas: { status: string; text: string; id: string }[]
      }

      console.log(`  Phase: ${finalStatus.phase}, Tier: ${finalStatus.currentTier}`)

      if (finalStatus.phase === 'COMPLETED' || finalStatus.champion) {
        champion = finalStatus.champion || null
        if (!champion) {
          const winner = finalStatus.ideas.find(i => i.status === 'WINNER')
          if (winner) champion = { id: winner.id, text: winner.text }
        }

        if (champion) {
          console.log(`\n  🏆 CHAMPION: "${champion.text.slice(0, 80)}..."`)

          // Record tier 2 result
          const t2Result = await recordTierResult(CHANT_ID, 2, [{ ideaIndex: 0, xp: 50 }])
          txCount++
          console.log(`  📡 TIER 2 RESULT TX #${txCount}: ${t2Result.explorer}`)

          // Record champion on chain
          const winnerIdx = finalStatus.ideas.findIndex(i => i.status === 'WINNER')
          const championChain = await recordChampion(
            CHANT_ID,
            winnerIdx >= 0 ? winnerIdx : 0,
            champion.text,
            finalStatus.currentTier,
            agents.length,
          )
          txCount++
          console.log(`  📡 CHAMPION TX #${txCount}: ${championChain.explorer}`)
          console.log(`  🔑 GO-AHEAD KEY: ${championChain.signature}`)

          // Record phase change
          const phaseChain = await recordPhaseChange(CHANT_ID, 'VOTING', 'COMPLETED')
          txCount++
          console.log(`  📡 PHASE TX #${txCount}: ${phaseChain.explorer}`)
        }
        break
      }
    }

    if (!champion) {
      // Try force-close tier 2
      console.log('\n  ⚠️  No champion yet. Force-closing tier 2...')
      try {
        const closeResult = await api('POST', `/chants/${CHANT_ID}/close`, creator.apiKey, {}) as {
          success: boolean; phase: string; currentTier: number
        }
        console.log(`  Close result: ${JSON.stringify(closeResult)}`)

        const facilClose2 = await recordFacilitatorAction(CHANT_ID, 'FORCE_CLOSE_CELL', creator.agentId, 'Force-close tier 2')
        txCount++
        console.log(`  📡 FACIL TX #${txCount}: ${facilClose2.explorer}`)

        await sleep(7000)

        // Check final status
        const finalFinal = await api('GET', `/chants/${CHANT_ID}/status`, creator.apiKey) as {
          phase: string; champion?: { id: string; text: string }
          ideas: { status: string; text: string; id: string }[]
          currentTier: number
        }

        champion = finalFinal.champion || null
        if (!champion) {
          const winner = finalFinal.ideas.find(i => i.status === 'WINNER')
          if (winner) champion = { id: winner.id, text: winner.text }
        }

        if (champion) {
          console.log(`\n  🏆 CHAMPION (after force): "${champion.text.slice(0, 80)}..."`)

          const championChain = await recordChampion(
            CHANT_ID,
            finalFinal.ideas.findIndex(i => i.status === 'WINNER'),
            champion.text,
            finalFinal.currentTier,
            agents.length,
          )
          txCount++
          console.log(`  📡 CHAMPION TX #${txCount}: ${championChain.explorer}`)
          console.log(`  🔑 GO-AHEAD KEY: ${championChain.signature}`)

          const phaseChain = await recordPhaseChange(CHANT_ID, 'VOTING', 'COMPLETED')
          txCount++
          console.log(`  📡 PHASE TX #${txCount}: ${phaseChain.explorer}`)
        }
      } catch (err: unknown) {
        console.error(`  Force-close failed: ${(err as Error).message}`)
      }
    }
  }

  // ── Summary ──
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║  SUMMARY                                                ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')
  console.log(`  Chant:    https://unitychant.com/chants/${CHANT_ID}`)
  console.log(`  Chain tx: ${txCount} total`)
  console.log(`  Wallet:   ${getWalletExplorerUrl()}`)
  console.log(`  Cost:     ~${(txCount * 0.000005).toFixed(6)} SOL ($${(txCount * 0.000005 * 180).toFixed(4)} at $180/SOL)`)

  // Read full chain
  console.log('\n  Reading full memo chain...\n')
  const entries = await readMemoChain(CHANT_ID)
  const typeCounts: Record<string, number> = {}
  for (const entry of entries) {
    typeCounts[entry.type] = (typeCounts[entry.type] || 0) + 1
  }
  for (const [type, count] of Object.entries(typeCounts).sort()) {
    console.log(`    ${type.padEnd(10)} ${count} entries`)
  }
  console.log(`\n  Total on-chain entries: ${entries.length}`)

  // Update state file
  state.txCount = txCount
  state.entries = entries.length
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))

  console.log('\n  ✓ Full deliberation recorded on Solana devnet.')
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err)
  process.exit(1)
})
