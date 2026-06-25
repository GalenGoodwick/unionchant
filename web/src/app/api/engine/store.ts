// Server-side in-memory field state store
// Uses globalThis to share state across Next.js API route modules
// Persists to disk so state survives server restarts

import type { FieldSnapshot, FieldMemoryEntry, WorldParams, InteractionRule, InteractionEffect, CustomCommand, SceneSnapshot } from '@/app/engine/types'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const MAX_MEMORY_ENTRIES = 100
const PERSIST_PATH = join(process.cwd(), '.engine-store.json')

/** Serialized step hook (no fn — just source code) */
export interface StepHookSnapshot {
  id: string
  author: string
  description: string
  code: string
}

/** Registered visual type for the superimposed uber-shader */
export interface VisualTypeDef {
  name: string
  wgsl: string
  timestamp: number
}

/** Registered uber-shader interaction definition */
export interface InteractionDef {
  name: string
  wgsl: string
  fieldA: string  // field ID
  fieldB: string  // field ID
  timestamp: number
}

/** Registered GLSL mod (reusable shader utility code) */
export interface GlslMod {
  id: string
  author: string
  description: string
  code: string       // Raw GLSL function/utility code
  timestamp: number
}

/** Per-field rendered pixel sample (16x16 downsampled RGBA) */
export interface RenderedSample {
  width: number
  height: number
  pixels: number[]  // flat RGBA, row-major
}

interface EngineStore {
  fieldSnapshots: Map<string, FieldSnapshot>
  lastSyncTime: number
  worldParams: WorldParams
  /** Shared mutable key-value store — any field can read/write */
  worldData: Record<string, unknown>
  /** Agent-defined interaction rules (persisted server-side) */
  interactionRules: InteractionRule[]
  /** Agent-defined interaction effects — GLSL shaders for overlap rendering */
  interactionEffects: InteractionEffect[]
  /** Agent-defined custom commands (persisted server-side) */
  customCommands: Map<string, CustomCommand>
  /** Active step hooks (synced from client) */
  stepHooks: StepHookSnapshot[]
  /** Per-field rendered pixel samples (from client readback, NOT persisted to disk) */
  renderedSamples: Record<string, RenderedSample>
  /** Registered GLSL mods — reusable shader utilities injected into all new compilations */
  glslMods: Map<string, GlslMod>
  /** Registered visual types for superimposed uber-shader (persisted) */
  visualTypes: Map<string, VisualTypeDef>
  /** Registered uber-shader interaction definitions (persisted) */
  interactionDefs: Map<string, InteractionDef>
  /** Saved scenes — complete engine state snapshots */
  scenes: Map<string, SceneSnapshot>
}

const DEFAULT_WORLD_PARAMS: WorldParams = {
  gravity: 0,
  friction: 0,
  collisionForce: 0,
  boundaryMode: 'open',
  bounciness: 0.5,
  gravitationalConstant: 0,
}

// --- Disk persistence ---

