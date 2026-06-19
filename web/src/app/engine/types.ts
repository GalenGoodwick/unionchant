// Field Engine — Core Data Types

export const GRID_SIZE = 512

/** The world state — two 512x512 textures */
export interface FieldWorld {
  size: typeof GRID_SIZE
  /** Texture 0: cell color (what you see) — 512*512*4 RGBA */
  colorData: Float32Array
  /** Texture 1: cell state (what the simulation reads/writes)
   *  R=fieldWeight, G=fieldType, B=velocity, A=flags */
  stateData: Float32Array
}

/** Transform state for field movement/rotation/interaction */
export interface FieldTransform {
  /** Position offset from original location (grid units) */
  x: number
  y: number
  /** Rotation in radians */
  rotation: number
  /** Scale factor (1.0 = original size) */
  scale: number
  /** Velocity for physics-driven movement (grid units/sec) */
  vx: number
  vy: number
  /** Angular velocity (radians/sec) */
  vr: number
}

/** A field is a region of influence painted onto the grid */
export interface Field {
  id: string
  name: string
  /** RGBA color — components in [0,1] */
  color: [number, number, number, number]
  /** Which cells belong to this field (sparse set of grid indices: y * 512 + x) */
  cells: Set<number>
  /** User-defined expandable properties */
  properties: Map<string, FieldProperty>
  /** Transform state for movement/rotation */
  transform: FieldTransform
  /** Per-field GLSL effect code (null = no active effect) */
  glsl: string | null
  /** Human-readable description of the active effect */
  effectDescription: string | null
}

/** User-defined property on a field */
export interface FieldProperty {
  name: string
  value: number
  min?: number
  max?: number
  /** If set, this property is packed into the state texture channel.
   *  Max 4 GPU-visible properties per field (RGBA channels).
   *  GPU-visible = usable in shaders; CPU-only = game logic / UI only. */
  gpuSlot?: 0 | 1 | 2 | 3
}

/** Drawing tool state */
export interface BrushState {
  tool: 'select' | 'brush' | 'line' | 'circle' | 'rect' | 'freeform'
  size: number
  activeFieldId: string | null
}

/** Info about a single cell (for hover inspector) */
export interface CellInfo {
  x: number
  y: number
  index: number
  color: [number, number, number, number]
  state: [number, number, number, number]
  fieldIds: string[]
}

/** Selection state for click-to-select */
export interface SelectionState {
  selectedFieldId: string | null
  selectionMask: Uint8Array
}

/** State for AI GLSL generation — UI-only loading tracker.
 *  Actual GLSL lives on the Field object itself. */
export interface GenerationState {
  loading: boolean
  error: string | null
  targetFieldId: string | null
}

/** Camera state */
export interface Camera {
  x: number
  y: number
  zoom: number
}

/** World-level physics parameters — global forces that affect all fields */
export interface WorldParams {
  /** Downward force applied to all fields (grid units/sec^2). 0 = no gravity. */
  gravity: number
  /** Velocity damping per second (0 = no friction, 1 = full stop each second) */
  friction: number
  /** Force between overlapping fields: positive = repel, negative = attract (grid units/sec^2) */
  collisionForce: number
  /** Whether grid edges are solid walls (fields bounce) or open (fields wrap/clip) */
  boundaryMode: 'solid' | 'wrap' | 'open'
  /** Coefficient of restitution for wall bounces (0 = absorb, 1 = perfect bounce) */
  bounciness: number
}

/** Memory entry types for field agent history */
export type FieldMemoryType =
  | 'created' | 'effect_set' | 'effect_cleared'
  | 'message_received' | 'message_sent' | 'cells_changed'
  | 'collision' | 'proximity_changed' | 'world_params_changed'
  | 'force_applied' | 'property_changed'

/** A single memory entry in a field's history log */
export interface FieldMemoryEntry {
  timestamp: string          // ISO
  type: FieldMemoryType
  content: string            // human-readable
  sourceFieldId: string | null
  data?: Record<string, unknown>
}

/** Proximity info about a neighboring field */
export interface FieldProximity {
  fieldId: string
  fieldName: string
  distance: number             // grid cells between bounds edges (-N = overlap by N)
  direction: [number, number]  // normalized (dx, dy) toward the other field's center
  overlapping: boolean
}

/** Serialized snapshot of a field for server-side state store */
export interface FieldSnapshot {
  id: string
  name: string
  color: [number, number, number, number]
  cellCount: number
  /** Raw cell indices for state persistence across refreshes */
  cells?: number[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null
  glsl: string | null
  effectDescription: string | null
  transform: FieldTransform
  properties: Record<string, { name: string; value: number; min?: number; max?: number }>
  memory: FieldMemoryEntry[]
  proximity: FieldProximity[]
}

/** Full world state snapshot (sent via bridge to agents) */
export interface WorldSnapshot {
  worldParams: WorldParams
}

/** A message sent between fields */
export interface FieldMessage {
  fromFieldId: string
  toFieldId: string
  content: string
  data?: Record<string, unknown>
}
