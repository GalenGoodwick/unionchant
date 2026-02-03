// Shared podium cache for feed — invalidated on create/update/delete
let podiumCache: { data: any[]; ts: number } | null = null
const PODIUM_TTL = 60_000

export function getCachedPodiums(): { data: any[]; ts: number } | null {
  if (podiumCache && Date.now() - podiumCache.ts < PODIUM_TTL) {
    return podiumCache
  }
  return null
}

export function setCachedPodiums(data: any[]) {
  podiumCache = { data, ts: Date.now() }
}

export function invalidatePodiumCache() {
  podiumCache = null
}
