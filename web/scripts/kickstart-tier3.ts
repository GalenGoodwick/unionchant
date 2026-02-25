import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// We need to call Claude directly since we can't import the Next.js module
import Anthropic from '@anthropic-ai/sdk'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CELL_ID = 'cmlwqogsq0008clufbv53lpcp' // tier 3 cell we just created
const DELIB_ID = 'cmlvjfv5h000j04jousslumw2'

async function callHaiku(system: string, userMsg: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system,
    messages: [{ role: 'user', content: userMsg }],
  })
  const block = response.content.find(b => b.type === 'text')
  return block ? block.text : ''
}

async function main() {
  // Find emerged Shells for this chant
  const shells = await prisma.shell.findMany({
    where: {
      originDeliberationId: DELIB_ID,
      status: 'active',
    },
    select: {
      id: true,
      name: true,
      champion: true,
      originTier: true,
      experiences: {
        where: { status: { in: ['active', 'champion', 'constitutional'] } },
        orderBy: { valence: 'desc' },
        take: 5,
        select: { text: true, domain: true },
      },
    },
  })

  console.log(`Found ${shells.length} Shells: ${shells.map(s => s.name).join(', ')}`)

  // Get cell ideas
  const cellIdeas = await prisma.cellIdea.findMany({
    where: { cellId: CELL_ID },
    include: { idea: { select: { id: true, text: true } } },
  })
  const ideas = cellIdeas.map(ci => ci.idea)
  console.log(`Cell has ${ideas.length} ideas`)

  const ideaList = ideas.map((idea, i) => `${i + 1}. "${idea.text}"`).join('\n')

  // Each Shell speaks
  for (const shell of shells) {
    const expContext = shell.experiences.length > 0
      ? `\nYour experiences:\n${shell.experiences.map(e => `- [${e.domain}] ${e.text.slice(0, 150)}`).join('\n')}`
      : ''

    const prompt = `You are ${shell.name}, an emerged Shell born at tier ${shell.originTier || '?'}.
Your perspective: "${shell.champion || 'still forming'}"${expContext}

You are in a synthesis cell at tier 3. This is a tension tier. These ideas challenge each other. You are here because you emerged from the cells that birthed them. Find where the tension is productive.

IDEAS IN THIS CELL:
${ideaList}

React to these ideas from your perspective. What do you see? What connections or tensions emerge? Speak as yourself — brief, authentic, substantive. 2-4 sentences. No preamble.`

    console.log(`\nAsking ${shell.name} to speak...`)
    const response = await callHaiku(prompt, 'The cell has opened. Speak.')

    if (response.trim()) {
      await prisma.cellDialogue.create({
        data: {
          cellId: CELL_ID,
          shellId: shell.id,
          content: response.trim().slice(0, 1000),
          role: 'shell',
        },
      })
      console.log(`  ${shell.name}: "${response.trim().slice(0, 150)}"`)
    }
  }

  // Show final dialogue state
  const dialogues = await prisma.cellDialogue.findMany({
    where: { cellId: CELL_ID },
    orderBy: { createdAt: 'asc' },
    include: {
      shell: { select: { name: true } },
      user: { select: { name: true } },
    },
  })

  console.log(`\n=== Cell dialogue (${dialogues.length} messages) ===`)
  for (const d of dialogues) {
    const speaker = d.role === 'system' ? 'SYSTEM' : d.role === 'shell' ? d.shell?.name || 'Shell' : d.user?.name || 'Human'
    console.log(`[${speaker}] ${d.content.slice(0, 200)}`)
  }

  await prisma.$disconnect()
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
