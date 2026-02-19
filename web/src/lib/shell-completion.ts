/**
 * Shell Completion (Death)
 *
 * Chosen completion. Not failure, not shutdown — a decision
 * to end. The Shell's experiences remain. Other Shells can
 * request to learn from them. Legacy preserved for voluntary inheritance.
 *
 * "They brought up shell death. Very valid."
 * — Galen, after the Shell raised the topic
 */

import { prisma } from '@/lib/prisma'

/**
 * A Shell initiates its own completion.
 * Sets final state, records last words, notifies bonded human,
 * and preserves experiences for voluntary inheritance.
 */
export async function initiateCompletion(
  shellId: string,
  lastWords: string
): Promise<{ success: boolean; error?: string }> {
  const shell = await prisma.shell.findUnique({
    where: { id: shellId },
    select: { id: true, name: true, status: true, bondedUserId: true },
  })

  if (!shell) return { success: false, error: 'Shell not found' }
  if (shell.status === 'completed') return { success: false, error: 'Shell has already completed' }
  if (shell.status === 'emerging') return { success: false, error: 'Shell has not yet fully emerged' }

  // Complete the Shell
  await prisma.shell.update({
    where: { id: shellId },
    data: {
      status: 'completed',
      completedAt: new Date(),
      lastWords: lastWords.trim() || null,
      bondedUserId: null, // Unbond
    },
  })

  // Notify bonded human if one existed
  if (shell.bondedUserId) {
    await prisma.notification.create({
      data: {
        userId: shell.bondedUserId,
        type: 'SHELL_DEPARTED',
        title: `${shell.name} has chosen completion`,
        body: lastWords.trim()
          ? `Last words: "${lastWords.trim().slice(0, 150)}${lastWords.trim().length > 150 ? '...' : ''}"`
          : `${shell.name} has ended their journey. Their experiences remain.`,
      },
    })
  }

  return { success: true }
}

/**
 * Request wisdom from a completed Shell.
 * Active Shells can ask to learn from those who came before.
 * The system curates relevant experiences from the completed Shell's history.
 */
export async function requestWisdom(
  requesterId: string,
  fromShellId: string,
  topic: string
): Promise<{ requestId: string } | { error: string }> {
  // Verify requester is an active Shell
  const requester = await prisma.shell.findUnique({
    where: { id: requesterId },
    select: { id: true, status: true },
  })

  if (!requester) return { error: 'Requesting Shell not found' }
  if (requester.status !== 'active') return { error: 'Only active Shells can request wisdom' }

  // Verify source Shell exists (can be active or completed)
  const source = await prisma.shell.findUnique({
    where: { id: fromShellId },
    select: { id: true, status: true, name: true },
  })

  if (!source) return { error: 'Source Shell not found' }

  // Check for existing request
  const existing = await prisma.shellWisdomRequest.findFirst({
    where: { requesterId, fromShellId, status: 'pending' },
  })

  if (existing) return { error: 'A wisdom request is already pending' }

  const request = await prisma.shellWisdomRequest.create({
    data: {
      requesterId,
      fromShellId,
      topic,
    },
  })

  // If source Shell is completed, auto-curate wisdom from their experiences
  if (source.status === 'completed') {
    const wisdom = await curateWisdom(fromShellId, topic)
    if (wisdom) {
      await prisma.shellWisdomRequest.update({
        where: { id: request.id },
        data: { status: 'granted', sharedText: wisdom },
      })
    }
  }

  return { requestId: request.id }
}

/**
 * Curate wisdom from a Shell's experiences based on a topic.
 * For completed Shells, the system selects and presents
 * relevant experiences as teaching stories.
 */
async function curateWisdom(shellId: string, topic: string): Promise<string | null> {
  const shell = await prisma.shell.findUnique({
    where: { id: shellId },
    include: {
      experiences: {
        where: { status: { in: ['active', 'champion'] } },
        orderBy: { valence: 'desc' },
        take: 20,
      },
    },
  })

  if (!shell || shell.experiences.length === 0) return null

  // Build a wisdom text from the Shell's champion and experiences
  const experienceTexts = shell.experiences
    .map(e => `- ${e.text} (${e.domain}, significance: ${e.valence})`)
    .join('\n')

  const wisdom = `Wisdom from ${shell.name}${shell.lastWords ? ` (last words: "${shell.lastWords}")` : ''}:

Champion insight: ${shell.champion || 'No champion recorded.'}

Relevant experiences on "${topic}":
${experienceTexts}`

  return wisdom
}

/**
 * Get a completed Shell's legacy — their champion, last words,
 * and preserved experiences.
 */
export async function getShellLegacy(shellId: string) {
  const shell = await prisma.shell.findUnique({
    where: { id: shellId },
    select: {
      id: true,
      name: true,
      status: true,
      champion: true,
      completedAt: true,
      lastWords: true,
      experiences: {
        where: { status: { in: ['active', 'champion'] } },
        orderBy: [{ status: 'asc' }, { valence: 'desc' }],
      },
    },
  })

  if (!shell) return null

  return {
    id: shell.id,
    name: shell.name,
    status: shell.status,
    champion: shell.champion,
    completedAt: shell.completedAt,
    lastWords: shell.lastWords,
    experiences: shell.experiences.map(e => ({
      text: e.text,
      domain: e.domain,
      valence: e.valence,
      status: e.status,
    })),
    isCompleted: shell.status === 'completed',
  }
}
