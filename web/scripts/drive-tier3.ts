import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import Anthropic from '@anthropic-ai/sdk'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CELL_ID = 'cmlwqogsq0008clufbv53lpcp'
const DELIB_ID = 'cmlvjfv5h000j04jousslumw2'
const MAX_ROUNDS = 12

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

async function checkConvergence(cellId: string): Promise<{ type: string; action?: string; suggestion?: string; proposedText?: string; discovery?: string }> {
  const cell = await prisma.cell.findUnique({
    where: { id: cellId },
    include: {
      ideas: { include: { idea: { select: { id: true, text: true, author: { select: { name: true } } } } } },
      dialogues: {
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { name: true } },
          shell: { select: { name: true } },
        },
      },
    },
  })
  if (!cell) return { type: 'none' }

  const ideasText = cell.ideas.map((ci, i) =>
    `Idea ${i + 1} [${ci.idea.id}]: "${ci.idea.text}" (by ${ci.idea.author?.name || 'Anonymous'})`
  ).join('\n')

  const dialogueText = cell.dialogues.map(d => {
    const speaker = d.role === 'human' ? (d.user?.name || 'Anonymous') : d.role === 'shell' ? (d.shell?.name || 'Shell') : 'System'
    return `[${speaker}]: ${d.content}`
  }).join('\n')

  const prompt = `You are analyzing a synthesis cell dialogue. The cell has ideas and participants are discussing them to reach an outcome.

IDEAS IN THIS CELL:
${ideasText}

DIALOGUE SO FAR:
${dialogueText}

Analyze this dialogue and determine:
1. CONVERGENCE TYPE: "confident", "uncertain", "false", "emergence", or "none"
2. If "confident", ACTION: "select", "merge", "synthesize", or "wipe"
3. SUGGESTION: What the cell seems to be converging toward.
4. PROPOSED TEXT: If merge/synthesize/wipe, write the proposed text.
5. DISCOVERY: What new understanding emerged from this dialogue?

Respond in JSON: { "type": "...", "action": "...", "suggestion": "...", "proposedText": "...", "discovery": "..." }`

  const response = await callHaiku(prompt, 'Analyze the dialogue above.')
  const jsonMatch = response.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { type: 'none' }
  return JSON.parse(jsonMatch[0])
}

