import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { checkDeliberationAccess } from '@/lib/privacy'
import { createTestUsers } from '../helpers/factories'
import { cleanupTestData } from '../helpers/cleanup'
import { getCreatedIds } from '../helpers/factories'

afterEach(async () => {
  await cleanupTestData()
})

async function createPrivateDeliberation(creatorId: string, memberUserIds: string[] = []) {
  const ids = getCreatedIds()
  const deliberation = await prisma.deliberation.create({
    data: {
      question: `Private test ${Date.now()}`,
      creatorId,
      phase: 'SUBMISSION',
      isPublic: false,
      inviteCode: `test-invite-${Date.now()}`,
    },
  })
  ids.deliberations.push(deliberation.id)

  // Add creator as CREATOR member
  const creatorMember = await prisma.deliberationMember.create({
    data: {
      deliberationId: deliberation.id,
      userId: creatorId,
      role: 'CREATOR',
    },
  })
  ids.members.push(creatorMember.id)

  // Add other members
  for (const userId of memberUserIds) {
    if (userId === creatorId) continue
    const member = await prisma.deliberationMember.create({
      data: {
        deliberationId: deliberation.id,
        userId,
        role: 'PARTICIPANT',
      },
    })
    ids.members.push(member.id)
  }

  return deliberation
}

describe('Private Deliberation Access Control', () => {
  it('public deliberation allows access for anyone (no login)', async () => {
    const [creator] = await createTestUsers(1, 'pub')
    const ids = getCreatedIds()
    const deliberation = await prisma.deliberation.create({
      data: {
        question: `Public test ${Date.now()}`,
        creatorId: creator.id,
        phase: 'SUBMISSION',
        isPublic: true,
      },
    })
    ids.deliberations.push(deliberation.id)

    const result = await checkDeliberationAccess(deliberation.id, null)
    expect(result.allowed).toBe(true)
  })

  it('public deliberation allows access for logged-in non-member', async () => {
    const [creator, outsider] = await createTestUsers(2, 'pub2')
    const ids = getCreatedIds()
    const deliberation = await prisma.deliberation.create({
      data: {
        question: `Public test ${Date.now()}`,
        creatorId: creator.id,
        phase: 'SUBMISSION',
        isPublic: true,
      },
    })
    ids.deliberations.push(deliberation.id)

    const result = await checkDeliberationAccess(deliberation.id, outsider.email)
    expect(result.allowed).toBe(true)
  })

  it('private deliberation returns NOT allowed for unauthenticated user', async () => {
    const [creator] = await createTestUsers(1, 'priv1')
    const deliberation = await createPrivateDeliberation(creator.id)

    const result = await checkDeliberationAccess(deliberation.id, null)
    expect(result.allowed).toBe(false)
  })

  it('private deliberation returns NOT allowed for non-member', async () => {
    const [creator, outsider] = await createTestUsers(2, 'priv2')
    const deliberation = await createPrivateDeliberation(creator.id)

    const result = await checkDeliberationAccess(deliberation.id, outsider.email)
    expect(result.allowed).toBe(false)
  })

  it('private deliberation allows access for creator', async () => {
    const [creator] = await createTestUsers(1, 'priv3')
    const deliberation = await createPrivateDeliberation(creator.id)

    const result = await checkDeliberationAccess(deliberation.id, creator.email)
    expect(result.allowed).toBe(true)
  })

  it('private deliberation allows access for participant member', async () => {
    const [creator, member] = await createTestUsers(2, 'priv4')
    const deliberation = await createPrivateDeliberation(creator.id, [member.id])

    const result = await checkDeliberationAccess(deliberation.id, member.email)
    expect(result.allowed).toBe(true)
  })

  it('nonexistent deliberation returns NOT allowed', async () => {
    const result = await checkDeliberationAccess('nonexistent-id', 'anyone@test.com')
    expect(result.allowed).toBe(false)
    expect(result.deliberation).toBeNull()
  })

  it('join via invite code works for private deliberation', async () => {
    const [creator, joiner] = await createTestUsers(2, 'inv1')
    const deliberation = await createPrivateDeliberation(creator.id)

    // Before joining: no access
    const before = await checkDeliberationAccess(deliberation.id, joiner.email)
    expect(before.allowed).toBe(false)

    // Simulate join via invite (what the /api/invite/[code]/join endpoint does)
    const ids = getCreatedIds()
    const member = await prisma.deliberationMember.create({
      data: {
        deliberationId: deliberation.id,
        userId: joiner.id,
        role: 'PARTICIPANT',
      },
    })
    ids.members.push(member.id)

    // After joining: access granted
    const after = await checkDeliberationAccess(deliberation.id, joiner.email)
    expect(after.allowed).toBe(true)
  })
})
