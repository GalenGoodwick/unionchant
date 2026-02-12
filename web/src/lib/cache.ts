// Global in-memory cache for API responses
// Eliminates redundant DB queries across polling endpoints
// No external dependencies (no Redis needed)

type CacheEntry = {
  data: unknown
  ts: number
}

const store = new Map<string, CacheEntry>()

// Max entries before cleanup
const MAX_ENTRIES = 500

/**
 * Get cached value or execute fn and cache the result
 * @param key - Cache key (e.g., "status:deliberationId:userId")
 * @param ttlMs - Time-to-live in milliseconds
 * @param fn - Async function to execute on cache miss
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const entry = store.get(key)
  if (entry && Date.now() - entry.ts < ttlMs) {
    return entry.data as T
  }

  const data = await fn()
  store.set(key, { data, ts: Date.now() })

  // Lazy cleanup
  if (store.size > MAX_ENTRIES) {
    const now = Date.now()
    for (const [k, v] of store) {
      if (now - v.ts > ttlMs * 3) store.delete(k)
    }
  }

  return data
}

/**
 * Invalidate cache entries matching a prefix
 * @param prefix - Key prefix to match (e.g., "status:deliberationId")
 */
export function invalidate(prefix: string) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

/**
 * Invalidate a single exact key
 */
export function invalidateKey(key: string) {
  store.delete(key)
}
