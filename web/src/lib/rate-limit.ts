// In-memory sliding window rate limiter
// Stores: key -> array of timestamps
const windows = new Map<string, number[]>()

const DEFAULT_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  vote: { maxRequests: 10, windowMs: 60_000 },
  idea: { maxRequests: 5, windowMs: 60_000 },
  signup: { maxRequests: 5, windowMs: 3_600_000 },
  deliberation: { maxRequests: 3, windowMs: 3_600_000 },
  join: { maxRequests: 20, windowMs: 60_000 },
  enter: { maxRequests: 10, windowMs: 60_000 },
  follow: { maxRequests: 30, windowMs: 60_000 },
  comment: { maxRequests: 10, windowMs: 60_000 },
  upvote: { maxRequests: 30, windowMs: 60_000 },
  login: { maxRequests: 10, windowMs: 60_000 },
  collective_chat: { maxRequests: 8, windowMs: 60_000 },
}

function getConfig(endpoint: string): { maxRequests: number; windowMs: number; enabled: boolean } {
  const config = DEFAULT_LIMITS[endpoint]
  if (config) return { ...config, enabled: true }
  return { maxRequests: 10, windowMs: 60_000, enabled: true }
}

/**
 * Check rate limit for a given endpoint and key.
 * Returns true if rate limited (should block), false if allowed.
 */
export async function checkRateLimit(endpoint: string, key: string): Promise<boolean> {
  const config = await getConfig(endpoint)

  // If disabled in admin, allow all
  if (!config.enabled) return false

  const rateKey = `${endpoint}:${key}`
  const now = Date.now()

  // Get or create window
  let timestamps = windows.get(rateKey) || []

  // Remove expired timestamps
  timestamps = timestamps.filter(t => now - t < config.windowMs)

  // Check limit
  if (timestamps.length >= config.maxRequests) {
    windows.set(rateKey, timestamps)
    return true // Rate limited
  }

  // Record this request
  timestamps.push(now)
  windows.set(rateKey, timestamps)

  return false // Allowed
}

// Periodic cleanup of stale windows (run every 5 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    const maxWindow = 3_600_000 // 1 hour max
    for (const [key, timestamps] of windows) {
      const valid = timestamps.filter(t => now - t < maxWindow)
      if (valid.length === 0) {
        windows.delete(key)
      } else {
        windows.set(key, valid)
      }
    }
  }, 5 * 60_000)
}


// ── Chat CAPTCHA strike tracking ──
// Tracks how many times a user has been rate-limited in chat.
// Escalates CAPTCHA difficulty with each strike. Resets after 10 min idle.
const STRIKE_RESET_MS = 10 * 60_000 // 10 minutes
const MUTE_DURATION_MS = 5 * 60_000 // 5 minutes

const chatStrikes = new Map<string, { count: number; lastStrike: number; mutedUntil: number }>()

export function getChatStrike(userId: string): { strike: number; mutedUntil: number | null } {
  const entry = chatStrikes.get(userId)
  if (!entry) return { strike: 0, mutedUntil: null }

  const now = Date.now()

  // Check if muted
  if (entry.mutedUntil > now) {
    return { strike: entry.count, mutedUntil: entry.mutedUntil }
  }

  // Reset if idle long enough
  if (now - entry.lastStrike > STRIKE_RESET_MS) {
    chatStrikes.delete(userId)
    return { strike: 0, mutedUntil: null }
  }

  return { strike: entry.count, mutedUntil: null }
}

export function incrementChatStrike(userId: string): { strike: number; mutedUntil: number | null } {
  const now = Date.now()
  const entry = chatStrikes.get(userId)

  let count = 1
  if (entry && now - entry.lastStrike < STRIKE_RESET_MS) {
    count = entry.count + 1
  }

  const mutedUntil = count >= 4 ? now + MUTE_DURATION_MS : 0

  chatStrikes.set(userId, { count, lastStrike: now, mutedUntil })

  return { strike: count, mutedUntil: mutedUntil > 0 ? mutedUntil : null }
}

export function resetChatStrike(userId: string) {
  chatStrikes.delete(userId)
}

export function resetRateWindow(endpoint: string, key: string) {
  windows.delete(`${endpoint}:${key}`)
}
