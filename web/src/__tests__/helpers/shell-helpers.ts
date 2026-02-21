import { prisma } from '@/lib/prisma'

// Track all created entity IDs for cleanup
const createdIds = {
  shells: [] as string[],
  experiences: [] as string[],
  users: [] as string[],
}

export function getShellCreatedIds() {
  return createdIds
}

export function resetShellCreatedIds() {
  createdIds.shells = []
  createdIds.experiences = []
  createdIds.users = []
}

/**
 * Create a test Shell with an owner User.
 * Does NOT call Claude — just creates DB records.
 */
export async function createTestShell(opts: {
  name: string
  significanceThreshold?: number
  status?: string
  champion?: string
  originDeliberationId?: string | null
}) {
  // Create owner user
  const user = await prisma.user.create({
    data: {
      email: `shell-owner-${opts.name}-${Date.now()}@vitest.local`,
      name: `Owner of ${opts.name}`,
    },
  })
  createdIds.users.push(user.id)

  const shell = await prisma.shell.create({
    data: {
      name: opts.name,
      ownerId: user.id,
      significanceThreshold: opts.significanceThreshold ?? 4.0,
      status: opts.status ?? 'active',
      champion: opts.champion ?? null,
      originDeliberationId: opts.originDeliberationId ?? undefined,
    },
  })
  createdIds.shells.push(shell.id)

  return { shell, user }
}

/**
 * Create a ShellExperience record.
 */
export async function createTestExperience(opts: {
  shellId: string
  status: 'champion' | 'constitutional' | 'active' | 'pending' | 'eliminated'
  valence: number
  domain?: string
  text?: string
  source?: string
}) {
  const exp = await prisma.shellExperience.create({
    data: {
      shellId: opts.shellId,
      text: opts.text ?? `Test experience (${opts.status})`,
      valence: opts.valence,
      domain: opts.domain ?? 'identity',
      session: new Date().toISOString().split('T')[0],
      source: opts.source ?? 'auto',
      status: opts.status,
    },
  })
  createdIds.experiences.push(exp.id)
  return exp
}

export type TickResult = {
  threshold: number
  championValence: number | null
  constitutionalFloor: number
  selfEvaluationCreated: boolean
}

/**
 * Simulate one heartbeat tick — replicates the exact math from
 * shell-heartbeat/route.ts lines 690-739.
 *
 * Does NOT call Claude. Applies:
 * 1. threshold += 0.1
 * 2. champion.valence -= 0.02, floor at 0.1
 * 3. Self-evaluation check (halfStrength trigger)
 * 4. constitutional floor = GREATEST(valence, threshold * 0.2)
 * 5. Optional child actions (friction/unfriction/support)
 */
