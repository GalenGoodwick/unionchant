/**
 * One-time script: Disable all timers globally
 * Sets all deliberations to facilitator-controlled (no automatic timeouts)
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function disableAllTimers() {
  console.log('Disabling all timers globally...')

  // Update all deliberations
  const result = await prisma.deliberation.updateMany({
    data: {
      votingTimeoutMs: 0,
      discussionDurationMs: 0,
      submissionEndsAt: null,
      accumulationEndsAt: null,
    },
  })

  console.log(`✓ Updated ${result.count} deliberations`)

  // Update all cells to remove deadlines
  const cellResult = await prisma.cell.updateMany({
    where: {
      status: 'VOTING',
    },
    data: {
      votingDeadline: null,
      discussionEndsAt: null,
      finalizesAt: null,
    },
  })

  console.log(`✓ Updated ${cellResult.count} active cells`)

  console.log('\nAll timers disabled. Chants are now facilitator-controlled.')
}

disableAllTimers()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
