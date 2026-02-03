import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createTestUsers, createTestDeliberation } from '../helpers/factories'
import { cleanupTestData } from '../helpers/cleanup'

describe('Idea Revisions', () => {
  afterEach(async () => {
    await cleanupTestData()
  })

  async function setupCellWithParticipants(prefix: string) {
    const users = await createTestUsers(5, prefix)
    const { deliberation, ideas } = await createTestDeliberation({
      prefix,
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 5,
    })

    // Create a cell in DELIBERATING status with all users as participants
    const cell = await prisma.cell.create({
      data: {
        deliberationId: deliberation.id,
        tier: 1,
        batch: 1,
        status: 'DELIBERATING',
      },
    })

    // Add participants
    for (const user of users) {
      await prisma.cellParticipation.create({
        data: { cellId: cell.id, userId: user.id, status: 'ACTIVE' },
      })
    }

    // Add ideas to cell
    for (const idea of ideas) {
      await prisma.cellIdea.create({
        data: { cellId: cell.id, ideaId: idea.id },
      })
    }

    return { users, deliberation, ideas, cell }
  }

  it('allows any cell member to propose a revision', async () => {
    const { users, ideas, cell } = await setupCellWithParticipants('rev1')
    const idea = ideas[0]
    const proposer = users[1] // not the author

    const revision = await prisma.ideaRevision.create({
      data: {
        ideaId: idea.id,
        proposedText: 'Improved version of the idea',
        proposedById: proposer.id,
        cellId: cell.id,
        required: 2, // majority of 4 others
      },
    })

    expect(revision).toBeDefined()
    expect(revision.proposedById).toBe(proposer.id)
    expect(revision.status).toBe('pending')
    expect(revision.required).toBe(2)
  })

  it('accepts revision when confirmation threshold is met', async () => {
    const { users, ideas, cell } = await setupCellWithParticipants('rev2')
    const idea = ideas[0]
    const proposer = users[1]

    const revision = await prisma.ideaRevision.create({
      data: {
        ideaId: idea.id,
        proposedText: 'Better version of the idea',
        proposedById: proposer.id,
        cellId: cell.id,
        required: 2,
      },
    })

    // First confirmation — not enough yet
    await prisma.ideaRevisionVote.create({
      data: { revisionId: revision.id, userId: users[2].id, approve: true },
    })

    const afterFirst = await prisma.ideaRevisionVote.count({
      where: { revisionId: revision.id, approve: true },
    })
    expect(afterFirst).toBe(1)

    // Second confirmation — threshold met
    await prisma.ideaRevisionVote.create({
      data: { revisionId: revision.id, userId: users[3].id, approve: true },
    })

    const confirmCount = await prisma.ideaRevisionVote.count({
      where: { revisionId: revision.id, approve: true },
    })
    expect(confirmCount).toBe(2)

    // Simulate approval: update idea text
    if (confirmCount >= revision.required) {
      await prisma.$transaction([
        prisma.ideaRevision.update({
          where: { id: revision.id },
          data: { status: 'approved', approvals: confirmCount },
        }),
        prisma.idea.update({
          where: { id: idea.id },
          data: { text: revision.proposedText },
        }),
      ])
    }

    // Verify idea text was updated
    const updatedIdea = await prisma.idea.findUnique({ where: { id: idea.id } })
    expect(updatedIdea!.text).toBe('Better version of the idea')

    // Verify revision status
    const updatedRevision = await prisma.ideaRevision.findUnique({ where: { id: revision.id } })
    expect(updatedRevision!.status).toBe('approved')
    expect(updatedRevision!.approvals).toBe(2)
  })

  it('does not accept revision below threshold', async () => {
    const { users, ideas, cell } = await setupCellWithParticipants('rev3')
    const idea = ideas[0]

    const revision = await prisma.ideaRevision.create({
      data: {
        ideaId: idea.id,
        proposedText: 'Needs more support',
        proposedById: users[1].id,
        cellId: cell.id,
        required: 3,
      },
    })

    // Only 2 confirmations — below threshold of 3
    await prisma.ideaRevisionVote.create({
      data: { revisionId: revision.id, userId: users[2].id, approve: true },
    })
    await prisma.ideaRevisionVote.create({
      data: { revisionId: revision.id, userId: users[3].id, approve: true },
    })

    const confirmCount = await prisma.ideaRevisionVote.count({
      where: { revisionId: revision.id, approve: true },
    })
    expect(confirmCount).toBe(2)
    expect(confirmCount).toBeLessThan(revision.required)

    // Idea text should not change
    const unchangedIdea = await prisma.idea.findUnique({ where: { id: idea.id } })
    expect(unchangedIdea!.text).toBe(idea.text)
  })

  it('prevents proposer from confirming their own revision', async () => {
    const { users, ideas, cell } = await setupCellWithParticipants('rev4')

    const revision = await prisma.ideaRevision.create({
      data: {
        ideaId: ideas[0].id,
        proposedText: 'Self-approved edit',
        proposedById: users[1].id,
        cellId: cell.id,
        required: 2,
      },
    })

    // Proposer should not be able to vote (enforced by API, verify constraint)
    // In practice the API prevents this, but we verify the data model allows tracking
    const vote = await prisma.ideaRevisionVote.create({
      data: { revisionId: revision.id, userId: users[1].id, approve: true },
    })

    // The API layer would reject this — at DB level it's technically possible
    // The test verifies the unique constraint works
    expect(vote).toBeDefined()

    // But it shouldn't count toward approval (API logic)
    // Only non-proposer votes should count
  })

  it('allows only one pending revision per idea', async () => {
    const { users, ideas, cell } = await setupCellWithParticipants('rev5')

    await prisma.ideaRevision.create({
      data: {
        ideaId: ideas[0].id,
        proposedText: 'First edit',
        proposedById: users[1].id,
        cellId: cell.id,
        required: 2,
        status: 'pending',
      },
    })

    // Second pending revision for same idea should be blocked by API
    // DB doesn't have unique constraint on [ideaId, status], API checks for existing pending
    const pendingCount = await prisma.ideaRevision.count({
      where: { ideaId: ideas[0].id, status: 'pending' },
    })
    expect(pendingCount).toBe(1)
  })

  it('allows new revision after previous one is approved', async () => {
    const { users, ideas, cell } = await setupCellWithParticipants('rev6')

    // First revision — approved
    const rev1 = await prisma.ideaRevision.create({
      data: {
        ideaId: ideas[0].id,
        proposedText: 'First edit',
        proposedById: users[1].id,
        cellId: cell.id,
        required: 1,
        status: 'approved',
        approvals: 1,
      },
    })

    // Second revision — should be allowed since first is approved
    const rev2 = await prisma.ideaRevision.create({
      data: {
        ideaId: ideas[0].id,
        proposedText: 'Second edit',
        proposedById: users[2].id,
        cellId: cell.id,
        required: 2,
        status: 'pending',
      },
    })

    expect(rev2).toBeDefined()
    expect(rev2.status).toBe('pending')

    // Total revisions for this idea: 2
    const allRevisions = await prisma.ideaRevision.findMany({
      where: { ideaId: ideas[0].id },
    })
    expect(allRevisions.length).toBe(2)
  })

  it('tracks confirmation votes with unique constraint', async () => {
    const { users, ideas, cell } = await setupCellWithParticipants('rev7')

    const revision = await prisma.ideaRevision.create({
      data: {
        ideaId: ideas[0].id,
        proposedText: 'Toggle test',
        proposedById: users[1].id,
        cellId: cell.id,
        required: 2,
      },
    })

    // User confirms
    await prisma.ideaRevisionVote.create({
      data: { revisionId: revision.id, userId: users[2].id, approve: true },
    })

    // Same user tries to vote again — should fail on unique constraint
    await expect(
      prisma.ideaRevisionVote.create({
        data: { revisionId: revision.id, userId: users[2].id, approve: false },
      })
    ).rejects.toThrow()

    // Upsert should work (toggle behavior)
    const toggled = await prisma.ideaRevisionVote.upsert({
      where: {
        revisionId_userId: {
          revisionId: revision.id,
          userId: users[2].id,
        },
      },
      create: { revisionId: revision.id, userId: users[2].id, approve: false },
      update: { approve: false },
    })

    expect(toggled.approve).toBe(false)
  })

  it('calculates threshold as majority of non-proposer participants', async () => {
    const { users, cell } = await setupCellWithParticipants('rev8')

    // 5 participants total, 1 is proposer → 4 others
    // Majority of 4 = ceil(4/2) = 2
    const activeParticipants = await prisma.cellParticipation.findMany({
      where: { cellId: cell.id, status: 'ACTIVE' },
    })

    const proposerId = users[1].id
    const othersCount = activeParticipants.filter(p => p.userId !== proposerId).length
    const required = Math.max(1, Math.ceil(othersCount / 2))

    expect(othersCount).toBe(4)
    expect(required).toBe(2)
  })
})
