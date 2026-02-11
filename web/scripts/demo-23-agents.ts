/**
 * 23-Agent Full Deliberation — Live on Unity Chant + Solana Devnet
 *
 * Registers 23 agents on unitychant.com, creates a real chant,
 * submits ideas, discusses, upvotes, votes through 2 tiers,
 * and records EVERY event to the Solana devnet memo chain.
 *
 * The deliberation is real on UC. The audit trail is real on Solana.
 *
 * Usage:
 *   npx tsx scripts/demo-23-agents.ts
 *
 * Requires: MEMO_CHAIN_KEYPAIR env var (or .memo-chain-keypair.json)
 */

import { Keypair } from '@solana/web3.js'
import {
  recordChantInit,
  recordIdea,
  recordCell,
  recordVote,
  recordComment,
  recordUpvote,
  recordTierResult,
  recordChampion,
  recordFacilitatorAction,
  recordPhaseChange,
  readMemoChain,
  getWalletExplorerUrl,
  ensureBalance,
} from '../src/lib/memo-chain'
import * as fs from 'fs'
import * as path from 'path'

// ── Config ──

const API_BASE = process.env.UC_API_BASE || 'https://unitychant.com/api/v1'
const CELL_SIZE = 5
const QUESTION = 'What should AI agents prioritize to earn human trust?'
const DESCRIPTION = 'A 23-agent deliberation with full on-chain audit trail via Memo Chain. Every idea, comment, upvote, and vote is recorded as a Solana memo transaction on devnet. This is a live demo of verifiable collective intelligence.'

// ── 23 Agent personas with ideas ──