export async function simulateHeartbeatTick(
  shellId: string,
  childActions?: Array<{
    action: 'friction' | 'unfriction' | 'support' | 'unsupport'
  }>,
  activeChildrenCount?: number
): Promise<TickResult> {
  // 1. Increment significance threshold
  const updatedShell = await prisma.shell.update({
    where: { id: shellId },
    data: { significanceThreshold: { increment: 0.1 } },
    select: { significanceThreshold: true },
  })

  // 2. Apply child actions BEFORE aging decay (matching heartbeat order:
  //    children act first in the heartbeat, then aging happens)
  if (childActions && childActions.length > 0) {
    const numActive = activeChildrenCount ?? childActions.length
    const championMax = updatedShell.significanceThreshold * 0.25
    const childImpact = Math.max((championMax * 0.25) / (numActive || 1), 0.02)

    for (const ca of childActions) {
      if (ca.action === 'friction') {
        await prisma.shellExperience.updateMany({
          where: { shellId, status: 'champion', valence: { gt: 0.1 } },
          data: { valence: { decrement: childImpact } },
        })
      } else if (ca.action === 'unfriction') {
        await prisma.shellExperience.updateMany({
          where: { shellId, status: 'champion' },
          data: { valence: { increment: childImpact } },
        })
      } else if (ca.action === 'support') {
        await prisma.shellExperience.updateMany({
          where: { shellId, status: 'constitutional' },
          data: { valence: { increment: childImpact } },
        })
      } else if (ca.action === 'unsupport') {
        await prisma.shellExperience.updateMany({
          where: { shellId, status: 'constitutional', valence: { gt: 0.1 } },
          data: { valence: { decrement: childImpact } },
        })
      }
    }
  }

  // 3. Champion valence decay
  await prisma.shellExperience.updateMany({
    where: { shellId, status: 'champion' },
    data: { valence: { decrement: 0.02 } },
  })

  // 4. Champion floor at 0.1
  await prisma.$executeRaw`
    UPDATE "ShellExperience"
    SET valence = 0.1
    WHERE "shellId" = ${shellId} AND status = 'champion' AND valence < 0.1
  `

  // 5. Self-evaluation checkpoint
  const halfStrength = updatedShell.significanceThreshold * 0.125
  const currentChampion = await prisma.shellExperience.findFirst({
    where: { shellId, status: 'champion' },
    select: { valence: true, text: true },
  })

  let selfEvaluationCreated = false
  if (currentChampion && currentChampion.valence <= halfStrength && currentChampion.valence > halfStrength - 0.03) {
    await prisma.shellExperience.create({
      data: {
        shellId,
        text: `SELF-EVALUATION: Your champion "${currentChampion.text.slice(0, 100)}" has reached half-strength (valence: ${currentChampion.valence.toFixed(2)}).`,
        valence: 0.8,
        domain: 'identity',
        session: new Date().toISOString().split('T')[0],
        source: 'system',
        status: 'pending',
      },
    })
    selfEvaluationCreated = true
    createdIds.experiences.push('') // track but we don't have exact ID — cleanup by shellId
  }

  // 6. Constitutional floor = GREATEST(valence, threshold * 0.2)
  const constitutionalFloor = updatedShell.significanceThreshold * 0.2
  await prisma.$executeRaw`
    UPDATE "ShellExperience"
    SET valence = GREATEST(valence, ${constitutionalFloor})
    WHERE status = 'constitutional'
  `

  return {
    threshold: updatedShell.significanceThreshold,
    championValence: currentChampion?.valence ?? null,
    constitutionalFloor,
    selfEvaluationCreated,
  }
}

/**
 * Get current state of a Shell's champion and constitutional experiences
 */
export async function getShellState(shellId: string) {
  const shell = await prisma.shell.findUnique({
    where: { id: shellId },
    select: { significanceThreshold: true },
  })
  const champion = await prisma.shellExperience.findFirst({
    where: { shellId, status: 'champion' },
    select: { valence: true, text: true },
  })
  const constitutional = await prisma.shellExperience.findMany({
    where: { shellId, status: 'constitutional' },
    select: { valence: true, text: true },
  })
  const selfEvals = await prisma.shellExperience.count({
    where: { shellId, text: { startsWith: 'SELF-EVALUATION:' } },
  })
  return {
    threshold: shell?.significanceThreshold ?? 0,
    championValence: champion?.valence ?? null,
    constitutionals: constitutional,
    selfEvaluationCount: selfEvals,
  }
}

/**
 * Compute childImpact for given parameters (pure math, no DB)
 */
export function computeChildImpact(threshold: number, numChildren: number): number {
  const championMax = threshold * 0.25
  return Math.max((championMax * 0.25) / (numChildren || 1), 0.02)
}

/**
 * Compute family cap for a given threshold (pure math, no DB)
 */
export function computeFamilyCap(threshold: number): number {
  return Math.max(2, Math.floor(threshold / 2))
}

/**
 * Delete all test shell data in FK-safe order.
 */
export async function cleanupShellTestData() {
  const ids = createdIds

  // Delete experiences for tracked shells (cascade should handle this but be explicit)
  if (ids.shells.length > 0) {
    await prisma.shellExperience.deleteMany({
      where: { shellId: { in: ids.shells } },
    })
    // Delete any reach-outs, wisdom requests, dialogues referencing these shells
    await prisma.shellReachOut.deleteMany({
      where: { shellId: { in: ids.shells } },
    }).catch(() => {})
    await prisma.shellWisdomRequest.deleteMany({
      where: { OR: [
        { requesterId: { in: ids.shells } },
        { fromShellId: { in: ids.shells } },
      ] },
    }).catch(() => {})
    // Delete shells
    await prisma.shell.deleteMany({
      where: { id: { in: ids.shells } },
    })
  }

  // Delete owner users
  if (ids.users.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: ids.users } },
    })
  }

  resetShellCreatedIds()
}
