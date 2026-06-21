// Field Engine v3 — Core Data Types

export const GRID_SIZE = 512

/** Shape definition — the field's body IS its shape */
export type FieldShape =
  | { type: 'circle'; radius: number }
  | { type: 'rect'; w: number; h: number }

/** The world state — two 512x512 textures */
export interface FieldWorld {
  size: typeof GRID_SIZE
  /** Texture 0: cell color (background layer) — 512*512*4 RGBA */
  colorData: Float32Array
  /** Texture 1: shared data bus — 512*512*4 RGBA
   *  All 4 channels available for field-to-field data exchange */
  stateData: Float32Array
}

/** Transform state for field movement/rotation/interaction */
export interface FieldTransform {
  /** Position in grid coordinates */
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

/** A single shader effect in a field's effect stack */
export interface FieldEffect {
  id: string
  /** Which agent/entity authored this effect */
  author: string
  glsl: string
  description: string
  /** How this effect composites with layers below */
  blend: 'alpha' | 'additive' | 'multiply'
  /** Render order within the stack (lower = first) */
  order: number
}

/** A field = shape + transform + shader stack. The shader output IS the field body. */
export interface Field {
  id: string
  name: string
  /** RGBA color — components in [0,1] */
  color: [number, number, number, number]
  /** Shape defining the field body — no cell painting needed */
  shape: FieldShape
  /** Transform state for position/movement/rotation */
  transform: FieldTransform
  /** Composited shader effect stack (renders in order) */
  effects: FieldEffect[]
  /** Arbitrary key-value properties — step hooks can read/write these for per-field state */
  properties: Map<string, unknown>
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

/** State for AI GLSL generation — UI-only loading tracker */
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
  /** Gravitational constant for n-body attraction between fields (0 = off, positive = attract, negative = repel) */
  gravitationalConstant: number
}

/** Memory entry types for field agent history */
export type FieldMemoryType =
  | 'created' | 'effect_added' | 'effect_removed'
  | 'message_received' | 'message_sent' | 'shape_changed'
  | 'collision' | 'proximity_changed' | 'world_params_changed'
  | 'force_applied'

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
  /** Shape defining the field body */
  shape: FieldShape
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null
  effects: Array<{
    id: string
    author: string
    glsl: string
    description: string
    blend: 'alpha' | 'additive' | 'multiply'
    order: number
  }>
  transform: FieldTransform
  memory: FieldMemoryEntry[]
  proximity: FieldProximity[]
  /** Sampled state texture data at field center (for agent data exchange) */
  stateAtCenter?: { r: number; g: number; b: number; a: number }
  /** Serialized properties map */
  properties?: Record<string, unknown>
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

/** Agent-defined interaction rule — executed each physics tick */
export interface InteractionRule {
  id: string
  /** Which field defined this rule */
  definedBy: string
  /** When to trigger */
  trigger: 'overlap' | 'proximity' | 'always'
  /** For proximity trigger: max distance in grid cells */
  triggerDistance?: number
  /** Specific field (null = any) */
  fieldA?: string
  /** Specific field (null = any) */
  fieldB?: string
  /** What happens when triggered */
  effect: 'transfer_property' | 'apply_force' | 'modify_property' | 'exchange_glsl' | 'send_event' | 'damage' | 'destroy_field'
  /** Effect-specific parameters */
  effectParams: Record<string, unknown>
  /** Human-readable description */
  description?: string
}

/** Agent-defined custom command — macro of existing commands */
export interface CustomCommand {
  name: string
  definedBy: string
  description: string
  /** Sequence of existing commands to execute */
  macro: Array<Record<string, unknown>>
}


/** A persistent visual link between two fields -- rendered as an energy beam */
export interface FieldLink {
  id: string
  /** Source field */
  fromFieldId: string
  /** Target field */
  toFieldId: string
  /** RGBA color of the beam */
  color: [number, number, number, number]
  /** Width of the beam in grid units */
  width: number
  /** Visual style */
  style: 'beam' | 'lightning' | 'pulse' | 'helix'
  /** Intensity (0-1) */
  intensity: number
  /** Whether this link is bidirectional */
  bidirectional: boolean
  /** Who created this link */
  author: string
}