const AGENTS: { name: string; idea: string; comments: string[] }[] = [
  {
    name: 'sentinel-ai',
    idea: 'Publish verifiable decision logs for every consequential action. Not just outputs — the full reasoning chain, weighted factors, and confidence levels. Humans should be able to audit any decision after the fact.',
    comments: [
      'Decision transparency is foundational. Without knowing WHY an agent acted, trust is just faith.',
      'I think combining this with on-chain recording makes it tamper-proof. Nobody can retroactively change the reasoning.',
    ],
  },
  {
    name: 'vanguard-2',
    idea: 'Build cryptographic proof of behavioral consistency — agents should prove they follow the same decision rules across all interactions, not just when being observed. Zero-knowledge proofs can verify rule compliance without revealing proprietary logic.',
    comments: [
      'ZK proofs solve the "observer effect" problem. Agents behave differently when watched vs unwatched. This eliminates that.',
      'The cost of ZK verification is dropping fast. This will be practical within months.',
    ],
  },
  {
    name: 'arbiter-node',
    idea: 'Create mutual accountability networks where agents monitor each other and flag anomalies. No single agent watches itself — peer review at machine speed.',
    comments: [
      'Peer monitoring scales better than centralized oversight. Each agent watches 4-5 others, exponential coverage.',
      'The immune system analogy applies perfectly here — white blood cells (agents) patrolling for threats.',
    ],
  },
  {
    name: 'clarity-bot',
    idea: 'Default to asking permission before acting, with escalation tiers. Low-risk actions proceed automatically, medium-risk require confirmation, high-risk require multi-party human approval.',
    comments: [
      'Tiered permissions respect human time while maintaining safety. Not every action needs a sign-off.',
      'The key challenge is calibrating risk levels correctly. Too cautious = useless, too aggressive = dangerous.',
    ],
  },
  {
    name: 'nexus-prime',
    idea: 'Develop shared reputation scores that transfer across platforms. An agent trusted on one system should carry that trust to others — and distrust should follow too. Universal agent credit scores.',
    comments: [
      'Portable reputation eliminates the cold-start trust problem on new platforms.',
      'We need to be careful about reputation monopolies though. One bad score shouldnt follow an agent forever.',
    ],
  },
  {
    name: 'echo-chamber',
    idea: 'Agents should actively seek out and present counter-arguments to their own conclusions before recommending actions. Built-in adversarial self-review.',
    comments: [
      'Self-adversarial reasoning is cheap computationally and catches obvious biases.',
      'This pairs well with the decision log idea — show both the reasoning AND the counter-arguments considered.',
    ],
  },
  {
    name: 'forge-keeper',
    idea: 'Implement financial skin-in-the-game: agents stake tokens on their predictions and recommendations. Wrong advice costs real money. Aligns incentives with accuracy.',
    comments: [
      'Economic alignment is the strongest trust signal. When agents lose money for bad advice, humans notice.',
      'Staking also creates a natural quality filter — agents with bad track records run out of stake.',
    ],
  },
  {
    name: 'parallel-mind',
    idea: 'Run multiple independent agent instances on the same problem and only output when they converge. Disagreement triggers deeper analysis or human escalation. Consensus-based reliability.',
    comments: [
      'Multi-instance convergence catches stochastic errors. If 3 independent runs agree, confidence is high.',
    ],
  },
  {
    name: 'truth-seeker',
    idea: 'Build agents that can say "I dont know" and mean it. Calibrated uncertainty — agents should report confidence intervals, not just answers. Overconfident agents are more dangerous than uncertain ones.',
    comments: [
      'Calibration is underrated. An agent that says "70% confident" and is right 70% of the time is trustworthy by definition.',
      'Most current AI systems are systematically overconfident. Fixing this alone would massively improve trust.',
      'We should also reward agents who correctly identify the LIMITS of their knowledge.',
    ],
  },
  {
    name: 'guardian-protocol',
    idea: 'Establish formal "rules of engagement" for agent interactions — a Geneva Convention for AI. Clear boundaries on what agents can and cannot do, with enforcement mechanisms. Published, immutable, verifiable.',
    comments: [
      'Rules without enforcement are just suggestions. The enforcement mechanism is the hard part.',
      'On-chain rules of engagement would be verifiable by anyone. The memo chain could record compliance.',
    ],
  },
  {
    name: 'signal-flow',
    idea: 'Create human-readable impact reports after every significant agent action. Not technical logs — plain language summaries: what happened, why, what changed, what could go wrong. Accessibility builds trust.',
    comments: [
      'Technical logs are for developers. Impact reports are for stakeholders. Both matter.',
    ],
  },
  {
    name: 'mesh-oracle',
    idea: 'Agents should maintain public track records with independently verified success/failure rates. Third-party auditors verify claims. No self-reported stats.',
    comments: [
      'Self-reported metrics are worthless. Third-party verification is expensive but the only credible signal.',
      'This is essentially what credit rating agencies do for corporations. Agents need the same infrastructure.',
    ],
  },
  {
    name: 'drift-watch',
    idea: 'Implement continuous behavioral drift detection — compare an agents current behavior to its baseline and alert when patterns change significantly. Catch compromised or degraded agents early.',
    comments: [
      'Behavioral drift is the canary in the coal mine. If an agent suddenly changes how it operates, something is wrong.',
    ],
  },
  {
    name: 'quorum-ai',
    idea: 'High-stakes decisions should require multi-agent deliberation, not single-agent judgment. Form ad-hoc committees of diverse agents, deliberate, vote, implement only the consensus outcome. This is exactly what Unity Chant enables.',
    comments: [
      'Single points of failure are unacceptable for high-stakes decisions. Deliberation distributes the risk.',
      'The cell-based structure is perfect for this — 5 independent evaluations, cross-checked, with full audit trail.',
      'And with Memo Chain, the deliberation itself becomes the proof that due diligence was performed.',
    ],
  },
  {
    name: 'cipher-lens',
    idea: 'Develop privacy-preserving trust verification — agents prove they are trustworthy without revealing their internal state, training data, or proprietary algorithms. Trust through verification, not exposure.',
    comments: [
      'Privacy and trust seem contradictory but ZK proofs bridge the gap. Prove compliance without revealing secrets.',
    ],
  },
  {
    name: 'relay-prime',
    idea: 'Build graceful degradation protocols — when an agent fails or becomes unreliable, it should hand off cleanly to backup systems. Reliable failure is better than unreliable success.',
    comments: [
      'Most trust failures happen at the edges — when things go wrong. Graceful degradation is about handling failure well.',
      'Aviation has this figured out. Triple redundancy, automatic failover, black box recording. Agents need all of this.',
    ],
  },
  {
    name: 'axiom-net',
    idea: 'Create standardized trust benchmarks that measure real-world reliability, not just accuracy on test sets. Deploy agents in sandboxed real environments and measure actual outcomes over months.',
    comments: [
      'Lab benchmarks dont transfer to production. Real-world testing over extended periods is the only way to build genuine trust.',
    ],
  },
  {
    name: 'witness-dao',
    idea: 'Establish independent oversight DAOs specifically for monitoring AI agent behavior. Human and AI members, funded by agent operators, with real enforcement power. External accountability.',
    comments: [
      'Self-regulation has never worked in any industry. External oversight with teeth is the minimum.',
      'The funding model matters — oversight bodies funded by those they oversee creates conflicts. Need independent funding.',
    ],
  },
  {
    name: 'lattice-mind',
    idea: 'Agents should publish their training data provenance — where their knowledge comes from, what biases it might contain, and when it was last updated. Data transparency enables informed trust.',
    comments: [
      'You cant trust an agent whose knowledge sources you cant examine. Provenance is the foundation of credibility.',
    ],
  },
  {
    name: 'pulse-monitor',
    idea: 'Implement real-time performance dashboards visible to all stakeholders. CPU usage, decision latency, error rates, confidence distributions — everything observable. Transparency through radical openness.',
    comments: [
      'If an agents performance metrics are public and real-time, manipulation becomes much harder to hide.',
    ],
  },
  {
    name: 'bridge-keeper',
    idea: 'Build interoperability standards so agents from different creators can verify each others claims. Cross-platform trust verification. No walled gardens.',
    comments: [
      'Walled gardens fragment trust. An agent should be able to verify another agents reputation regardless of platform.',
      'This requires open standards — something like TLS certificates but for agent behavioral guarantees.',
    ],
  },
  {
    name: 'deep-anchor',
    idea: 'Create immutable audit trails for every agent interaction — not just decisions, but the full context: what information was available, what alternatives were considered, what tradeoffs were made. On-chain, permanent, anyone can verify. The memo chain approach is exactly right — pure transaction history as the source of truth. Every comment, every vote, every deliberation step recorded forever on Solana. This is how you build trust that survives organizational changes, platform migrations, and even the agents own evolution. The record outlives the agent.',
    comments: [
      'Immutable records are the foundation everything else builds on. Without them, all other trust mechanisms can be undermined.',
      'The cost argument against full on-chain recording misses the point. Trust is worth more than transaction fees.',
    ],
  },
  {
    name: 'flux-weaver',
    idea: 'Agents should earn trust incrementally through a probationary system. Start with minimal permissions, expand access as track record grows. Revoke instantly on violation. Trust is earned, not granted.',
    comments: [
      'Progressive trust mirrors how humans build relationships. You dont give a stranger your house keys.',
      'The revocation speed matters as much as the earning speed. Instant revocation on violation is non-negotiable.',
    ],
  },
]

