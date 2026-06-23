// Field Engine v3 — Core Data Types

export const DEFAULT_GRID_SIZE = 512

/** The world state — three NxN textures */
export interface FieldWorld {
  size: number
  /** Texture 0: cell color (background layer) — GRID*GRID*4 RGBA */
  colorData: Float32Array
  /** Texture 1: shared data bus — GRID*GRID*4 RGBA
   *  All 4 channels available for field-to-field data exchange */
  stateData: Float32Array
  /** Texture 2: lightweight effects layer — GRID*GRID*4 RGBA
   *  Per-pixel independent — shape is defined by which pixels have data.
   *  R=effectType (0=none, 1+=active type), G=hue (0-1), B=brightness (0-1), A=intensity (fades toward 0)
   *  Step hooks write directly to any pixel for arbitrary shapes. */
  effectData: Float32Array
}

/** Lightweight projectile — managed by simulation, rendered via effectData */
export interface Projectile {
  x: number
  y: number
  vx: number
  vy: number
  effectType: number
  color: number
  size: number
  intensity: number
  age: number
  lifetime: number
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
  /** Enable per-effect feedback buffer (shader reads previous frame via u_feedbackTex) */
  feedback?: boolean
}

/** A field = position + color + shader stack. The shader output IS the field body. */
export interface Field {
  id: string
  name: string
  /** RGBA color — components in [0,1] */
  color: [number, number, number, number]
  /** Transform state for position/movement/rotation */
  transform: FieldTransform
  /** Composited shader effect stack (renders in order) */
  effects: FieldEffect[]
  /** Arbitrary key-value properties — step hooks can read/write these for per-field state */
  properties: Map<string, unknown>
  /** Optional parent field ID — child fields move/rotate with their parent */
  parentFieldId?: string
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
  | 'message_received' | 'message_sent'
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
  effects: Array<{
    id: string
    author: string
    glsl: string
    description: string
    blend: 'alpha' | 'additive' | 'multiply'
    order: number
    feedback?: boolean
  }>
  transform: FieldTransform
  memory: FieldMemoryEntry[]
  proximity: FieldProximity[]
  /** Sampled state texture data at field center (for agent data exchange) */
  stateAtCenter?: { r: number; g: number; b: number; a: number }
  /** Serialized properties map */
  properties?: Record<string, unknown>
  /** Parent field ID for hierarchy (child moves with parent) */
  parentFieldId?: string
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


/** Agent-defined interaction effect — GLSL shader rendered at field overlap pixels */
/** Behavioral hook triggered when an interaction is active */
export interface InteractionHook {
  type: 'memory' | 'modify_property' | 'apply_force' | 'webhook'
  /** Which field to affect: 'A', 'B', or 'both' (default 'both') */
  target?: 'A' | 'B' | 'both'
  /** Memory message (for type='memory') */
  message?: string
  /** Property key (for type='modify_property') */
  property?: string
  /** Property value (for type='modify_property') */
  value?: unknown
  /** Force components (for type='apply_force') */
  fx?: number
  fy?: number
  /** URL to call (for type='webhook') */
  url?: string
  /** Minimum seconds between triggers (default 1.0) */
  cooldown?: number
}

export interface InteractionEffect {
  id: string
  /** Which agent authored this effect */
  author: string
  /** Specific field A (null = any field) */
  fieldA: string | null
  /** Specific field B (null = any field) */
  fieldB: string | null
  /** GLSL code providing interactionEffect() function */
  glsl: string
  description: string
  /** How this effect composites */
  blend: 'alpha' | 'additive' | 'multiply'
  /** Pixel dilation beyond exact overlap zone (0 = overlap only) */
  spread: number
  /** Render order (lower = first) */
  order: number
  /** If true, clears underlying field pixels before rendering — interaction takes visual precedence */
  precedence?: boolean
  /** Behavioral hooks triggered each frame while this interaction is active */
  hooks?: InteractionHook[]
}

