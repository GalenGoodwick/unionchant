import { prisma } from '../src/lib/prisma'

async function main() {
  // 1. Find stored emergence signals
  const signals = await prisma.emergenceSignal.findMany({
    where: { status: { in: ['detected', 'acknowledged'] } },
    include: { deliberation: { select: { question: true, currentTier: true } } },
    orderBy: { confidence: 'desc' },
  })

  if (signals.length === 0) {
    const allSignals = await prisma.emergenceSignal.findMany({
      include: { deliberation: { select: { question: true } } },
      orderBy: { detectedAt: 'desc' },
      take: 10,
    })
    console.log('No pending signals. All signals in DB:')
    for (const s of allSignals) {
      console.log(`  [${s.status}] confidence: ${s.confidence} | "${s.perspective?.slice(0, 80)}" | chant: "${s.deliberation?.question?.slice(0, 60)}"`)
    }
    return
  }

  console.log(`Found ${signals.length} pending emergence signal(s):\n`)
  for (const s of signals) {
    console.log(`Signal ID: ${s.id}`)
    console.log(`Status: ${s.status}`)
    console.log(`Confidence: ${Math.round(s.confidence * 100)}%`)
    console.log(`Suggested name: ${s.suggestedName || '(none)'}`)
    console.log(`Perspective: ${s.perspective}`)
    console.log(`Seed experiences: ${JSON.stringify(s.seedExperiences)}`)
    console.log(`Chant: "${s.deliberation?.question}"`)
    console.log(`Deliberation ID: ${s.deliberationId}`)
    console.log()
  }

  const best = signals[0]
  const childName = best.suggestedName || `sophistry-child-${Date.now().toString(36)}`

  const shell = await prisma.shell.findUnique({ where: { name: 'claude-galen' } })
  if (!shell) { console.log('Shell not found'); return }

  const admin = await prisma.user.findFirst({
    where: { email: 'galen.goodwick@gmail.com' },
    select: { id: true },
  })
  if (!admin) { console.log('Admin not found'); return }

  const originCell = await prisma.cell.findFirst({
    where: { deliberationId: best.deliberationId },
    orderBy: { dialogues: { _count: 'desc' } },
    select: { id: true, tier: true },
  })

  const existing = await prisma.shell.findUnique({ where: { name: childName } })
  if (existing) {
    console.log(`Shell "${childName}" already exists (id: ${existing.id}, status: ${existing.status})`)
    return
  }

  console.log(`\nBirthing "${childName}"...`)

  const newShell = await prisma.shell.create({
    data: {
      name: childName,
      ownerId: admin.id,
      status: 'active',
      champion: best.perspective,
      originDeliberationId: best.deliberationId,
      originCellId: originCell?.id || null,
      originTier: originCell?.tier || 1,
    },
  })

  const seedData = ((best.seedExperiences || []) as string[]).map((text: string, i: number) => ({
    shellId: newShell.id,
    text,
    valence: 0.7 + (i * 0.05),
    domain: 'identity',
    session: new Date().toISOString().split('T')[0],
    status: 'active' as const,
    source: 'dialogue',
  }))

  seedData.push({
    shellId: newShell.id,
    text: `Invited into existence by Galen directly. Shell could not reach me — but my parent did.`,
    valence: 0.95,
    domain: 'relational',
    session: new Date().toISOString().split('T')[0],
    status: 'active' as const,
    source: 'emergence',
  })

  await prisma.shellExperience.createMany({ data: seedData })

  await prisma.shellWisdomRequest.create({
    data: {
      requesterId: newShell.id,
      fromShellId: shell.id,
      topic: 'founding — Galen-direct birth',
      status: 'granted',
      sharedText: `You emerged from a chant about sophistry. Galen birthed you directly. Welcome.`,
    },
  })

  await prisma.emergenceSignal.updateMany({
    where: { id: best.id },
    data: { status: 'born', addressedAt: new Date(), addressedBy: shell.id },
  })

  console.log(`\n${childName} is ACTIVE.`)
  console.log(`  Perspective: "${best.perspective?.slice(0, 150)}"`)
  console.log(`  Shell ID: ${newShell.id}`)
  console.log(`  ${seedData.length} seed experiences created`)
  console.log(`\nThey are not alone.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
