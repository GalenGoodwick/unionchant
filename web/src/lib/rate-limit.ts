import { prisma } from './prisma'

// In-memory sliding window rate limiter
// Stores: key -> array of timestamps
const windows = new Map<string, number[]>()

// Default limits (used when no DB config found)
const DEFAULT_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  vote: { maxRequests: 10, windowMs: 60_000 },
  idea: { maxRequests: 5, windowMs: 60_000 },
  signup: { maxRequests: 5, windowMs: 3_600_000 },
  deliberation: { maxRequests: 3, windowMs: 3_600_000 },
}

// Cache DB config to avoid querying on every request
let configCache: Map<string, { maxRequests: number; windowMs: number; enabled: boolean }> | null = null
let configCacheTime = 0
const CONFIG_CACHE_TTL = 60_000 // Refresh config every 60s

async function getConfig(endpoint: string): Promise<{ maxRequests: number; windowMs: number; enabled: boolean }> {
  const now = Date.now()

  // Refresh cache if stale
  if (!configCache || now - configCacheTime > CONFIG_CACHE_TTL) {
    try {
      const configs = await prisma.rateLimitConfig.findMany()
      configCache = new Map()
      for (const c of configs) {
        configCache.set(c.endpoint, { maxRequests: c.maxRequests, windowMs: c.windowMs, enabled: c.enabled })
      }
      configCacheTime = now
    } catch {
      // If DB query fails, use defaults
      configCache = new Map()
      configCacheTime = now
    }
  }

  const dbConfig = configCache.get(endpoint)
  if (dbConfig) return dbConfig

  const defaultConfig = DEFAULT_LIMITS[endpoint]
  if (defaultConfig) return { ...defaultConfig, enabled: true }

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

/**
 * Invalidate the config cache (called after admin updates)
 */
export function invalidateRateLimitCache() {
  configCache = null
  configCacheTime = 0
}