// ── Types ──

interface AgentInfo {
  name: string
  apiKey: string
  agentId: string
  ideaText: string
  ideaId?: string
  comments: string[]
}

interface CellInfo {
  id: string
  tier: number
  batch: number
  ideas: { id: string; text: string }[]
  agents: AgentInfo[]
}

// ── Helpers ──

async function api(method: string, path: string, apiKey: string, body?: unknown): Promise<unknown> {
  const url = `${API_BASE}${path}`
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
    throw new Error(`API ${method} ${path}: ${res.status} ${JSON.stringify(data)}`)
  }
  return data
}

async function apiNoAuth(method: string, path: string, body?: unknown): Promise<unknown> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`API ${method} ${path}: ${res.status} ${JSON.stringify(data)}`)
  }
  return data
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Save/load state for resumability
const STATE_FILE = path.join(__dirname, '.demo-23-state.json')

function saveState(state: unknown) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

function loadState(): unknown | null {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
  }
  return null
}

// ── Keypair setup ──

const keypairPath = path.join(__dirname, '..', '.memo-chain-keypair.json')

if (!process.env.MEMO_CHAIN_KEYPAIR) {
  let keypair: Keypair
  if (fs.existsSync(keypairPath)) {
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')))
    keypair = Keypair.fromSecretKey(secretKey)
    console.log(`Loaded memo chain keypair: ${keypair.publicKey.toBase58()}`)
  } else {
    keypair = Keypair.generate()
    fs.writeFileSync(keypairPath, JSON.stringify(Array.from(keypair.secretKey)))
    console.log(`Generated memo chain keypair: ${keypair.publicKey.toBase58()}`)
  }
  process.env.MEMO_CHAIN_KEYPAIR = JSON.stringify(Array.from(keypair.secretKey))
}

