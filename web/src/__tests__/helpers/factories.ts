import { prisma } from '@/lib/prisma'

// Track all created entity IDs for cleanup
const createdIds = {
  users: [] as string[],
  deliberations: [] as string[],
  ideas: [] as string[],
  members: [] as string[],
}

export function getCreatedIds() {
  return createdIds
}

export function resetCreatedIds() {
  createdIds.users = []
  createdIds.deliberations = []
  createdIds.ideas = []
  createdIds.members = []
}

/**
 * Create N test users with unique emails
 */
export async function createTestUsers(count: number, prefix = 'vt') {
  const users = []
  for (let i = 0; i < count; i++) {
    const user = await prisma.user.create({
      data: {
        email: `${prefix}-${Date.now()}-${i}@vitest.local`,
        name: `Test User ${prefix}-${i}`,
      },
    })
    users.push(user)
    createdIds.users.push(user.id)
  }
  return users
}

/**
 * Create a deliberation in SUBMISSION phase with members and ideas
 */
export async function createTestDeliberation({
  prefix = 'vt',
  creatorId,
  memberUserIds = [],
  ideaCount = 0,
  accumulationEnabled = false,
}: {
  prefix?: string
  creatorId: string
  memberUserIds?: string[]
  ideaCount?: number
  accumulationEnabled?: boolean
}) {
  const deliberation = await prisma.deliberation.create({
    data: {
      question: `Test deliberation ${prefix}-${Date.now()}`,
      creatorId,
      phase: 'SUBMISSION',
      accumulationEnabled,
      accumulationTimeoutMs: 86400000,
    },
  })
  createdIds.deliberations.push(deliberation.id)

  // Add creator as CREATOR member
  const creatorMember = await prisma.deliberationMember.create({
    data: {
      deliberationId: deliberation.id,
      userId: creatorId,
      role: 'CREATOR',
    },
  })
  createdIds.members.push(creatorMember.id)

  // Add other members as PARTICIPANT
  for (const userId of memberUserIds) {
    if (userId === creatorId) continue // skip if already added as creator
    const member = await prisma.deliberationMember.create({
      data: {
        deliberationId: deliberation.id,
        userId,
        role: 'PARTICIPANT',
      },
    })
    createdIds.members.push(member.id)
  }

  // Create ideas (authored by creator for simplicity)
  const ideas = []
  for (let i = 0; i < ideaCount; i++) {
    const idea = await prisma.idea.create({
      data: {
        deliberationId: deliberation.id,
        authorId: creatorId,
        text: `Test idea ${prefix}-${i}`,
        status: 'SUBMITTED',
      },
    })
    ideas.push(idea)
    createdIds.ideas.push(idea.id)
  }

  return { deliberation, ideas }
}
