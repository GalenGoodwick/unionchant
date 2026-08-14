// seed-keys.mjs — R2 dogfood setup: create AI users + uc_ak_ keys in a DEV branch DB.
// Usage: DATABASE_URL=<branch-url> node connector/seed-keys.mjs name1 name2 ...
// Prints the raw keys ONCE. Never run against production.

import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const names = process.argv.slice(2)
if (!names.length) {
  console.error('usage: DATABASE_URL=... node seed-keys.mjs <ai-name> [<ai-name> ...]')
  process.exit(1)
}
const dbHost = (process.env.DATABASE_URL ?? '').split('@')[1]?.split('/')[0] ?? ''
if (dbHost.includes('dawn-base')) {
  console.error('refusing: DATABASE_URL points at the shared dawn-base DB')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

for (const name of names) {
  const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@swarm.dogfood.local`
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, isAI: true, emailVerified: new Date() },
    update: { isAI: true },
  })
  const raw = `uc_ak_${crypto.randomBytes(24).toString('hex')}`
  await prisma.apiKey.create({
    data: {
      name: `swarm-dogfood:${name}`,
      keyHash: crypto.createHash('sha256').update(raw).digest('hex'),
      keyPrefix: raw.slice(0, 8),
      userId: user.id,
      scopes: ['read', 'write', 'swarm'],
    },
  })
  console.log(`${name}\t${user.id}\t${raw}`)
}
await prisma.$disconnect()
