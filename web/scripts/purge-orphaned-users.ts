/**
 * Purge orphaned bot/test users from the database.
 *
 * Deletes users who have ZERO participation in any deliberation.
 * Protects: children (owned agents), collective users, paying customers,
 * and anyone who has ever voted, commented, submitted ideas, or joined a chant.
 *
 * Usage:
 *   npx tsx scripts/purge-orphaned-users.ts           # dry-run (shows what would be deleted)
 *   npx tsx scripts/purge-orphaned-users.ts --execute  # actually delete
 */

import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })
const BATCH_SIZE = 50
const execute = process.argv.includes('--execute')

// Bot/test email patterns — only these get deleted
const BOT_EMAIL_PATTERNS = [
  '@test.bot',
  '@test.local',
  '@bot.unitychant.com',
  '@plugin.unitychant.com',
  '@temporary.unitychant.com',
  '@deleted.local',
  '@vitest.local',
]

async function findOrphanedUsers() {
  return prisma.user.findMany({
    where: {
      // Only bot/test accounts (by email pattern)
      OR: [
        ...BOT_EMAIL_PATTERNS.map(pattern => ({ email: { contains: pattern } })),
        { isAI: true },
        { isAnonymous: true },
      ],

      // Zero participation in any deliberation
      memberships: { none: {} },
      votes: { none: {} },
      comments: { none: {} },
      ideas: { none: {} },
      cellParticipations: { none: {} },
      predictions: { none: {} },

      // No content creation
      deliberationsCreated: { none: {} },
      podiums: { none: {} },

      // Not a parent of AI agents
      ownedAgents: { none: {} },

      // Not a paying customer
      stripeSubscriptionId: null,

      // Exclude collective/children by name
      NOT: [
        { name: { contains: 'collective', mode: 'insensitive' as const } },
        { name: { contains: 'child', mode: 'insensitive' as const } },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      isAI: true,
      isAnonymous: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })
}

async function deleteUserBatch(userIds: string[]) {
  // FK-safe deletion order (mirrors wipe-bots route)

  // Social graph
  await prisma.follow.deleteMany({ where: { OR: [{ followerId: { in: userIds } }, { followingId: { in: userIds } }] } })
  await prisma.agreementScore.deleteMany({ where: { OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }] } })

  // Community (delete members/bans/messages, then empty communities created by these users)
  await prisma.communityBan.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { bannedById: { in: userIds } }] } })
  await prisma.groupMessage.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.communityMember.deleteMany({ where: { userId: { in: userIds } } })
  // Delete empty communities created by orphaned users (no remaining members, no deliberations)
  const orphanCommunities = await prisma.community.findMany({
    where: {
      creatorId: { in: userIds },
      members: { none: {} },
      deliberations: { none: {} },
    },
    select: { id: true },
  })
  if (orphanCommunities.length > 0) {
    await prisma.community.deleteMany({ where: { id: { in: orphanCommunities.map(c => c.id) } } })
  }
  // For communities that still have members/deliberations, reassign creator to first admin/owner member
  const remainingCommunities = await prisma.community.findMany({
    where: { creatorId: { in: userIds } },
    select: { id: true },
  })
  for (const c of remainingCommunities) {
    const firstMember = await prisma.communityMember.findFirst({
      where: { communityId: c.id },
      orderBy: { joinedAt: 'asc' },
      select: { userId: true },
    })
    if (firstMember) {
      await prisma.community.update({ where: { id: c.id }, data: { creatorId: firstMember.userId } })
    }
  }

  // Chat
  await prisma.collectiveMessage.deleteMany({ where: { userId: { in: userIds } } })

  // Engagement (should be empty for orphaned users, but safe to clear)
  await prisma.commentUpvote.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.deliberationUpvote.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.ideaRevisionVote.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.pushSubscription.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.watch.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.report.deleteMany({ where: { reporterId: { in: userIds } } })

  // Embed & API
  await prisma.embedToken.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.apiKey.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.integration.deleteMany({ where: { userId: { in: userIds } } })

  // Eye
  await prisma.eye.deleteMany({ where: { ownerId: { in: userIds } } })

  // Shell — preserve shells and their content, just detach user references
  await prisma.shell.updateMany({ where: { bondedUserId: { in: userIds } }, data: { bondedUserId: null } })
  await prisma.shellReachOut.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.bondRequest.deleteMany({ where: { userId: { in: userIds } } })

  // CellDialogue (set userId null — nullable FK, preserves the dialogue content)
  await prisma.cellDialogue.updateMany({ where: { userId: { in: userIds } }, data: { userId: null } })

  // Skip users who own shells — can't delete them without orphaning shell records
  const shellOwnerIds = (await prisma.shell.findMany({
    where: { ownerId: { in: userIds } },
    select: { ownerId: true },
    distinct: ['ownerId'],
  })).map(s => s.ownerId)
  const safeUserIds = userIds.filter(id => !shellOwnerIds.includes(id))
  if (shellOwnerIds.length > 0) {
    console.log(`    (skipped ${shellOwnerIds.length} users who own shells)`)
  }

  // Challenge logs (set userId null — SetNull cascade)
  await prisma.challengeLog.updateMany({ where: { userId: { in: userIds } }, data: { userId: null } })

  // Auth
  await prisma.webAuthnCredential.deleteMany({ where: { userId: { in: safeUserIds } } })
  await prisma.session.deleteMany({ where: { userId: { in: safeUserIds } } })
  await prisma.account.deleteMany({ where: { userId: { in: safeUserIds } } })

  // Users
  const result = await prisma.user.deleteMany({ where: { id: { in: safeUserIds } } })
  return result.count
}

async function main() {
  console.log(execute ? '\n=== EXECUTE MODE ===' : '\n=== DRY RUN (pass --execute to delete) ===')
  console.log()

  const orphans = await findOrphanedUsers()

  if (orphans.length === 0) {
    console.log('No orphaned users found. Database is clean.')
    return
  }

  // Stats
  const aiCount = orphans.filter(u => u.isAI).length
  const anonCount = orphans.filter(u => u.isAnonymous).length
  const regularCount = orphans.length - aiCount - anonCount

  console.log(`Found ${orphans.length} orphaned users (zero deliberation participation):`)
  console.log(`  AI agents:  ${aiCount}`)
  console.log(`  Anonymous:  ${anonCount}`)
  console.log(`  Regular:    ${regularCount}`)
  console.log()

  // Show sample
  const sample = orphans.slice(0, 15)
  console.log(`Sample (first ${sample.length}):`)
  for (const u of sample) {
    const flags = [u.isAI && 'AI', u.isAnonymous && 'anon'].filter(Boolean).join(',')
    console.log(`  ${u.email?.padEnd(45)} ${flags.padEnd(8)} ${u.createdAt.toISOString().slice(0, 10)}`)
  }
  if (orphans.length > 15) {
    console.log(`  ... and ${orphans.length - 15} more`)
  }
  console.log()

  if (!execute) {
    console.log('Run with --execute to delete these users.')
    return
  }

  // Delete in batches
  let totalDeleted = 0
  const allIds = orphans.map(u => u.id)

  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batch = allIds.slice(i, i + BATCH_SIZE)
    const deleted = await deleteUserBatch(batch)
    totalDeleted += deleted
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: deleted ${deleted} users (${totalDeleted}/${allIds.length})`)
  }

  console.log(`\nDone. Deleted ${totalDeleted} orphaned users.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
