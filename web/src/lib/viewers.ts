// In-memory viewer presence tracker
// Records "who is viewing what" via status endpoint polls.
// A viewer is considered active if they polled within the last 30s.

const STALE_MS = 30_000 // 30 seconds — matches typical poll interval

// deliberationId -> Map<viewerKey, lastSeen>
const viewers = new Map<string, Map<string, number>>()

/**
 * Record that someone is viewing a deliberation.
 * viewerKey = userId or IP (something unique per viewer).
 */
export function recordView(deliberationId: string, viewerKey: string) {
  let map = viewers.get(deliberationId)
  if (!map) {
    map = new Map()
    viewers.set(deliberationId, map)
  }
  map.set(viewerKey, Date.now())
}

/**
 * Remove a viewer (called when they navigate away or close tab).
 */
export function removeView(deliberationId: string, viewerKey: string) {
  const map = viewers.get(deliberationId)
  if (map) {
    map.delete(viewerKey)
    if (map.size === 0) viewers.delete(deliberationId)
  }
}

/**
 * Get active viewer count for a deliberation.
 */
export function getViewerCount(deliberationId: string): number {
  const map = viewers.get(deliberationId)
  if (!map) return 0
  const cutoff = Date.now() - STALE_MS
  let count = 0
  for (const ts of map.values()) {
    if (ts >= cutoff) count++
  }
  return count
}

/**
 * Get active viewer counts for multiple deliberations at once.
 */
export function getViewerCounts(deliberationIds: string[]): Record<string, number> {
  const result: Record<string, number> = {}
  const cutoff = Date.now() - STALE_MS
  for (const id of deliberationIds) {
    const map = viewers.get(id)
    if (!map) { result[id] = 0; continue }
    let count = 0
    for (const ts of map.values()) {
      if (ts >= cutoff) count++
    }
    result[id] = count
  }
  return result
}

// Periodic cleanup — remove stale entries every 60s
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const cutoff = Date.now() - STALE_MS
    for (const [deliberationId, map] of viewers) {
      for (const [key, ts] of map) {
        if (ts < cutoff) map.delete(key)
      }
      if (map.size === 0) viewers.delete(deliberationId)
    }
  }, 60_000)
}
