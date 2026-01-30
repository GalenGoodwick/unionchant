import dotenv from 'dotenv'
import path from 'path'

// Load .env.test BEFORE any other imports that might use DATABASE_URL
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

// Safety check: warn if DATABASE_URL doesn't look like a test database
const dbUrl = process.env.DATABASE_URL || ''
const looksLikeTestDb = dbUrl.includes('test') || dbUrl.includes('localhost') || dbUrl.includes('vitest')
if (!looksLikeTestDb) {
  console.warn(
    '\x1b[33m⚠ WARNING: DATABASE_URL may not be a test database.\n' +
    '  Ensure you are using a Neon test branch, not production!\n' +
    `  Current URL host: ${dbUrl.split('@')[1]?.split('/')[0] || 'unknown'}\x1b[0m`
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

// Mock meta-deliberation — don't spawn real deliberations
vi.mock('@/lib/meta-deliberation', () => ({
  handleMetaChampion: vi.fn().mockResolvedValue(null),
}))
