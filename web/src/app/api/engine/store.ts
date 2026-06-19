// Server-side in-memory field state store
// Uses globalThis to share state across Next.js API route modules

import type { FieldSnapshot, FieldMemoryEntry, WorldParams } from '@/app/engine/types'

const MAX_MEMORY_ENTRIES = 100

interface EngineStore {
  fieldSnapshots: Map<string, FieldSnapshot>
  lastSyncTime: number
  worldParams: WorldParams
  /** Shared mutable key-value store — any field can read/write */
  worldData: Record<string, unknown>
}

const DEFAULT_WORLD_PARAMS: WorldParams = {
  gravity: 0,
  friction: 0,
  collisionForce: 0,
  boundaryMode: 'open',
  bounciness: 0.5,
}

// Singleton via globalThis — survives module re-instantiation across routes
const globalStore = globalThis as unknown as { __engineStore?: EngineStore }
if (!globalStore.__engineStore) {
  globalStore.__engineStore = {
    fieldSnapshots: new Map(),
    lastSyncTime: 0,
    worldParams: { ...DEFAULT_WORLD_PARAMS },
    worldData: {},
  }
}
// Patch: if store was created before worldParams/worldData existed, add them
if (!globalStore.__engineStore.worldParams) {
  globalStore.__engineStore.worldParams = { ...DEFAULT_WORLD_PARAMS }
}
if (!globalStore.__engineStore.worldData) {
  globalStore.__engineStore.worldData = {}
}
const store = globalStore.__engineStore

/** Full replace from client sync */
export function setFieldSnapshots(snapshots: FieldSnapshot[], worldParams?: WorldParams): void {
  store.fieldSnapshots.clear()
  for (const snap of snapshots) {
    store.fieldSnapshots.set(snap.id, snap)
  }
  if (worldParams) {
    store.worldParams = worldParams
  }
  store.lastSyncTime = Date.now()
}

/** Get world params */
export function getWorldParams(): WorldParams {
  return { ...store.worldParams }
}

/** Set world params server-side */
export function setWorldParamsStore(params: Partial<WorldParams>): void {
  Object.assign(store.worldParams, params)
}

/** Get a single field snapshot */
export function getFieldSnapshot(id: string): FieldSnapshot | undefined {
  return store.fieldSnapshots.get(id)
}

/** Get all field snapshots */
export function getAllFieldSnapshots(): FieldSnapshot[] {
  return Array.from(store.fieldSnapshots.values())
}

/** Get full engine state with metadata */
export function getEngineState(): {
  fields: FieldSnapshot[]
  fieldCount: number
  lastSync: number
  lastSyncAgo: number
  worldParams: WorldParams
  worldData: Record<string, unknown>
} {
  return {
    fields: getAllFieldSnapshots(),
    fieldCount: store.fieldSnapshots.size,
    lastSync: store.lastSyncTime,
    lastSyncAgo: store.lastSyncTime ? Date.now() - store.lastSyncTime : -1,
    worldParams: getWorldParams(),
    worldData: getWorldData(),
  }
}

/** Get shared world data */
export function getWorldData(): Record<string, unknown> {
  return { ...store.worldData }
}

/** Set shared world data (merges keys — set value to null to delete a key) */
export function setWorldData(data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (value === null) {
      delete store.worldData[key]
    } else {
      store.worldData[key] = value
    }
  }
}

/** Append a memory entry to a field (server-side injection between syncs) */
export function appendMemory(fieldId: string, entry: FieldMemoryEntry): void {
  const snap = store.fieldSnapshots.get(fieldId)
  if (!snap) return
  snap.memory.push(entry)
  if (snap.memory.length > MAX_MEMORY_ENTRIES) {
    snap.memory.splice(0, snap.memory.length - MAX_MEMORY_ENTRIES)
  }
}