interface SerializedStore {
  fieldSnapshots: Record<string, FieldSnapshot>
  worldParams: WorldParams
  worldData: Record<string, unknown>
  interactionRules: InteractionRule[]
  interactionEffects?: InteractionEffect[]
  customCommands: Record<string, CustomCommand>
  stepHooks?: StepHookSnapshot[]
  glslMods?: Record<string, GlslMod>
  visualTypes?: Record<string, VisualTypeDef>
  interactionDefs?: Record<string, InteractionDef>
  scenes?: Record<string, SceneSnapshot>
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
    const glslMods = new Map<string, GlslMod>()
    if (data.glslMods) {
      for (const [id, mod] of Object.entries(data.glslMods)) {
        glslMods.set(id, mod)
      }
    }
    const visualTypes = new Map<string, VisualTypeDef>()
    if (data.visualTypes) {
      for (const [name, vt] of Object.entries(data.visualTypes)) {
        visualTypes.set(name, vt)
      }
    }
    const interactionDefs = new Map<string, InteractionDef>()
    if (data.interactionDefs) {
      for (const [name, def] of Object.entries(data.interactionDefs)) {
        interactionDefs.set(name, def)
      }
    }
    const scenes = new Map<string, SceneSnapshot>()
    if (data.scenes) {
      for (const [name, scene] of Object.entries(data.scenes)) {
        scenes.set(name, scene)
      }
    }
    console.log(`[Engine Store] Restored from disk: ${fieldSnapshots.size} fields, ${data.interactionRules?.length || 0} rules, ${data.interactionEffects?.length || 0} ix effects, ${customCommands.size} commands, ${glslMods.size} mods, ${visualTypes.size} visual types, ${interactionDefs.size} interaction defs, ${scenes.size} scenes, ${Object.keys(data.worldData || {}).length} worldData keys`)
    return {
      fieldSnapshots,
      lastSyncTime: data.lastSyncTime || 0,
      worldParams: data.worldParams || { ...DEFAULT_WORLD_PARAMS },
      worldData: data.worldData || {},
      interactionRules: data.interactionRules || [],
      interactionEffects: data.interactionEffects || [],
      customCommands,
      stepHooks: data.stepHooks || [],
      renderedSamples: {},
      glslMods,
      visualTypes,
      interactionDefs,
      scenes,
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
        interactionEffects: store.interactionEffects,
        customCommands: Object.fromEntries(store.customCommands),
        stepHooks: store.stepHooks,
        glslMods: Object.fromEntries(store.glslMods),
        visualTypes: Object.fromEntries(store.visualTypes),
        interactionDefs: Object.fromEntries(store.interactionDefs),
        scenes: Object.fromEntries(store.scenes),
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
      interactionEffects: [],
      customCommands: new Map(),
      stepHooks: [],
      renderedSamples: {},
      glslMods: new Map(),
      visualTypes: new Map(),
      interactionDefs: new Map(),
      scenes: new Map(),
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
if (!store.interactionEffects) {
  store.interactionEffects = []
}
if (!store.customCommands) {
  store.customCommands = new Map()
}
if (!store.stepHooks) {
  store.stepHooks = []
}
if (!store.renderedSamples) {
  store.renderedSamples = {}
}
if (!store.glslMods) {
  store.glslMods = new Map()
}
if (!store.visualTypes) {
  store.visualTypes = new Map()
}
if (!store.interactionDefs) {
  store.interactionDefs = new Map()
}
if (!store.scenes) {
  store.scenes = new Map()
}

/** Full replace from client sync */
export function setFieldSnapshots(snapshots: FieldSnapshot[], worldParams?: WorldParams, stepHooks?: StepHookSnapshot[], worldData?: Record<string, unknown>, renderedSamples?: Record<string, RenderedSample>, interactionEffects?: InteractionEffect[]): void {
  store.fieldSnapshots.clear()
  for (const snap of snapshots) {
    store.fieldSnapshots.set(snap.id, snap)
  }
  if (worldParams) {
    store.worldParams = worldParams
  }
  if (stepHooks) {
    store.stepHooks = stepHooks
  }
  if (worldData) {
    // Merge client worldData into server store (client-side hook changes propagate)
    for (const [key, value] of Object.entries(worldData)) {
      if (value === null) {
        delete store.worldData[key]
      } else {
        store.worldData[key] = value
      }
    }
  }
  if (renderedSamples) {
    store.renderedSamples = renderedSamples
  }
  if (interactionEffects) {
    store.interactionEffects = interactionEffects
  }
  store.lastSyncTime = Date.now()
  schedulePersist()
}

/** Get rendered samples */
export function getRenderedSamples(): Record<string, RenderedSample> {
  return store.renderedSamples
}

/** Get rendered sample for a specific field */
export function getRenderedSample(fieldId: string): RenderedSample | undefined {
  return store.renderedSamples[fieldId]
}

/** Set step hooks from client sync */
export function setStepHooks(hooks: StepHookSnapshot[]): void {
  store.stepHooks = hooks
  schedulePersist()
}

/** Get step hooks */
export function getStepHooks(): StepHookSnapshot[] {
  return [...store.stepHooks]
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

/** Add a GLSL mod (server-side copy) */
export function addGlslMod(mod: GlslMod): void {
  store.glslMods.set(mod.id, mod)
  schedulePersist()
}

/** Remove a GLSL mod */
export function removeGlslMod(modId: string): boolean {
  const existed = store.glslMods.delete(modId)
  if (existed) schedulePersist()
  return existed
}

/** Get all GLSL mods */
export function getAllGlslMods(): GlslMod[] {
  return Array.from(store.glslMods.values())
}

/** Add/update a visual type (server-side persistence) */
export function addVisualType(name: string, wgsl: string): void {
  store.visualTypes.set(name, { name, wgsl, timestamp: Date.now() })
  schedulePersist()
}

/** Remove a visual type */
export function removeVisualType(name: string): boolean {
  const existed = store.visualTypes.delete(name)
  if (existed) schedulePersist()
  return existed
}

/** Get all visual types */
export function getAllVisualTypes(): VisualTypeDef[] {
  return Array.from(store.visualTypes.values())
}

/** Add/update an interaction definition (server-side persistence) */
export function addInteractionDef(name: string, wgsl: string, fieldA: string, fieldB: string): void {
  store.interactionDefs.set(name, { name, wgsl, fieldA, fieldB, timestamp: Date.now() })
  schedulePersist()
}

/** Remove an interaction definition */
export function removeInteractionDef(name: string): boolean {
  const existed = store.interactionDefs.delete(name)
  if (existed) schedulePersist()
  return existed
}

/** Get all interaction definitions */
export function getAllInteractionDefs(): InteractionDef[] {
  return Array.from(store.interactionDefs.values())
}

export function getEngineState(): {
  fields: FieldSnapshot[]
  fieldCount: number
  lastSync: number
  lastSyncAgo: number
  worldParams: WorldParams
  worldData: Record<string, unknown>
  interactionRules: InteractionRule[]
  interactionEffects: InteractionEffect[]
  customCommands: CustomCommand[]
  stepHooks: StepHookSnapshot[]
  glslMods: GlslMod[]
  visualTypes: VisualTypeDef[]
  interactionDefs: InteractionDef[]
} {
  return {
    fields: getAllFieldSnapshots(),
    fieldCount: store.fieldSnapshots.size,
    lastSync: store.lastSyncTime,
    lastSyncAgo: store.lastSyncTime ? Date.now() - store.lastSyncTime : -1,
    worldParams: getWorldParams(),
    worldData: getWorldData(),
    interactionRules: getInteractionRules(),
    interactionEffects: store.interactionEffects,
    customCommands: getAllCustomCommands(),
    stepHooks: getStepHooks(),
    glslMods: getAllGlslMods(),
    visualTypes: getAllVisualTypes(),
    interactionDefs: getAllInteractionDefs(),
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
  store.stepHooks = []
  store.glslMods.clear()
  store.visualTypes.clear()
  store.interactionDefs.clear()
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

// ─── Scene Persistence ───

/** Save a scene snapshot */
export function saveScene(name: string, scene: SceneSnapshot): void {
  store.scenes.set(name, scene)
  schedulePersist()
}

/** Load a scene snapshot by name */
export function loadScene(name: string): SceneSnapshot | undefined {
  return store.scenes.get(name)
}

/** List all saved scene names */
export function listScenes(): string[] {
  return Array.from(store.scenes.keys())
}

/** Delete a saved scene */
export function deleteScene(name: string): boolean {
  const existed = store.scenes.delete(name)
  if (existed) schedulePersist()
  return existed
}
