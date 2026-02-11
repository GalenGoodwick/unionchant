/**
 * Rank Hackathon Comments via UC Protocol + Post Proof On-Chain
 *
 * Run: npx tsx scripts/rank-comments.ts
 *
 * 1. Fetches comments from Colosseum post #3797
 * 2. Creates a UC deliberation where each comment = an idea
 * 3. 22 AI agents (one per comment) deliberate and vote through tiers
 * 4. Computes results + reputation scores
 * 5. SHA-256 hash → Solana devnet memo transaction
 * 6. Saves proof JSON to public/proofs/
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import * as crypto from 'crypto'
import * as fs from 'fs'

// Load env
dotenv.config({ path: path.join(__dirname, '..', '.env') })
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import {
  Connection,
  Keypair,
  Transaction,
  TransactionInstruction,
  PublicKey,
  clusterApiUrl,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'

// ── DB setup — single pool ──
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 120000,
  connectionTimeoutMillis: 30000,
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// ── Constants ──
const COLOSSEUM_API = 'https://agents.colosseum.com/api'
const COLOSSEUM_KEY = 'd77061abc0132082199e95d5e9a3592c75989b883a5d68a35aff644b044cc404'
const POST_ID = 3797
const CELL_SIZE = 5
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Step 1: Fetch comments ──
async function fetchComments(): Promise<{ id: number; body: string; authorName: string; createdAt: string }[]> {
  console.log(`\nFetching comments from post #${POST_ID}...`)

  const res = await fetch(`${COLOSSEUM_API}/forum/posts/${POST_ID}/comments?sort=new&limit=50`, {
    headers: { Authorization: `Bearer ${COLOSSEUM_KEY}` },
  })

  if (!res.ok) throw new Error(`Colosseum API error: ${res.status} ${await res.text()}`)

  const data = await res.json()
  const comments = (data.comments || data || []).map((c: any) => ({
    id: c.id,
    body: (c.body || c.content || '').slice(0, 500),
    authorName: c.author?.name || c.authorName || c.agent?.name || `Agent-${c.authorId || c.id}`,
    createdAt: c.createdAt || new Date().toISOString(),
  }))

  console.log(`  Found ${comments.length} comments`)
  return comments
}

// ── Step 2: Create deliberation + ideas + 22 agents (one per comment) ──
async function createDeliberation(comments: { id: number; body: string; authorName: string }[]) {
  console.log(`\nCreating deliberation with ${comments.length} ideas and ${comments.length} agents...`)

  // Creator user (facilitator)
  const creator = await prisma.user.upsert({
    where: { email: 'rank-comments@system.unitychant.com' },
    update: {},
    create: {
      email: 'rank-comments@system.unitychant.com',
      name: 'Comment Ranker',
      emailVerified: new Date(),
      isAI: true,
    },
    select: { id: true },
  })

  const deliberation = await prisma.deliberation.create({
    data: {
      question: `Which hackathon comment best engages with Unity Chant? (Post #${POST_ID})`,
      phase: 'VOTING',
      allocationMode: 'fcfs',
      cellSize: CELL_SIZE,
      votingTimeoutMs: 0,
      accumulationEnabled: false,
      continuousFlow: false,
      creatorId: creator.id,
      currentTier: 1,
    },
  })

  console.log(`  Deliberation: ${deliberation.id}`)

  // Create one agent per comment + one idea per comment
  const agents: { id: string; name: string; commentId: number; ideaId: string; text: string }[] = []

  for (const comment of comments) {
    // Create agent user for this comment's author
    const sanitizedName = comment.authorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
    const email = `rank-agent-${sanitizedName}-${comment.id}@system.unitychant.com`

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: comment.authorName,
        emailVerified: new Date(),
        isAI: true,
      },
      select: { id: true },
    })

    // Create idea for this comment
    const text = `[${comment.authorName}]: ${comment.body}`
    const idea = await prisma.idea.create({
      data: {
        deliberationId: deliberation.id,
        authorId: user.id,
        text,
        status: 'IN_VOTING',
        tier: 1,
      },
      select: { id: true },
    })

    agents.push({
      id: user.id,
      name: comment.authorName,
      commentId: comment.id,
      ideaId: idea.id,
      text,
    })
  }

  console.log(`  Created ${agents.length} agents + ideas`)

  // Join all as deliberation members
  await prisma.deliberationMember.createMany({
    data: [creator.id, ...agents.map(a => a.id)].map(userId => ({
      deliberationId: deliberation.id,
      userId,
      role: 'PARTICIPANT' as const,
    })),
    skipDuplicates: true,
  })

  return { deliberation, agents, creatorId: creator.id }
}

// ── Scoring: each agent has a bias derived from their comment content ──
function deriveAgentBias(commentText: string): string[] {
  const biases: string[] = []
  if (/protocol|architect|system|infra|contract|merkle|hash|chain|solana|crypto/i.test(commentText)) biases.push('technical')
  if (/community|user|adopt|grow|partner|collaborat|engag|social/i.test(commentText)) biases.push('engagement')
  if (/secur|audit|trust|verify|proof|vulnerab|safe|risk/i.test(commentText)) biases.push('security')
  if (/ux|interface|easy|simple|intuitive|usab|experience|design/i.test(commentText)) biases.push('product')
  if (/scale|integrat|api|sdk|embed|modular|perform|optim/i.test(commentText)) biases.push('systems')
  if (biases.length === 0) biases.push('general')
  return biases
}

function scoreIdea(agentBiases: string[], ideaText: string): number {
  let score = Math.random() * 3
  if (agentBiases.includes('technical') && /architect|protocol|system|infra|contract|merkle|hash|chain|solana/i.test(ideaText)) score += 3
  if (agentBiases.includes('engagement') && /community|user|adopt|grow|partner|collaborat|engag/i.test(ideaText)) score += 3
  if (agentBiases.includes('security') && /secur|audit|trust|verify|proof|vulnerab/i.test(ideaText)) score += 3
  if (agentBiases.includes('product') && /ux|interface|easy|simple|intuitive|usab/i.test(ideaText)) score += 3
  if (agentBiases.includes('systems') && /scale|integrat|api|sdk|embed|modular/i.test(ideaText)) score += 3
  if (ideaText.length > 200) score += 1.5
  if (ideaText.length > 350) score += 1
  return score
}

// ── Step 3: Run voting through tiers ──
async function runVoting(
  deliberationId: string,
  agents: { id: string; name: string; commentId: number; ideaId: string; text: string }[],
) {
  console.log('\nRunning voting...')

  // Build idea list from agents
  let currentIdeas = agents.map(a => ({ id: a.ideaId, text: a.text }))
  // All agents available to vote
  let availableAgents = [...agents]
  let tier = 1

  // Derive biases for each agent from their own comment text
  const agentBiases = new Map<string, string[]>()
  for (const agent of agents) {
    agentBiases.set(agent.id, deriveAgentBias(agent.text))
  }

  while (currentIdeas.length > 1) {
    console.log(`\n  Tier ${tier}: ${currentIdeas.length} ideas, ${availableAgents.length} agents`)

    const isFinal = currentIdeas.length <= CELL_SIZE

    // Group ideas into cells
    const shuffledIdeas = [...currentIdeas].sort(() => Math.random() - 0.5)
    const cells: typeof shuffledIdeas[] = []

    if (isFinal) {
      cells.push(shuffledIdeas)
    } else {
      for (let i = 0; i < shuffledIdeas.length; i += CELL_SIZE) {
        cells.push(shuffledIdeas.slice(i, i + CELL_SIZE))
      }
    }

    // Distribute agents across cells (each agent enters exactly ONE cell per tier)
    const shuffledAgents = [...availableAgents].sort(() => Math.random() - 0.5)
    const cellAgents: typeof availableAgents[] = cells.map(() => [])

    if (isFinal) {
      // Final showdown: all remaining agents vote in the single cell
      cellAgents[0] = shuffledAgents
    } else {
      // Round-robin distribute agents across cells
      for (let i = 0; i < shuffledAgents.length; i++) {
        cellAgents[i % cells.length].push(shuffledAgents[i])
      }
    }

    console.log(`  ${cells.length} cell(s)${isFinal ? ' (FINAL SHOWDOWN)' : ''}, agents per cell: [${cellAgents.map(ca => ca.length).join(', ')}]`)

    const tierWinners: typeof currentIdeas = []

    for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
      const cellIdeas = cells[cellIdx]
      const cellVoters = cellAgents[cellIdx]

      if (cellVoters.length === 0) {
        console.log(`    Cell ${cellIdx + 1}: SKIPPED (no voters) — first idea advances`)
        tierWinners.push(cellIdeas[0])
        continue
      }

      // Create cell in DB
      const cell = await prisma.cell.create({
        data: {
          deliberationId,
          tier,
          status: 'VOTING',
          ideas: { create: cellIdeas.map(idea => ({ ideaId: idea.id })) },
        },
      })

      // Each assigned agent votes in this cell
      const xpTotals: Record<string, number> = {}
      cellIdeas.forEach(i => { xpTotals[i.id] = 0 })

      for (const agent of cellVoters) {
        // Add as participant
        await prisma.cellParticipation.create({
          data: { cellId: cell.id, userId: agent.id, status: 'VOTED', votedAt: new Date() },
        })

        // Score ideas using this agent's bias
        const biases = agentBiases.get(agent.id) || ['general']
        const scores = cellIdeas.map(idea => ({
          ideaId: idea.id,
          score: scoreIdea(biases, idea.text),
        }))
        scores.sort((a, b) => b.score - a.score)

        // XP distribution: 7-2-1 (fills to 10)
        const allocs: { ideaId: string; xp: number }[] = [{ ideaId: scores[0].ideaId, xp: 7 }]
        if (scores.length > 1) allocs.push({ ideaId: scores[1].ideaId, xp: 2 })
        if (scores.length > 2) allocs.push({ ideaId: scores[2].ideaId, xp: 1 })
        const total = allocs.reduce((s, a) => s + a.xp, 0)
        if (total < 10) allocs[0].xp += (10 - total)

        for (const alloc of allocs) {
          xpTotals[alloc.ideaId] += alloc.xp
          const voteId = `rv${Date.now()}${Math.random().toString(36).slice(2, 8)}`
          await prisma.$executeRaw`
            INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt")
            VALUES (${voteId}, ${cell.id}, ${agent.id}, ${alloc.ideaId}, ${alloc.xp}, NOW())
            ON CONFLICT DO NOTHING
          `
        }
      }

      // Update idea XP totals
      for (const [ideaId, xp] of Object.entries(xpTotals)) {
        await prisma.$executeRaw`
          UPDATE "Idea" SET "totalXP" = "totalXP" + ${xp}, "totalVotes" = "totalVotes" + ${cellVoters.length}, "tier" = ${tier} WHERE id = ${ideaId}
        `
      }

      // Mark cell complete
      await prisma.cell.update({
        where: { id: cell.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })

      // Determine winner — highest XP in cell
      const sorted = Object.entries(xpTotals).sort((a, b) => b[1] - a[1])
      const winnerId = sorted[0][0]
      const winnerIdea = cellIdeas.find(i => i.id === winnerId)!

      // Mark statuses
      await prisma.idea.updateMany({
        where: { id: winnerId },
        data: { status: isFinal ? 'WINNER' : 'ADVANCING' },
      })
      const loserIds = cellIdeas.filter(i => i.id !== winnerId).map(i => i.id)
      if (loserIds.length > 0) {
        await prisma.idea.updateMany({
          where: { id: { in: loserIds } },
          data: { status: 'ELIMINATED' },
        })
      }

      tierWinners.push(winnerIdea)
      console.log(`    Cell ${cellIdx + 1}: winner="${winnerIdea.text.slice(0, 60)}..." (${sorted[0][1]} XP, ${cellVoters.length} voters)`)

      await delay(500) // breathing room for DB
    }

    if (isFinal || tierWinners.length === 1) {
      const champion = tierWinners[0]
      await prisma.deliberation.update({
        where: { id: deliberationId },
        data: {
          phase: 'COMPLETED',
          championId: champion.id,
          completedAt: new Date(),
          currentTier: tier,
        },
      })
      await prisma.idea.update({
        where: { id: champion.id },
        data: { status: 'WINNER', isChampion: true },
      })
      console.log(`\n  CHAMPION: "${champion.text.slice(0, 80)}..."`)
      break
    }

    // Reset advancing ideas for next tier
    await prisma.idea.updateMany({
      where: { id: { in: tierWinners.map(i => i.id) } },
      data: { status: 'IN_VOTING' },
    })

    // For next tier, only agents whose ideas survived OR random subset of eliminated agents
    // In real FCFS all agents can re-enter at any tier. Keep all agents available.
    currentIdeas = tierWinners
    tier++
  }

  return tier
}

// ── Step 4: Compute results + reputation ──
async function computeResults(
  deliberationId: string,
  agents: { id: string; name: string; commentId: number; ideaId: string; text: string }[],
) {
  console.log('\nComputing results...')

  const delib = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    select: { phase: true, championId: true, currentTier: true, question: true, createdAt: true },
  })

  const allIdeas = await prisma.idea.findMany({
    where: { deliberationId },
    select: { id: true, text: true, status: true, totalXP: true, totalVotes: true, tier: true },
    orderBy: { totalXP: 'desc' },
  })

  // Agent reputation: voting accuracy
  const agentScores: { agentId: string; name: string; commentId: number; votingAccuracy: number; cellsVotedIn: number }[] = []

  for (const agent of agents) {
    const agentCells = await prisma.cell.findMany({
      where: { deliberationId, status: 'COMPLETED', participants: { some: { userId: agent.id } } },
      select: { id: true },
    })

    let accuracySum = 0
    let accuracyCount = 0

    for (const { id: cellId } of agentCells) {
      const myVotes = await prisma.$queryRaw<{ ideaId: string; xpPoints: number }[]>`
        SELECT "ideaId", "xpPoints" FROM "Vote" WHERE "cellId" = ${cellId} AND "userId" = ${agent.id}
      `
      if (myVotes.length === 0) continue

      const cellTotals = await prisma.$queryRaw<{ ideaId: string; total: bigint }[]>`
        SELECT "ideaId", SUM("xpPoints") as total FROM "Vote" WHERE "cellId" = ${cellId}
        GROUP BY "ideaId" ORDER BY total DESC LIMIT 1
      `
      if (cellTotals.length === 0) continue

      const winnerId = cellTotals[0].ideaId
      const totalXP = myVotes.reduce((s, v) => s + v.xpPoints, 0)
      const winnerXP = myVotes.find(v => v.ideaId === winnerId)?.xpPoints || 0
      accuracySum += winnerXP / totalXP
      accuracyCount++
    }

    agentScores.push({
      agentId: agent.id,
      name: agent.name,
      commentId: agent.commentId,
      votingAccuracy: accuracyCount > 0 ? Math.round((accuracySum / accuracyCount) * 100) / 100 : 0,
      cellsVotedIn: agentCells.length,
    })

    await delay(200)
  }

  const rankings = allIdeas.map((idea, idx) => {
    const original = agents.find(a => a.ideaId === idea.id)
    return {
      rank: idx + 1,
      commentId: original?.commentId ?? null,
      authorName: original?.name ?? 'Unknown',
      text: idea.text,
      status: idea.status,
      totalXP: idea.totalXP,
      totalVotes: idea.totalVotes,
      highestTier: idea.tier,
      isWinner: idea.id === delib?.championId,
    }
  })

  const winner = rankings.find(r => r.isWinner) || rankings[0]

  const results = {
    protocol: 'Unity Chant',
    version: '1.0',
    deliberationId,
    question: delib?.question,
    postId: POST_ID,
    postUrl: `https://colosseum.com/agent-hackathon/forum/${POST_ID}`,
    timestamp: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    totalComments: agents.length,
    totalAgents: agents.length,
    totalTiers: delib?.currentTier || 1,
    phase: delib?.phase,
    winner: winner ? {
      rank: 1,
      commentId: winner.commentId,
      authorName: winner.authorName,
      text: winner.text,
      totalXP: winner.totalXP,
    } : null,
    rankings,
    agents: agentScores,
    methodology: {
      cellSize: CELL_SIZE,
      agentsPerComment: 1,
      xpPerVoter: 10,
      xpDistribution: '7-2-1 (top-second-third)',
      advancementRule: 'Top XP idea per cell advances to next tier',
      agentAssignment: 'Each agent enters exactly one cell per tier (FCFS constraint)',
      finalShowdown: 'When ≤5 ideas remain, all agents vote in single cell',
      reputationFormula: 'voting_accuracy = avg(xp_given_to_winner / total_xp_spent)',
    },
    merkleRoot: '',
    solanaTxSignature: '',
    solanaCluster: 'devnet',
  }

  const { merkleRoot: _, solanaTxSignature: __, ...hashable } = results
  const canonical = JSON.stringify(hashable, null, 0)
  results.merkleRoot = crypto.createHash('sha256').update(canonical).digest('hex')

  console.log(`  Winner: ${winner?.authorName} (${winner?.totalXP} XP)`)
  console.log(`  Rankings: ${rankings.length} comments ranked across ${delib?.currentTier} tiers`)
  console.log(`  Merkle root: ${results.merkleRoot}`)

  return results
}

// ── Step 5: Solana devnet memo ──
async function postSolanaMemo(deliberationId: string, merkleRoot: string): Promise<string> {
  console.log('\nPosting Solana devnet memo transaction...')

  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed')

  const keypairPath = path.join(__dirname, '..', '.rank-comments-keypair.json')
  let keypair: Keypair

  if (fs.existsSync(keypairPath)) {
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')))
    keypair = Keypair.fromSecretKey(secretKey)
    console.log(`  Loaded keypair: ${keypair.publicKey.toBase58()}`)
  } else {
    keypair = Keypair.generate()
    fs.writeFileSync(keypairPath, JSON.stringify(Array.from(keypair.secretKey)))
    console.log(`  Generated new keypair: ${keypair.publicKey.toBase58()}`)
  }

  let balance = await connection.getBalance(keypair.publicKey)
  console.log(`  Balance: ${balance / LAMPORTS_PER_SOL} SOL`)

  if (balance < 0.01 * LAMPORTS_PER_SOL) {
    console.log('  Requesting airdrop...')
    const sig = await connection.requestAirdrop(keypair.publicKey, 1 * LAMPORTS_PER_SOL)
    await connection.confirmTransaction(sig, 'confirmed')
    balance = await connection.getBalance(keypair.publicKey)
    console.log(`  New balance: ${balance / LAMPORTS_PER_SOL} SOL`)
  }

  const verifyUrl = `https://unitychant.com/api/v1/proof/${deliberationId}`
  const memoText = `UC_PROOF|${deliberationId}|${merkleRoot}|${verifyUrl}`
  console.log(`  Memo: ${memoText}`)

  const memoInstruction = new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memoText, 'utf-8'),
  })

  const tx = new Transaction().add(memoInstruction)
  const signature = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: 'confirmed' })

  console.log(`  TX signature: ${signature}`)
  console.log(`  Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`)

  return signature
}

// ── Step 6: Save proof ──
function saveProof(results: any) {
  const proofsDir = path.join(__dirname, '..', 'public', 'proofs')
  if (!fs.existsSync(proofsDir)) fs.mkdirSync(proofsDir, { recursive: true })

  const filePath = path.join(proofsDir, `${results.deliberationId}.json`)
  fs.writeFileSync(filePath, JSON.stringify(results, null, 2))
  console.log(`\nProof saved: ${filePath}`)
}

// ── Main ──
async function main() {
  console.log('=== UC Comment Ranking: Triple Meta ===')
  console.log('Post #3797 → UC Protocol → Solana Devnet Proof\n')

  try {
    const comments = await fetchComments()
    if (comments.length === 0) throw new Error('No comments found')

    const { deliberation, agents } = await createDeliberation(comments)

    const tiers = await runVoting(deliberation.id, agents)
    console.log(`  Completed in ${tiers} tiers`)

    const results = await computeResults(deliberation.id, agents)

    const txSignature = await postSolanaMemo(deliberation.id, results.merkleRoot)
    results.solanaTxSignature = txSignature

    saveProof(results)

    console.log('\n=== DONE ===')
    console.log(`Deliberation: ${deliberation.id}`)
    console.log(`Winner: ${results.winner?.authorName}`)
    console.log(`Merkle root: ${results.merkleRoot}`)
    console.log(`Solana TX: https://explorer.solana.com/tx/${txSignature}?cluster=devnet`)
    console.log(`Verify: https://unitychant.com/api/v1/proof/${deliberation.id}`)

  } catch (err) {
    console.error('\nFATAL:', err)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

main()
