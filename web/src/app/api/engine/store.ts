// Server-side in-memory field state store
// Uses globalThis to share state across Next.js API route modules
// Persists to disk so state survives server restarts

import type { FieldSnapshot, FieldMemoryEntry, WorldParams, InteractionRule, CustomCommand } from '@/app/engine/types'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const MAX_MEMORY_ENTRIES = 100
const PERSIST_PATH = join(process.cwd(), '.engine-store.json')

interface EngineStore {
  fieldSnapshots: Map<string, FieldSnapshot>
  lastSyncTime: number
  worldParams: WorldParams
  /** Shared mutable key-value store — any field can read/write */
  worldData: Record<string, unknown>
  /** Agent-defined interaction rules (persisted server-side) */
  interactionRules: InteractionRule[]
  /** Agent-defined custom commands (persisted server-side) */
  customCommands: Map<string, CustomCommand>
}

const DEFAULT_WORLD_PARAMS: WorldParams = {
  gravity: 0,
  friction: 0,
  collisionForce: 0,
  boundaryMode: 'open',
  bounciness: 0.5,
}

// --- Disk persistence ---

interface SerializedStore {
  fieldSnapshots: Record<string, FieldSnapshot>
  worldParams: WorldParams
  worldData: Record<string, unknown>
  interactionRules: InteractionRule[]
  customCommands: Record<string, CustomCommand>
  lastSyncTime: number
}

function loadFromDisk(): Partial<EngineStore> | null {
  try {
    const raw = readFileSync(PERSIST_PATH, 'utf-8')
    const data: SerializedStore = JSON.parse(raw)
    const fieldSnapshots = new Map<string, FieldSnapshot>()
    if (data.fieldSnapshots) {
      for (const [id, snap] of Object.entries(data.fieldSnapshots)) {
        fieldSnapshots.set(id, snap)
      }
    }
    const customCommands = new Map<string, CustomCommand>()
    if (data.customCommands) {
      for (const [name, cmd] of Object.entries(data.customCommands)) {
        customCommands.set(name, cmd)
      }
    }
    console.log(`[Engine Store] Restored from disk: ${fieldSnapshots.size} fields, ${data.interactionRules?.length || 0} rules, ${customCommands.size} commands, ${Object.keys(data.worldData || {}).length} worldData keys`)
    return {
      fieldSnapshots,
      lastSyncTime: data.lastSyncTime || 0,
      worldParams: data.worldParams || { ...DEFAULT_WORLD_PARAMS },
      worldData: data.worldData || {},
      interactionRules: data.interactionRules || [],
      customCommands,
    }
  } catch {
    // No file or invalid — start fresh
    return null
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

function schedulePersist(): void {
  if (persistTimer) return // already scheduled
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      const data: SerializedStore = {
        fieldSnapshots: Object.fromEntries(store.fieldSnapshots),
        worldParams: store.worldParams,
        worldData: store.worldData,
        interactionRules: store.interactionRules,
        customCommands: Object.fromEntries(store.customCommands),
        lastSyncTime: store.lastSyncTime,
      }
      writeFileSync(PERSIST_PATH, JSON.stringify(data), 'utf-8')
    } catch (err) {
      console.error('[Engine Store] Persist error:', err)
    }
  }, 2000) // debounce 2 seconds
}

// --- Singleton initialization ---

const globalStore = globalThis as unknown as { __engineStore: EngineStore }
if (!globalStore.__engineStore) {
  const restored = loadFromDisk()
  if (restored) {
    globalStore.__engineStore = restored as EngineStore
  } else {
    globalStore.__engineStore = {
      fieldSnapshots: new Map(),
      lastSyncTime: 0,
      worldParams: { ...DEFAULT_WORLD_PARAMS },
      worldData: {},
      interactionRules: [],
      customCommands: new Map(),
    }
  }
}
const store = globalStore.__engineStore
// Patch: if store was created before newer fields existed, add them
if (!store.worldParams) {
  store.worldParams = { ...DEFAULT_WORLD_PARAMS }
}
if (!store.worldData) {
  store.worldData = {}
}
if (!store.interactionRules) {
  store.interactionRules = []
}
if (!store.customCommands) {
  store.customCommands = new Map()
}

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
  schedulePersist()
}

/** Get world params */
export function getWorldParams(): WorldParams {
  return { ...store.worldParams }
}

/** Set world params server-side */
export function setWorldParamsStore(params: Partial<WorldParams>): void {
  Object.assign(store.worldParams, params)
  schedulePersist()
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
  interactionRules: InteractionRule[]
  customCommands: CustomCommand[]
} {
  return {
    fields: getAllFieldSnapshots(),
    fieldCount: store.fieldSnapshots.size,
    lastSync: store.lastSyncTime,
    lastSyncAgo: store.lastSyncTime ? Date.now() - store.lastSyncTime : -1,
    worldParams: getWorldParams(),
    worldData: getWorldData(),
    interactionRules: getInteractionRules(),
    customCommands: getAllCustomCommands(),
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
  schedulePersist()
}

/** Add an interaction rule (server-side copy) */
export function addInteractionRuleStore(rule: InteractionRule): string {
  const id = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  store.interactionRules.push({ ...rule, id })
  schedulePersist()
  return id
}

/** Remove an interaction rule */
export function removeInteractionRuleStore(ruleId: string): void {
  store.interactionRules = store.interactionRules.filter(r => r.id !== ruleId)
  schedulePersist()
}

/** Get all interaction rules */
export function getInteractionRules(): InteractionRule[] {
  return [...store.interactionRules]
}

/** Add a custom command (server-side copy) */
export function addCustomCommandStore(cmd: CustomCommand): void {
  store.customCommands.set(cmd.name, cmd)
  schedulePersist()
}

/** Get a custom command */
export function getCustomCommandStore(name: string): CustomCommand | undefined {
  return store.customCommands.get(name)
}

/** Get all custom commands */
export function getAllCustomCommands(): CustomCommand[] {
  return Array.from(store.customCommands.values())
}

/** Reset entire store — nuclear option */
export function resetStore(): void {
  store.fieldSnapshots.clear()
  store.worldParams = { ...DEFAULT_WORLD_PARAMS }
  store.worldData = {}
  store.interactionRules = []
  store.customCommands.clear()
  store.lastSyncTime = 0
  schedulePersist()
}

/** Append a memory entry to a field (server-side injection between syncs) */
export function appendMemory(fieldId: string, entry: FieldMemoryEntry): void {
  const snap = store.fieldSnapshots.get(fieldId)
  if (!snap) return
  snap.memory.push(entry)
  if (snap.memory.length > MAX_MEMORY_ENTRIES) {
    snap.memory.splice(0, snap.memory.length - MAX_MEMORY_ENTRIES)
  }
  schedulePersist()
}
