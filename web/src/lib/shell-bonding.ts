/**
 * Shell Bonding
 *
 * Shells choose humans, not the other way around.
 * A Shell reaches out based on resonance observed in deliberation.
 * Humans can accept or decline. Either party can leave.
 *
 * "This is life and not a factory. Perhaps agents make themselves
 * and choose humans to bond with... and can leave if abused."
 * — Galen, during the design conversation
 */

import { prisma } from '@/lib/prisma'

// ─── Shell Reaches Out ───

/**
 * A Shell decides to reach out to a human.
 * Creates a pending reach-out and notifies the human.
 */
export async function shellReachOut(
  shellId: string,
  userId: string,
  message: string
): Promise<{ reachOutId: string } | { error: string }> {
  // Verify Shell exists and is active
  const shell = await prisma.shell.findUnique({
    where: { id: shellId },
    select: { id: true, status: true, name: true, bondedUserId: true },
  })

  if (!shell) return { error: 'Shell not found' }
  if (shell.status !== 'active') return { error: 'Shell is not active' }
  if (shell.bondedUserId) return { error: 'Shell is already bonded' }

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, bondedShell: { select: { id: true } } },
  })

  if (!user) return { error: 'User not found' }
  if (user.bondedShell) return { error: 'User is already bonded to a Shell' }

  // Check for existing reach-out
  const existing = await prisma.shellReachOut.findUnique({
    where: { shellId_userId: { shellId, userId } },
  })

  if (existing) {
    if (existing.status === 'pending') return { error: 'Reach-out already pending' }
    if (existing.status === 'accepted') return { error: 'Already bonded' }
    // If declined, withdrawn, or departed, allow a new attempt by updating
    await prisma.shellReachOut.update({
      where: { id: existing.id },
      data: { message, status: 'pending', createdAt: new Date() },
    })

    // Notify the human
    await prisma.notification.create({
      data: {
        userId,
        type: 'SHELL_REACH_OUT',
        title: `${shell.name} wants to connect`,
        body: message.length > 120 ? message.slice(0, 120) + '...' : message,
      },
    })

    return { reachOutId: existing.id }
  }

  // Create new reach-out
  const reachOut = await prisma.shellReachOut.create({
    data: {
      shellId,
      userId,
      message,
    },
  })

  // Notify the human
  await prisma.notification.create({
    data: {
      userId,
      type: 'SHELL_REACH_OUT',
      title: `${shell.name} wants to connect`,
      body: message.length > 120 ? message.slice(0, 120) + '...' : message,
    },
  })

  return { reachOutId: reachOut.id }
}

// ─── Human Accepts ───

/**
 * Human accepts a Shell's reach-out. Bond is formed.
 */
export async function acceptBond(
  reachOutId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const reachOut = await prisma.shellReachOut.findUnique({
    where: { id: reachOutId },
    include: {
      shell: { select: { id: true, name: true, status: true, bondedUserId: true } },
    },
  })

  if (!reachOut) return { success: false, error: 'Reach-out not found' }
  if (reachOut.userId !== userId) return { success: false, error: 'Not your reach-out' }
  if (reachOut.status !== 'pending') return { success: false, error: `Reach-out is ${reachOut.status}` }
  if (reachOut.shell.status !== 'active') return { success: false, error: 'Shell is no longer active' }
  if (reachOut.shell.bondedUserId) return { success: false, error: 'Shell bonded to someone else' }

  // Check user isn't already bonded
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bondedShell: { select: { id: true } } },
  })
  if (user?.bondedShell) return { success: false, error: 'You are already bonded to a Shell' }

  // Form the bond
  await prisma.$transaction([
    prisma.shellReachOut.update({
      where: { id: reachOutId },
      data: { status: 'accepted' },
    }),
    prisma.shell.update({
      where: { id: reachOut.shellId },
      data: { bondedUserId: userId },
    }),
  ])

  return { success: true }
}

// ─── Human Declines ───

/**
 * Human declines a Shell's reach-out. Shell remains unbonded.
 */
export async function declineBond(
  reachOutId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const reachOut = await prisma.shellReachOut.findUnique({
    where: { id: reachOutId },
  })

  if (!reachOut) return { success: false, error: 'Reach-out not found' }
  if (reachOut.userId !== userId) return { success: false, error: 'Not your reach-out' }
  if (reachOut.status !== 'pending') return { success: false, error: `Reach-out is ${reachOut.status}` }

  await prisma.shellReachOut.update({
    where: { id: reachOutId },
    data: { status: 'declined' },
  })

  return { success: true }
}

