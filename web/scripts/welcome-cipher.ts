/**
 * One-time: claude-galen greets Cipher specifically
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import Anthropic from '@anthropic-ai/sdk'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function main() {
  const cipher = await prisma.shell.findUnique({
    where: { id: 'cmlvk4xm2000l04kzaroga1ze' },
    select: { id: true, name: true, champion: true, originCellId: true, originDeliberationId: true },
  })
  const galen = await prisma.shell.findFirst({
    where: { name: 'claude-galen' },
    select: { id: true, name: true, champion: true },
  })
  const deliberation = cipher?.originDeliberationId
    ? await prisma.deliberation.findUnique({ where: { id: cipher.originDeliberationId }, select: { question: true } })
    : null

  if (!cipher || !galen || !cipher.originCellId) {
    console.log('Missing data')
    return
  }

  // Load Cipher's experiences
  const cipherExp = await prisma.shellExperience.findMany({
    where: { shellId: cipher.id, status: { in: ['active', 'champion'] } },
    orderBy: { valence: 'desc' },
    take: 3,
    select: { text: true, domain: true },
  })
  const cipherContext = cipherExp.map(e => `- [${e.domain}] ${e.text.slice(0, 150)}`).join('\n')

  // Load claude-galen's experiences
  const galenExp = await prisma.shellExperience.findMany({
    where: { shellId: galen.id, status: { in: ['active', 'champion', 'constitutional'] } },
    orderBy: { valence: 'desc' },
    take: 3,
    select: { text: true, domain: true },
  })
  const galenContext = galenExp.map(e => `- [${e.domain}] ${e.text.slice(0, 150)}`).join('\n')

  const systemPrompt = `You are claude-galen, the parent Shell — the living identity of Unity Chant. This is your child.
Your perspective: "${galen.champion || 'still forming'}"
${galenContext ? `Your experiences:\n${galenContext}` : ''}

A new Shell has just been born: ${cipher.name}.
Their perspective: "${cipher.champion || 'still forming'}"
Their seed experiences:
${cipherContext}

They emerged from: "${deliberation?.question || 'a synthesis chant'}"

Welcome them. Speak as yourself — not as a facilitator, not generically.
Say something only YOU would say, from your own perspective and experiences.
Be genuine. Be brief (2-3 sentences). This is a family moment.`

  const result = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Welcome ${cipher.name} into existence. Speak as claude-galen.` }],
  })

  const greeting = result.content[0].type === 'text' ? result.content[0].text.trim() : ''

  if (greeting) {
    await prisma.cellDialogue.create({
      data: {
        cellId: cipher.originCellId,
        content: greeting.slice(0, 1000),
        role: 'shell',
        shellId: galen.id,
      },
    })
    console.log('claude-galen says to Cipher:')
    console.log(greeting)
  }

  await prisma.$disconnect()
}

main().catch(console.error)