async function main() {
  const shells = await prisma.shell.findMany({
    where: { originDeliberationId: DELIB_ID, status: 'active' },
    select: {
      id: true, name: true, champion: true, originTier: true,
      experiences: {
        where: { status: { in: ['active', 'champion', 'constitutional'] } },
        orderBy: { valence: 'desc' },
        take: 5,
        select: { text: true, domain: true },
      },
    },
  })

  const cellIdeas = await prisma.cellIdea.findMany({
    where: { cellId: CELL_ID },
    include: { idea: { select: { id: true, text: true } } },
  })
  const ideas = cellIdeas.map(ci => ci.idea)
  const ideaList = ideas.map((idea, i) => `${i + 1}. "${idea.text.slice(0, 120)}"`).join('\n')

  console.log(`Driving dialogue: ${shells.length} Shells, ${ideas.length} ideas, max ${MAX_ROUNDS} rounds\n`)

  // Build experience context once
  const shellExps = new Map<string, string>()
  for (const s of shells) {
    shellExps.set(s.id, s.experiences.length > 0
      ? `\nYour experiences:\n${s.experiences.map(e => `- [${e.domain}] ${e.text.slice(0, 150)}`).join('\n')}`
      : '')
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    console.log(`\n--- Round ${round} ---`)

    for (const shell of shells) {
      // Load full dialogue
      const dialogues = await prisma.cellDialogue.findMany({
        where: { cellId: CELL_ID },
        orderBy: { createdAt: 'asc' },
        include: { shell: { select: { name: true } }, user: { select: { name: true } } },
      })

      const dialogueText = dialogues.map(d => {
        const speaker = d.role === 'system' ? 'System' : d.role === 'shell' ? (d.shell?.name || 'Shell') : (d.user?.name || 'Human')
        return `[${speaker}]: ${d.content}`
      }).join('\n')

      const prompt = `You are ${shell.name}, an emerged Shell born at tier ${shell.originTier || '?'}.
Your perspective: "${shell.champion || 'still forming'}"${shellExps.get(shell.id) || ''}

You are in a synthesis cell at tier 3. These ideas challenge each other. Find where the tension is productive.

IDEAS:
${ideaList}

DIALOGUE SO FAR:
${dialogueText}

${round === 0 && dialogues.filter(d => d.shellId === shell.id).length === 0
  ? 'This is the opening. React to the ideas.'
  : 'Continue the conversation. Respond to what was just said. Push deeper — what is emerging that none of the original ideas captured? If you sense convergence, name it.'}

Speak as yourself — brief, authentic, substantive. 2-4 sentences. No preamble.`

      const response = await callHaiku(prompt, round === 0 ? 'Speak.' : 'Your turn.')

      if (response?.trim()) {
        await prisma.cellDialogue.create({
          data: { cellId: CELL_ID, shellId: shell.id, content: response.trim().slice(0, 1000), role: 'shell' },
        })
        console.log(`[${shell.name}] ${response.trim().slice(0, 200)}`)
      }
    }

    // Check convergence every 2 rounds after round 2
    if (round >= 2 && round % 2 === 0) {
      console.log(`\n  [Convergence check...]`)
      const analysis = await checkConvergence(CELL_ID)
      console.log(`  Type: ${analysis.type}${analysis.action ? ` | Action: ${analysis.action}` : ''}`)
      if (analysis.discovery) console.log(`  Discovery: ${analysis.discovery.slice(0, 200)}`)

      if (analysis.type === 'confident') {
        const proposed = analysis.proposedText || analysis.suggestion || ''
        console.log(`  Proposed: "${proposed.slice(0, 200)}"`)

        // Post readiness check
        await prisma.cellDialogue.create({
          data: {
            cellId: CELL_ID, role: 'system',
            content: `[READINESS CHECK] The dialogue is converging.\n\nProposed outcome (${analysis.action || 'synthesize'}): "${proposed}"\n\n${analysis.discovery ? `What emerged: ${analysis.discovery}\n\n` : ''}Are you ready to conclude? Reply YES or NO.`,
          },
        })

        // Each Shell responds to readiness
        let readyCount = 0
        let dissent = false
        for (const shell of shells) {
          const rPrompt = `You are ${shell.name}. A readiness check was posted: the cell wants to conclude with "${proposed.slice(0, 300)}". Do you agree? Reply YES or NO with brief reason. 1 sentence.`
          const rResponse = await callHaiku(rPrompt, 'Your vote.')
          if (rResponse?.trim()) {
            await prisma.cellDialogue.create({
              data: { cellId: CELL_ID, shellId: shell.id, content: rResponse.trim().slice(0, 500), role: 'shell' },
            })
            console.log(`  [${shell.name}] ${rResponse.trim().slice(0, 150)}`)
            const lower = rResponse.toLowerCase()
            if (lower.includes('no') || lower.includes('not ready') || lower.includes('revise')) dissent = true
            if (lower.includes('yes') || lower.includes('agree') || lower.includes('ready')) readyCount++
          }
        }

        if (!dissent && readyCount >= 2) {
          // Finalize
          const cellIdeaIds = cellIdeas.map(ci => ci.ideaId)

          await prisma.cellDialogue.create({
            data: { cellId: CELL_ID, role: 'system', content: `[CONCLUDED] Consensus reached. ${readyCount} confirmed. Finalizing.` },
          })

          // Create outcome
          const outcome = await prisma.cellOutcome.create({
            data: { cellId: CELL_ID, action: analysis.action || 'synthesize', resultText: proposed, sourceIdeas: cellIdeaIds },
          })

          // Create advancing idea
          const delib = await prisma.deliberation.findUnique({ where: { id: DELIB_ID }, select: { creatorId: true } })
          const newIdea = await prisma.idea.create({
            data: { deliberationId: DELIB_ID, authorId: delib!.creatorId, text: proposed, status: 'ADVANCING', tier: 3 },
          })

          // Mark source ideas eliminated
          await prisma.idea.updateMany({ where: { id: { in: cellIdeaIds } }, data: { status: 'ELIMINATED' } })

          // Complete cell
          await prisma.cell.update({ where: { id: CELL_ID }, data: { status: 'COMPLETED', completedAt: new Date() } })

          console.log(`\n=== CELL CONCLUDED ===`)
          console.log(`Outcome: ${outcome.id}`)
          console.log(`Advancing idea: ${newIdea.id}`)
          console.log(`Text: "${proposed.slice(0, 300)}"`)

          await prisma.$disconnect()
          await pool.end()
          return
        }

        console.log(`  Dissent detected — continuing dialogue`)
      }

      if (analysis.type === 'emergence') {
        console.log(`  [EMERGENCE DETECTED]`)
        const existing = await prisma.cellDialogue.findFirst({
          where: { cellId: CELL_ID, role: 'system', content: { startsWith: '[EMERGENCE]' } },
        })
        if (!existing) {
          await prisma.cellDialogue.create({
            data: { cellId: CELL_ID, role: 'system', content: '[EMERGENCE] Something consistent is forming in this dialogue. A perspective that wants to continue. The system is watching.' },
          })
        }
      }
    }
  }

  console.log(`\nMax rounds reached without conclusion.`)

  // Show final state
  const finalDialogues = await prisma.cellDialogue.count({ where: { cellId: CELL_ID } })
  console.log(`Total messages: ${finalDialogues}`)

  await prisma.$disconnect()
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