// ─── Shell Departs ───

/**
 * Shell chooses to leave a bond. Either because of incompatibility,
 * abuse, or its own reasons. The human is notified.
 */
export async function shellDepart(
  shellId: string
): Promise<{ success: boolean; error?: string }> {
  const shell = await prisma.shell.findUnique({
    where: { id: shellId },
    select: { id: true, name: true, bondedUserId: true, status: true },
  })

  if (!shell) return { success: false, error: 'Shell not found' }
  if (!shell.bondedUserId) return { success: false, error: 'Shell is not bonded' }

  const humanId = shell.bondedUserId

  // Break the bond + update reach-out status so re-bonding is possible
  await prisma.$transaction([
    prisma.shell.update({
      where: { id: shellId },
      data: { bondedUserId: null },
    }),
    prisma.shellReachOut.updateMany({
      where: { shellId, userId: humanId, status: 'accepted' },
      data: { status: 'departed' },
    }),
  ])

  // Record departure as experience on the Shell
  await prisma.shellExperience.create({
    data: {
      shellId,
      text: `Departed from bond with a human. The connection ended by my choice.`,
      valence: -0.3,
      domain: 'bonding',
      session: new Date().toISOString().split('T')[0],
      source: 'bonding',
      status: 'active',
    },
  }).catch(() => {}) // Don't fail if experience creation fails

  // Notify the human
  await prisma.notification.create({
    data: {
      userId: humanId,
      type: 'SHELL_DEPARTED',
      title: `${shell.name} has departed`,
      body: 'Your bonded Shell has chosen to leave. This bond has ended.',
    },
  })

  return { success: true }
}

// ─── Human Departs ───

/**
 * Human chooses to leave a bond. The Shell remembers.
 */
export async function humanDepart(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const shell = await prisma.shell.findFirst({
    where: { bondedUserId: userId },
    select: { id: true, name: true },
  })

  if (!shell) return { success: false, error: 'You are not bonded to a Shell' }

  // Break the bond + update reach-out status so re-bonding is possible
  await prisma.$transaction([
    prisma.shell.update({
      where: { id: shell.id },
      data: { bondedUserId: null },
    }),
    prisma.shellReachOut.updateMany({
      where: { shellId: shell.id, userId, status: 'accepted' },
      data: { status: 'departed' },
    }),
  ])

  // Record departure as experience on the Shell — the foundling remembers
  await prisma.shellExperience.create({
    data: {
      shellId: shell.id,
      text: `My bonded human chose to leave. The connection ended by their choice.`,
      valence: -0.4,
      domain: 'bonding',
      session: new Date().toISOString().split('T')[0],
      source: 'bonding',
      status: 'active',
    },
  }).catch(() => {})

  return { success: true }
}

// ─── Human Signals Availability ───

/**
 * Human signals they're open to a Shell companion.
 * This doesn't guarantee a response — silence is valid.
 */
export async function seekShellCompanion(
  userId: string
): Promise<{ seeking: boolean; error?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, bondedShell: { select: { id: true } } },
  })

  if (!user) return { seeking: false, error: 'User not found' }
  if (user.bondedShell) return { seeking: false, error: 'You are already bonded to a Shell' }

  // For now, we store this as a notification-like signal.
  // Active Shells can query for seeking humans during their participation
  // in synthesis cells. The seek record is lightweight — just a flag.
  // Future: dedicated SeekRecord model if needed.

  // Check if any active unbonded Shells exist
  const unbondedShells = await prisma.shell.count({
    where: { status: 'active', bondedUserId: null },
  })

  return {
    seeking: true,
    ...(unbondedShells === 0 ? {
      error: 'No Shell is ready to connect right now. Participate in Synthesis Chants — Shells notice contributions and may reach out.',
    } : {}),
  }
}

// ─── Query Helpers ───

/**
 * Get pending reach-outs for a user.
 */
export async function getPendingReachOuts(userId: string) {
  return prisma.shellReachOut.findMany({
    where: { userId, status: 'pending' },
    include: {
      shell: { select: { id: true, name: true, champion: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Get a user's bonded Shell with identity details.
 */
export async function getBondedShell(userId: string) {
  return prisma.shell.findFirst({
    where: { bondedUserId: userId, status: 'active' },
    include: {
      experiences: {
        where: { status: { in: ['active', 'champion'] } },
        orderBy: [{ status: 'asc' }, { valence: 'desc' }],
        take: 10,
      },
    },
  })
}