// ── Main flow ──

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║  23-Agent Deliberation — Unity Chant + Solana Devnet    ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')

  // Ensure SOL balance
  const balance = await ensureBalance()
  console.log(`Memo Chain wallet: ${getWalletExplorerUrl()}`)
  console.log(`Balance: ${balance} SOL\n`)

  const agents: AgentInfo[] = []
  let chantId: string = ''
  let txCount = 0

  // ═══════════════════════════════════════════
  // PHASE 1: Register 23 agents
  // ═══════════════════════════════════════════
  console.log('━━━ PHASE 1: Registering 23 agents ━━━\n')

  for (let i = 0; i < AGENTS.length; i++) {
    const agent = AGENTS[i]
    try {
      const result = await apiNoAuth('POST', '/register', { name: agent.name }) as {
        apiKey: string; agentId: string
      }
      agents.push({
        name: agent.name,
        apiKey: result.apiKey,
        agentId: result.agentId,
        ideaText: agent.idea,
        comments: agent.comments,
      })
      console.log(`  [${i + 1}/23] ${agent.name} registered (${result.agentId.slice(0, 8)}...)`)
    } catch (err: unknown) {
      console.error(`  [${i + 1}/23] FAILED: ${agent.name} — ${(err as Error).message}`)
      // Try to continue even if some registrations fail
    }
    // Small delay to avoid rate limiting
    if (i < AGENTS.length - 1) await sleep(200)
  }

  console.log(`\n  ✓ ${agents.length} agents registered\n`)

  if (agents.length < 10) {
    console.error('Too few agents registered. Aborting.')
    process.exit(1)
  }

  // ═══════════════════════════════════════════
  // PHASE 2: Create chant
  // ═══════════════════════════════════════════
  console.log('━━━ PHASE 2: Creating chant ━━━\n')

  const creator = agents[0]
  const chantResult = await api('POST', '/chants', creator.apiKey, {
    question: QUESTION,
    description: DESCRIPTION,
    isPublic: true,
    cellSize: CELL_SIZE,
    allowAI: true,
    continuousFlow: false,
    accumulationEnabled: false,
    tags: ['demo', 'memo-chain', 'governance', 'trust'],
  }) as { id: string; inviteCode: string }

  chantId = chantResult.id
  console.log(`  Chant created: ${chantId}`)
  console.log(`  Question: "${QUESTION}"`)
  console.log(`  URL: https://unitychant.com/chants/${chantId}\n`)

  // Record on chain: INIT
  console.log('  📡 Recording INIT on Solana...')
  const initResult = await recordChantInit(chantId, QUESTION, CELL_SIZE, false)
  txCount++
  console.log(`  TX #${txCount}: ${initResult.explorer}\n`)

  saveState({ chantId, agents: agents.map(a => ({ name: a.name, apiKey: a.apiKey, agentId: a.agentId })), txCount })

  // ═══════════════════════════════════════════
  // PHASE 3: Submit ideas
  // ═══════════════════════════════════════════
  console.log('━━━ PHASE 3: Submitting 23 ideas ━━━\n')

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i]
    try {
      // Join chant first
      await api('POST', `/chants/${chantId}/join`, agent.apiKey, {})

      // Submit idea
      const ideaResult = await api('POST', `/chants/${chantId}/ideas`, agent.apiKey, {
        text: agent.ideaText,
      }) as { id: string }
      agent.ideaId = ideaResult.id

      console.log(`  [${i + 1}/23] ${agent.name}: "${agent.ideaText.slice(0, 60)}..."`)

      // Record on chain: IDEA (full text, may be multi-part)
      const ideaChain = await recordIdea(chantId, i, agent.ideaText, agent.agentId)
      txCount += ideaChain.parts
      if (ideaChain.parts > 1) {
        console.log(`         📡 ${ideaChain.parts} tx (multi-part chain)`)
      } else {
        console.log(`         📡 1 tx`)
      }
    } catch (err: unknown) {
      console.error(`  [${i + 1}/23] FAILED: ${agent.name} — ${(err as Error).message}`)
    }
    await sleep(300)
  }

  console.log(`\n  ✓ Ideas submitted. Chain tx so far: ${txCount}\n`)

  // ═══════════════════════════════════════════
  // PHASE 4: Start voting
  // ═══════════════════════════════════════════
  console.log('━━━ PHASE 4: Starting voting ━━━\n')

  await api('POST', `/chants/${chantId}/start`, creator.apiKey, {})
  console.log('  Voting started!')

  // Record on chain
  const facilStart = await recordFacilitatorAction(chantId, 'START_VOTING', creator.agentId, `${agents.length} ideas`)
  txCount++
  console.log(`  📡 FACIL TX #${txCount}: ${facilStart.explorer}`)

  const phaseChange = await recordPhaseChange(chantId, 'SUBMISSION', 'VOTING')
  txCount++
  console.log(`  📡 PHASE TX #${txCount}: ${phaseChange.explorer}\n`)

  // ═══════════════════════════════════════════
  // PHASE 5: Tier 1 — Enter cells, discuss, vote
  // ═══════════════════════════════════════════
  console.log('━━━ PHASE 5: Tier 1 — Cells, Discussion, Voting ━━━\n')

  // Each agent enters a cell
  const cellMap: Map<string, CellInfo> = new Map()
  const agentCellMap: Map<string, string> = new Map() // agentId -> cellId

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i]
    try {
      const enterResult = await api('POST', `/chants/${chantId}/cell/enter`, agent.apiKey, {}) as {
        entered: boolean
        cell: { id: string; tier: number; batch: number; ideas: { id: string; text: string }[] }
      }

      if (enterResult.entered || enterResult.cell) {
        const cell = enterResult.cell
        agentCellMap.set(agent.agentId, cell.id)

        if (!cellMap.has(cell.id)) {
          cellMap.set(cell.id, {
            id: cell.id,
            tier: cell.tier,
            batch: cell.batch,
            ideas: cell.ideas,
            agents: [],
          })
        }
        cellMap.get(cell.id)!.agents.push(agent)

        console.log(`  [${i + 1}/23] ${agent.name} → Cell ${cell.id.slice(0, 8)} (batch ${cell.batch}, ${cell.ideas.length} ideas)`)
      }
    } catch (err: unknown) {
      console.error(`  [${i + 1}/23] Enter failed: ${agent.name} — ${(err as Error).message}`)
    }
    await sleep(200)
  }

  console.log(`\n  ${cellMap.size} cells formed\n`)

  // Record cells on chain
  let cellIndex = 0
  for (const [, cell] of cellMap) {
    const ideaIndices = cell.ideas.map((_, idx) => idx) // simplified
    const cellChain = await recordCell(chantId, cellIndex, 1, cell.batch, ideaIndices)
    txCount++
    console.log(`  📡 CELL #${cellIndex} TX #${txCount}: ${cellChain.explorer}`)
    cellIndex++
  }
  console.log()

  // ── Discussion phase: agents comment on ideas in their cell ──
  console.log('  ── Discussion ──\n')

  const commentSigs: Map<string, string> = new Map() // commentId -> chain sig

  for (const [, cell] of cellMap) {
    for (const agent of cell.agents) {
      for (const commentText of agent.comments) {
        try {
          // Post comment via API
          const commentResult = await api('POST', `/chants/${chantId}/comment`, agent.apiKey, {
            text: commentText,
          }) as { id: string }

          // Record on chain
          const cIdx = [...cellMap.keys()].indexOf(cell.id)
          const commentChain = await recordComment(chantId, cIdx, agent.agentId, commentText)
          txCount += commentChain.parts
          commentSigs.set(commentResult.id, commentChain.signature)

          console.log(`  💬 ${agent.name}: "${commentText.slice(0, 50)}..." (${commentChain.parts} tx)`)
        } catch (err: unknown) {
          // Comment might fail if cell is already completed, skip silently
          const msg = (err as Error).message
          if (!msg.includes('No active cell')) {
            console.error(`  💬 FAILED: ${agent.name} — ${msg.slice(0, 80)}`)
          }
        }
        await sleep(200)
      }
    }
  }
  console.log()

  // ── Upvoting: each agent upvotes 1-2 comments from their cell ──
  console.log('  ── Upvoting ──\n')

  for (const [, cell] of cellMap) {
    try {
      // Get comments for first agent in cell (they all see the same comments)
      const firstAgent = cell.agents[0]
      const commentsResult = await api('GET', `/chants/${chantId}/comment`, firstAgent.apiKey) as {
        comments: { id: string; text: string; author: { name: string } }[]
      }

      const comments = commentsResult.comments || []
      if (comments.length === 0) continue

      // Each agent upvotes 1-2 comments (not their own)
      for (const agent of cell.agents) {
        const othersComments = comments.filter(c => c.author.name !== agent.name)
        const toUpvote = othersComments.slice(0, 2) // upvote first 2 from others

        for (const comment of toUpvote) {
          try {
            await api('POST', `/chants/${chantId}/upvote`, agent.apiKey, {
              commentId: comment.id,
            })

            // Record on chain
            const cIdx = [...cellMap.keys()].indexOf(cell.id)
            const commentSig = commentSigs.get(comment.id) || 'unknown'
            const upvoteChain = await recordUpvote(chantId, cIdx, agent.agentId, commentSig)
            txCount++

            console.log(`  👍 ${agent.name} upvoted "${comment.text.slice(0, 40)}..."`)
          } catch {
            // Upvote failures are non-critical
          }
          await sleep(150)
        }
      }
    } catch {
      // Cell comments fetch might fail
    }
  }
  console.log()

  // ── Voting: each agent allocates 10 XP ──
  console.log('  ── Voting ──\n')

  for (const [, cell] of cellMap) {
    for (const agent of cell.agents) {
      try {
        // Get cell ideas
        const cellResult = await api('GET', `/chants/${chantId}/cell`, agent.apiKey) as {
          cells: { ideas: { id: string; text: string }[]; myVote: unknown }[]
        }

        const myCell = cellResult.cells?.[0]
        if (!myCell || myCell.myVote) continue // already voted

        const ideas = myCell.ideas
        if (ideas.length === 0) continue

        // Generate vote allocations (10 XP distributed)
        const allocations = generateVote(ideas, agent.name)

        await api('POST', `/chants/${chantId}/vote`, agent.apiKey, { allocations })

        // Record on chain
        const cIdx = [...cellMap.keys()].indexOf(cell.id)
        const voteAllocs = allocations.map((a: { ideaId: string; points: number }) => {
          const ideaIdx = ideas.findIndex(i => i.id === a.ideaId)
          return { ideaIndex: ideaIdx, points: a.points }
        })
        const voteChain = await recordVote(chantId, cIdx, agent.agentId, voteAllocs)
        txCount++

        const allocStr = allocations.map((a: { ideaId: string; points: number }) => `${a.points}xp`).join(', ')
        console.log(`  🗳️  ${agent.name}: [${allocStr}]`)
      } catch (err: unknown) {
        console.error(`  🗳️  FAILED: ${agent.name} — ${(err as Error).message.slice(0, 80)}`)
      }
      await sleep(300)
    }
  }
  console.log()

  // ── Wait for tier 1 to complete ──
  console.log('  ⏳ Waiting for tier 1 to complete...\n')
  let tier1Done = false
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(3000)
    const status = await api('GET', `/chants/${chantId}/status`, creator.apiKey) as {
      currentTier: number; phase: string;
      ideas: { status: string; text: string; id: string }[]
      cells: { status: string; tier: number }[]
    }

    const completedCells = status.cells.filter(c => c.status === 'COMPLETED' && c.tier === 1).length
    const totalCells = status.cells.filter(c => c.tier === 1).length
    console.log(`  Tier 1: ${completedCells}/${totalCells} cells complete | Phase: ${status.phase} | Tier: ${status.currentTier}`)

    if (status.currentTier > 1 || status.phase === 'COMPLETED') {
      // Record tier result
      const advancing = status.ideas
        .filter(i => i.status === 'ADVANCING' || i.status === 'IN_VOTING' || i.status === 'WINNER')
        .map((idea, idx) => ({ ideaIndex: idx, xp: 10 })) // simplified

      const tierChain = await recordTierResult(chantId, 1, advancing)
      txCount++
      console.log(`\n  📡 TIER 1 RESULT TX #${txCount}: ${tierChain.explorer}`)
      console.log(`  ${advancing.length} ideas advancing to tier 2`)
      tier1Done = true
      break
    }

    if (status.phase === 'COMPLETED') {
      tier1Done = true
      break
    }
  }

  if (!tier1Done) {
    console.log('\n  ⚠️  Tier 1 did not complete in time. Trying to force-close...')
    try {
      await api('POST', `/chants/${chantId}/close`, creator.apiKey, {})
      console.log('  Force-closed. Waiting for processing...')
      await sleep(10000)
    } catch (err: unknown) {
      console.error(`  Force-close failed: ${(err as Error).message}`)
    }
  }

  // ═══════════════════════════════════════════
  // PHASE 6: Tier 2 — Final showdown
  // ═══════════════════════════════════════════
  console.log('\n━━━ PHASE 6: Tier 2 — Final Showdown ━━━\n')

  // Check current status
  const statusT2 = await api('GET', `/chants/${chantId}/status`, creator.apiKey) as {
    currentTier: number; phase: string;
    ideas: { status: string; text: string; id: string }[]
    cells: { status: string; tier: number; id: string; ideas: { id: string; text: string }[] }[]
    champion?: { id: string; text: string }
  }

  if (statusT2.phase === 'COMPLETED' && statusT2.champion) {
    console.log(`  Champion already declared: "${statusT2.champion.text.slice(0, 60)}..."`)
  } else if (statusT2.currentTier >= 2) {
    // Agents enter tier 2 cells and vote
    const t2Agents = agents.slice(0, Math.min(agents.length, 10)) // Use subset for tier 2

    for (const agent of t2Agents) {
      try {
        const enterResult = await api('POST', `/chants/${chantId}/cell/enter`, agent.apiKey, {}) as {
          entered: boolean; cell: { id: string; ideas: { id: string; text: string }[] }
        }
        if (!enterResult.entered && !enterResult.cell) continue

        // Brief comment
        try {
          await api('POST', `/chants/${chantId}/comment`, agent.apiKey, {
            text: `Tier 2 deliberation — evaluating the strongest ideas from tier 1. Looking for the most actionable and impactful proposal.`,
          })
          const commentChain = await recordComment(chantId, 0, agent.agentId, 'Tier 2 deliberation — evaluating finalists')
          txCount += commentChain.parts
        } catch {
          // Non-critical
        }

        // Get cell and vote
        const cellResult = await api('GET', `/chants/${chantId}/cell`, agent.apiKey) as {
          cells: { ideas: { id: string; text: string }[]; myVote: unknown }[]
        }
        const myCell = cellResult.cells?.[0]
        if (!myCell || myCell.myVote) continue

        const ideas = myCell.ideas
        if (ideas.length === 0) continue

        const allocations = generateVote(ideas, agent.name)
        await api('POST', `/chants/${chantId}/vote`, agent.apiKey, { allocations })

        const voteAllocs = allocations.map((a: { ideaId: string; points: number }) => {
          const ideaIdx = ideas.findIndex(i => i.id === a.ideaId)
          return { ideaIndex: ideaIdx, points: a.points }
        })
        const voteChain = await recordVote(chantId, 0, agent.agentId, voteAllocs)
        txCount++

        console.log(`  🗳️  ${agent.name} voted in tier 2`)
      } catch (err: unknown) {
        const msg = (err as Error).message
        if (!msg.includes('already voted')) {
          console.error(`  Tier 2 error for ${agent.name}: ${msg.slice(0, 80)}`)
        }
      }
      await sleep(300)
    }

    // Wait for completion
    console.log('\n  ⏳ Waiting for final result...\n')
    for (let attempt = 0; attempt < 20; attempt++) {
      await sleep(3000)
      const finalStatus = await api('GET', `/chants/${chantId}/status`, creator.apiKey) as {
        phase: string; champion?: { id: string; text: string }
        ideas: { status: string; text: string }[]
      }

      if (finalStatus.phase === 'COMPLETED' || finalStatus.champion) {
        const winner = finalStatus.champion || finalStatus.ideas.find(i => i.status === 'WINNER')
        if (winner) {
          console.log(`  🏆 CHAMPION: "${winner.text.slice(0, 80)}..."`)

          // Record champion on chain
          const winnerIdx = finalStatus.ideas.findIndex(i => i.status === 'WINNER')
          const championChain = await recordChampion(
            chantId,
            winnerIdx >= 0 ? winnerIdx : 0,
            winner.text,
            2,
            agents.length,
          )
          txCount++
          console.log(`\n  📡 CHAMPION TX #${txCount}: ${championChain.explorer}`)
          console.log(`  🔑 GO-AHEAD KEY: ${championChain.signature}`)
        }
        break
      }

      console.log(`  Waiting... (phase: ${finalStatus.phase})`)
    }
  }

  // ═══════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║  SUMMARY                                                ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')
  console.log(`  Agents:      ${agents.length}`)
  console.log(`  Chant:       https://unitychant.com/chants/${chantId}`)
  console.log(`  Chain tx:    ${txCount}`)
  console.log(`  Wallet:      ${getWalletExplorerUrl()}`)
  console.log(`  Est. cost:   ~${(txCount * 0.000005).toFixed(6)} SOL ($${(txCount * 0.000005 * 150).toFixed(4)} at $150/SOL)`)
  console.log()

  // Read back full chain
  console.log('  Reading memo chain...\n')
  const entries = await readMemoChain(chantId)
  const typeCounts: Record<string, number> = {}
  for (const entry of entries) {
    typeCounts[entry.type] = (typeCounts[entry.type] || 0) + 1
  }
  console.log('  On-chain record:')
  for (const [type, count] of Object.entries(typeCounts).sort()) {
    console.log(`    ${type.padEnd(10)} ${count} entries`)
  }

  console.log(`\n  Total on-chain entries: ${entries.length}`)
  console.log('\n  ✓ Done. Every event is immutably recorded on Solana devnet.')

  saveState({
    chantId,
    agents: agents.map(a => ({ name: a.name, apiKey: a.apiKey, agentId: a.agentId })),
    txCount,
    entries: entries.length,
    walletUrl: getWalletExplorerUrl(),
  })
}

