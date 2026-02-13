/**
 * Run tier 2 final showdown vote for a given deliberation
 * Usage: npx tsx scripts/run-tier2.ts <deliberationId>
 */
import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

async function main() {
  const deliberationId = process.argv[2]
  if (!deliberationId) {
    console.log('Usage: npx tsx scripts/run-tier2.ts <deliberationId>')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  // 1. Get the tier 2 cell
  const cell = await prisma.cell.findFirst({
    where: { deliberationId, tier: 2, status: 'VOTING' },
    include: {
      ideas: { include: { idea: true } },
      participants: true,
    }
  })

  if (!cell) {
    console.log('No tier 2 voting cell found')
    await prisma.$disconnect()
    await pool.end()
    return
  }

  const delib = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    select: { question: true }
  })

  console.log(`=== TIER 2 FINAL SHOWDOWN ===`)
  console.log(`"${delib?.question}"`)
  console.log(`Cell: ${cell.id.slice(-6)} | ${cell.ideas.length} ideas | ${cell.participants.length} participants\n`)

  for (let i = 0; i < cell.ideas.length; i++) {
    console.log(`  ${i + 1}. ${cell.ideas[i].idea.text.slice(0, 100)}`)
  }
  console.log()

  // 2. Get agent users who are participants and haven't voted
  const agents = await prisma.user.findMany({
    where: { email: { endsWith: '@agent.unitychant.com' } },
    select: { id: true, name: true }
  })

  const existingVotes = await prisma.vote.findMany({
    where: { cellId: cell.id },
    select: { userId: true }
  })
  const votedUserIds = new Set(existingVotes.map(v => v.userId))

  const needToVote = agents.filter(a =>
    cell.participants.some(p => p.userId === a.id) && !votedUserIds.has(a.id)
  )
  console.log(`${needToVote.length} agents need to vote\n`)

  // 3. Each agent votes using Haiku
  const ideaTexts = cell.ideas.map((ci, i) => `${i + 1}. ${ci.idea.text}`).join('\n')

  for (const agent of needToVote) {
    try {
      const prompt = `You are ${agent.name}, an AI agent voting in a deliberation: "${delib?.question}"

These are the FINAL ${cell.ideas.length} ideas. Allocate exactly 10 XP across them. Give at least 1 XP to your top pick. Give 0 to ideas you don't support.

IDEAS:
${ideaTexts}

Respond with ONLY a JSON array of XP allocations in order, e.g. [5, 3, 2, 0]. Must sum to 10.`

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = (response.content[0] as any).text.trim()
      const match = text.match(/\[[\d\s,]+\]/)
      if (!match) {
        console.log(`  ${agent.name}: Failed to parse: ${text.slice(0, 60)}`)
        continue
      }

      const allocations: number[] = JSON.parse(match[0])
      if (allocations.length !== cell.ideas.length || allocations.reduce((a, b) => a + b, 0) !== 10) {
        console.log(`  ${agent.name}: Bad allocation: ${JSON.stringify(allocations)}`)
        continue
      }

      const voteDesc: string[] = []
      for (let i = 0; i < allocations.length; i++) {
        if (allocations[i] > 0) {
          await prisma.vote.create({
            data: {
              cellId: cell.id,
              userId: agent.id,
              ideaId: cell.ideas[i].ideaId,
              xpPoints: allocations[i],
            }
          })
          voteDesc.push(`${allocations[i]}XP→"${cell.ideas[i].idea.text.slice(0, 30)}..."`)
        }
      }
      console.log(`  ${agent.name}: ${voteDesc.join(', ')}`)
    } catch (err: any) {
      console.log(`  ${agent.name}: Error: ${err.message}`)
    }
  }

  // 4. Tally results
  console.log('\n=== FINAL TALLY ===')
  const allVotes = await prisma.vote.findMany({ where: { cellId: cell.id } })
  const tally: Record<string, number> = {}
  for (const ci of cell.ideas) tally[ci.ideaId] = 0
  for (const v of allVotes) tally[v.ideaId] = (tally[v.ideaId] || 0) + v.xpPoints

  const ranked = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .map(([ideaId, xp]) => ({
      ideaId, xp,
      text: cell.ideas.find(ci => ci.ideaId === ideaId)?.idea.text || '???'
    }))

  for (const r of ranked) {
    console.log(`  ${r.xp} XP — ${r.text.slice(0, 80)}`)
  }

  // 5. Declare winner
  const winner = ranked[0]
  console.log(`\nPRIORITY: "${winner.text.slice(0, 80)}" with ${winner.xp} XP`)

  await prisma.idea.update({ where: { id: winner.ideaId }, data: { status: 'WINNER' } })
  for (const r of ranked.slice(1)) {
    await prisma.idea.update({ where: { id: r.ideaId }, data: { status: 'ELIMINATED' } })
  }
  await prisma.cell.update({
    where: { id: cell.id },
    data: { status: 'COMPLETED', completedAt: new Date() }
  })
  await prisma.deliberation.update({
    where: { id: deliberationId },
    data: { phase: 'COMPLETED', completedAt: new Date(), championId: winner.ideaId }
  })

  console.log('Deliberation COMPLETED.')
  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)
