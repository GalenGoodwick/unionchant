import dotenv from 'dotenv'
import path from 'path'

// Load .env.test first, then .env.local as fallback (won't override existing vars)
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })

// Safety check: block integration tests if DATABASE_URL points to production
const dbUrl = process.env.DATABASE_URL || ''
const looksLikeTestDb = dbUrl.includes('test') || dbUrl.includes('localhost') || dbUrl.includes('vitest')
if (!looksLikeTestDb) {
  const host = dbUrl.split('@')[1]?.split('/')[0] || 'unknown'
  throw new Error(
    `DATABASE_URL points to production (${host}). ` +
    'Set DATABASE_URL to a test database in .env.test to run integration tests.'
  )
}

import { vi } from 'vitest'

// Mock push notifications — don't send real notifications during tests
vi.mock('@/lib/push', () => ({
  sendPushToDeliberation: vi.fn().mockResolvedValue([]),
  sendPushToUser: vi.fn().mockResolvedValue([]),
  sendPushToCell: vi.fn().mockResolvedValue([]),
  notifications: {
    votingStarted: vi.fn().mockReturnValue({ title: 'test', body: 'test' }),
    cellReady: vi.fn().mockReturnValue({ title: 'test', body: 'test' }),
    spotExpiring: vi.fn().mockReturnValue({ title: 'test', body: 'test' }),
    newTier: vi.fn().mockReturnValue({ title: 'test', body: 'test' }),
    championDeclared: vi.fn().mockReturnValue({ title: 'test', body: 'test' }),
    accumulationStarted: vi.fn().mockReturnValue({ title: 'test', body: 'test' }),
    challengeRoundStarting: vi.fn().mockReturnValue({ title: 'test', body: 'test' }),
    votingExpiring: vi.fn().mockReturnValue({ title: 'test', body: 'test' }),
  },
}))