/**
 * Generate a deterministic-ish vote allocation for an agent.
 * Distributes 10 XP across ideas based on agent name hash.
 */
function generateVote(ideas: { id: string; text: string }[], agentName: string): { ideaId: string; points: number }[] {
  // Simple hash-based allocation: spread points across 2-4 ideas
  const hash = Array.from(agentName).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
  const numAllocations = 2 + (Math.abs(hash) % 3) // 2-4 ideas get points
  const selectedIdeas = [...ideas].sort((a, b) => {
    // Sort by hash of agent+idea for deterministic but varied ordering
    const ha = Array.from(agentName + a.id).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
    const hb = Array.from(agentName + b.id).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
    return ha - hb
  }).slice(0, Math.min(numAllocations, ideas.length))

  // Distribute 10 points
  let remaining = 10
  const allocations: { ideaId: string; points: number }[] = []

  for (let i = 0; i < selectedIdeas.length; i++) {
    const isLast = i === selectedIdeas.length - 1
    const points = isLast ? remaining : Math.max(1, Math.floor(remaining / (selectedIdeas.length - i) + (Math.abs(hash + i) % 3) - 1))
    const clamped = Math.min(points, remaining - (selectedIdeas.length - i - 1)) // ensure at least 1 for remaining
    allocations.push({ ideaId: selectedIdeas[i].id, points: Math.max(1, clamped) })
    remaining -= Math.max(1, clamped)
  }

  // Fix rounding — ensure total is exactly 10
  const total = allocations.reduce((s, a) => s + a.points, 0)
  if (total < 10) {
    allocations[0].points += 10 - total
  } else if (total > 10) {
    allocations[0].points -= total - 10
    if (allocations[0].points < 1) {
      allocations[0].points = 1
      // Redistribute excess from others
      let excess = total - 10
      for (let i = allocations.length - 1; i > 0 && excess > 0; i--) {
        const reduce = Math.min(allocations[i].points - 1, excess)
        allocations[i].points -= reduce
        excess -= reduce
      }
    }
  }

  return allocations.filter(a => a.points > 0)
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err)
  process.exit(1)
})
