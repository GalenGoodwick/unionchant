// Field Engine v3 — Simulation (CPU-side, shape-based)

import { GRID_SIZE, type FieldWorld, type Field, type FieldShape, type FieldTransform, type FieldEffect, type FieldMemoryEntry, type FieldSnapshot, type FieldProximity, type WorldParams, type InteractionRule, type CustomCommand } from './types'

export class FieldSimulation {
  world: FieldWorld
  fields: Map<string, Field>
  running: boolean = false
  private fieldMemory: Map<string, FieldMemoryEntry[]> = new Map()
  private collisionState: Map<string, Set<string>> = new Map()
  /** Agent-defined interaction rules — executed each physics tick */
  interactionRules: InteractionRule[] = []
  /** Agent-defined custom commands — macros of existing commands */
  customCommands: Map<string, CustomCommand> = new Map()
  /** Agent-defined step hooks — JavaScript functions that run every simulation tick */
  stepHooks: Map<string, { author: string; description: string; code: string; fn: (sim: FieldSimulation, dt: number) => void }> = new Map()
  /** Cached shape masks — invalidated when field transforms change */
  private maskCache: Map<string, { mask: Uint8Array; x: number; y: number; shape: string }> = new Map()
  /** Spawn queue — fields created by step hooks are queued and processed after all hooks run */
  spawnQueue: Array<{ name: string; color: [number, number, number, number]; shape: FieldShape; x: number; y: number }> = []
  /** Shared world data — key-value store accessible from step hooks */
  worldData: Record<string, unknown> = {}
  static readonly MAX_MEMORY = 100

  /** World-level physics parameters */
  worldParams: WorldParams = {
    gravity: 0,
    friction: 0,
    collisionForce: 0,
    boundaryMode: 'open',
    bounciness: 0.5,
  }

  constructor() {
    const totalCells = GRID_SIZE * GRID_SIZE * 4
    this.world = {
      size: GRID_SIZE,
      colorData: new Float32Array(totalCells),
      stateData: new Float32Array(totalCells),
    }
    this.fields = new Map()
  }

  /** Restore fields from server-stored snapshots (called on mount) */
  restoreFromSnapshots(snapshots: FieldSnapshot[]): void {
    for (const snap of snapshots) {
      const shape = snap.shape || { type: 'circle' as const, radius: 10 }
      this.createField(snap.id, snap.name, snap.color, shape)
      const field = this.fields.get(snap.id)
      if (!field) continue
      // Restore transform
      Object.assign(field.transform, snap.transform)
      // Restore effects
      if (snap.effects?.length) {
        field.effects = snap.effects.map(e => ({ ...e }))
      }
      // Restore properties
      if (snap.properties) {
        for (const [k, v] of Object.entries(snap.properties)) {
          field.properties.set(k, v)
        }
      }
      // Restore memory
      if (snap.memory?.length) {
        this.fieldMemory.set(snap.id, [...snap.memory])
      }
    }
  }

  /** Update world physics parameters */
  setWorldParams(params: Partial<WorldParams>): void {
    Object.assign(this.worldParams, params)
  }

  /** Apply an instantaneous force (impulse) to a field's velocity */
  applyForce(fieldId: string, fx: number, fy: number): void {
    const field = this.fields.get(fieldId)
    if (!field) return
    field.transform.vx += fx
    field.transform.vy += fy
    this.addMemory(fieldId, {
      timestamp: new Date().toISOString(),
      type: 'force_applied',
      content: `Force applied: (${fx.toFixed(1)}, ${fy.toFixed(1)}). Velocity now (${field.transform.vx.toFixed(1)}, ${field.transform.vy.toFixed(1)})`,
      sourceFieldId: null,
      data: { fx, fy, vx: field.transform.vx, vy: field.transform.vy },
    })
  }

  static defaultTransform(): FieldTransform {
    return { x: 0, y: 0, rotation: 0, scale: 1, vx: 0, vy: 0, vr: 0 }
  }

  /** Create a new field with a shape — immediately visible via default shader */
  createField(id: string, name: string, color: [number, number, number, number], shape: FieldShape = { type: 'circle', radius: 10 }): Field {
    const field: Field = {
      id,
      name,
      color,
      shape,
      transform: FieldSimulation.defaultTransform(),
      effects: [],
      properties: new Map(),
    }
    this.fields.set(id, field)
    this.addMemory(id, {
      timestamp: new Date().toISOString(),
      type: 'created',
      content: `Field "${name}" created (${shape.type === 'circle' ? `circle r=${shape.radius}` : `rect ${shape.w}x${shape.h}`})`,
      sourceFieldId: null,
    })
    return field
  }

  /** Remove a field */
  removeField(id: string): void {
    this.fields.delete(id)
    this.clearMemory(id)
  }

  /** Queue a field to be spawned after step hooks finish. Step hooks call this instead of createField directly. */
  queueSpawn(name: string, color: [number, number, number, number], shape: FieldShape, x: number, y: number): void {
    if (this.spawnQueue.length >= 10) return // Limit spawns per tick
    this.spawnQueue.push({ name, color, shape, x, y })
  }

  /** Process the spawn queue — called by the engine after step hooks run */
  processSpawnQueue(): Array<{ id: string; field: Field }> {
    const spawned: Array<{ id: string; field: Field }> = []
    for (const req of this.spawnQueue) {
      const id = 'spawn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
      const field = this.createField(id, req.name, req.color, req.shape)
      field.transform.x = req.x
      field.transform.y = req.y
      spawned.push({ id, field })
    }
    this.spawnQueue = []
    return spawned
  }

  /** Update a field's shape */
  setShape(fieldId: string, shape: FieldShape): void {
    const field = this.fields.get(fieldId)
    if (!field) return
    field.shape = shape
    this.addMemory(fieldId, {
      timestamp: new Date().toISOString(),
      type: 'shape_changed',
      content: `Shape changed to ${shape.type === 'circle' ? `circle r=${shape.radius}` : `rect ${shape.w}x${shape.h}`}`,
      sourceFieldId: null,
    })
  }

  /** Test if a point is inside a field's shape (in grid coordinates) */
  pointInShape(x: number, y: number, field: Field): boolean {
    if (!field.shape) return false
    const t = field.transform
    if (field.shape.type === 'circle') {
      const dx = x - t.x
      const dy = y - t.y
      return dx * dx + dy * dy <= field.shape.radius * field.shape.radius
    } else {
      // rect: origin is top-left corner of rect
      return x >= t.x && x < t.x + field.shape.w && y >= t.y && y < t.y + field.shape.h
    }
  }

  /** Clear everything */
  clearAll(): void {
    this.world.colorData.fill(0)
    this.world.stateData.fill(0)
  }

  /** Update field transforms based on velocities */
  stepTransforms(dt: number): void {
    for (const field of this.fields.values()) {
      const t = field.transform
      if (t.vx !== 0 || t.vy !== 0 || t.vr !== 0) {
        t.x += t.vx * dt
        t.y += t.vy * dt
        t.rotation += t.vr * dt
      }
    }
  }

  /** The game loop step — called every frame when running */
  step(dt: number): void {
    if (!this.running) return

    const wp = this.worldParams

    // Apply gravity to all fields
    if (wp.gravity !== 0) {
      for (const field of this.fields.values()) {
        field.transform.vy += wp.gravity * dt
      }
    }

    // Apply friction (velocity damping)
    if (wp.friction > 0) {
      const damping = Math.max(0, 1 - wp.friction * dt)
      for (const field of this.fields.values()) {
        field.transform.vx *= damping
        field.transform.vy *= damping
        field.transform.vr *= damping
        if (Math.abs(field.transform.vx) < 0.01) field.transform.vx = 0
        if (Math.abs(field.transform.vy) < 0.01) field.transform.vy = 0
        if (Math.abs(field.transform.vr) < 0.001) field.transform.vr = 0
      }
    }

    // Collision detection + forces
    this.stepCollisions(dt)

    // Agent-defined interaction rules
    this.stepInteractionRules(dt)

    // Agent-defined step hooks
    for (const [hookId, hook] of this.stepHooks) {
      try {
        hook.fn(this, dt)
      } catch (e) {
        console.warn(`Step hook ${hookId} failed:`, e)
      }
    }

    // Process spawn queue (fields created by step hooks)
    if (this.spawnQueue.length > 0) {
      this.processSpawnQueue()
    }

    // Boundary enforcement
    if (wp.boundaryMode === 'solid') {
      this.stepBoundaries()
    } else if (wp.boundaryMode === 'wrap') {
      this.stepWrapBoundaries()
    }

    // Update field transforms (velocity → position)
    this.stepTransforms(dt)
  }

  /** Detect collisions between fields and fire events + apply forces */
  private stepCollisions(dt: number): void {
    const fieldList = Array.from(this.fields.values())
    const wp = this.worldParams

    for (let i = 0; i < fieldList.length; i++) {
      for (let j = i + 1; j < fieldList.length; j++) {
        const a = fieldList[i]
        const b = fieldList[j]
        const boundsA = this.getFieldBounds(a.id)
        const boundsB = this.getFieldBounds(b.id)
        if (!boundsA || !boundsB) continue

        const overlapX = Math.min(boundsA.maxX, boundsB.maxX) - Math.max(boundsA.minX, boundsB.minX)
        const overlapY = Math.min(boundsA.maxY, boundsB.maxY) - Math.max(boundsA.minY, boundsB.minY)
        const overlapping = overlapX > 0 && overlapY > 0

        const wasColliding = this.collisionState.get(a.id)?.has(b.id) || false

        if (overlapping && !wasColliding) {
          if (!this.collisionState.has(a.id)) this.collisionState.set(a.id, new Set())
          if (!this.collisionState.has(b.id)) this.collisionState.set(b.id, new Set())
          this.collisionState.get(a.id)!.add(b.id)
          this.collisionState.get(b.id)!.add(a.id)

          this.addMemory(a.id, {
            timestamp: new Date().toISOString(),
            type: 'collision',
            content: `Collision with ${b.name} (overlap: ${Math.min(overlapX, overlapY).toFixed(0)}px)`,
            sourceFieldId: b.id,
            data: { overlapX, overlapY, otherFieldId: b.id, otherFieldName: b.name },
          })
          this.addMemory(b.id, {
            timestamp: new Date().toISOString(),
            type: 'collision',
            content: `Collision with ${a.name} (overlap: ${Math.min(overlapX, overlapY).toFixed(0)}px)`,
            sourceFieldId: a.id,
            data: { overlapX, overlapY, otherFieldId: a.id, otherFieldName: a.name },
          })
        } else if (!overlapping && wasColliding) {
          this.collisionState.get(a.id)?.delete(b.id)
          this.collisionState.get(b.id)?.delete(a.id)
        }

        if (overlapping && wp.collisionForce !== 0) {
          const aCenterX = (boundsA.minX + boundsA.maxX) / 2
          const aCenterY = (boundsA.minY + boundsA.maxY) / 2
          const bCenterX = (boundsB.minX + boundsB.maxX) / 2
          const bCenterY = (boundsB.minY + boundsB.maxY) / 2

          let dx = bCenterX - aCenterX
          let dy = bCenterY - aCenterY
          const len = Math.sqrt(dx * dx + dy * dy) || 1
          dx /= len
          dy /= len

          const overlap = Math.min(overlapX, overlapY)
          const forceMag = wp.collisionForce * overlap * dt

          a.transform.vx -= dx * forceMag
          a.transform.vy -= dy * forceMag
          b.transform.vx += dx * forceMag
          b.transform.vy += dy * forceMag
        }
      }
    }
  }

  /** Execute agent-defined interaction rules between field pairs */
  private stepInteractionRules(dt: number): void {
    if (this.interactionRules.length === 0) return

    const fieldList = Array.from(this.fields.values())

    for (const rule of this.interactionRules) {
      for (let i = 0; i < fieldList.length; i++) {
        for (let j = i + 1; j < fieldList.length; j++) {
          const a = fieldList[i]
          const b = fieldList[j]

          const matchesAB = (!rule.fieldA || rule.fieldA === a.id) && (!rule.fieldB || rule.fieldB === b.id)
          const matchesBA = (!rule.fieldA || rule.fieldA === b.id) && (!rule.fieldB || rule.fieldB === a.id)
          if (!matchesAB && !matchesBA) continue

          const [fa, fb] = matchesAB ? [a, b] : [b, a]

          const boundsA = this.getFieldBounds(fa.id)
          const boundsB = this.getFieldBounds(fb.id)
          if (!boundsA || !boundsB) continue

          const overlapX = Math.min(boundsA.maxX, boundsB.maxX) - Math.max(boundsA.minX, boundsB.minX)
          const overlapY = Math.min(boundsA.maxY, boundsB.maxY) - Math.max(boundsA.minY, boundsB.minY)
          const overlapping = overlapX > 0 && overlapY > 0

          const aCx = (boundsA.minX + boundsA.maxX) / 2
          const aCy = (boundsA.minY + boundsA.maxY) / 2
          const bCx = (boundsB.minX + boundsB.maxX) / 2
          const bCy = (boundsB.minY + boundsB.maxY) / 2
          const dist = Math.sqrt((bCx - aCx) ** 2 + (bCy - aCy) ** 2)

          let triggered = false
          if (rule.trigger === 'overlap' && overlapping) triggered = true
          if (rule.trigger === 'proximity' && dist < (rule.triggerDistance || 100)) triggered = true
          if (rule.trigger === 'always') triggered = true

          if (!triggered) continue

          const p = rule.effectParams
          switch (rule.effect) {
            case 'apply_force': {
              if (p.impulse) {
                const cooldown = (p.cooldown as number) || 0.5
                const forceKey = `force_${rule.id}_${fa.id}_${fb.id}`
                const now = Date.now()
                const lastFired = this._ruleEventThrottle.get(forceKey) || 0
                if (now - lastFired < cooldown * 1000) break
                this._ruleEventThrottle.set(forceKey, now)
                const fx = (p.fx as number || 0)
                const fy = (p.fy as number || 0)
                fa.transform.vx += fx
                fa.transform.vy += fy
                fb.transform.vx -= fx
                fb.transform.vy -= fy
              } else {
                const fx = (p.fx as number || 0) * dt
                const fy = (p.fy as number || 0) * dt
                fa.transform.vx += fx
                fa.transform.vy += fy
                fb.transform.vx -= fx
                fb.transform.vy -= fy
              }
              break
            }
            case 'send_event': {
              const eventKey = `rule_${rule.id}_${fa.id}_${fb.id}`
              const now = Date.now()
              const lastFired = this._ruleEventThrottle.get(eventKey) || 0
              if (now - lastFired > 1000) {
                this._ruleEventThrottle.set(eventKey, now)
                const content = p.message as string || `Interaction rule "${rule.description || rule.id}" triggered`
                this.addMemory(fa.id, {
                  timestamp: new Date().toISOString(),
                  type: 'collision',
                  content,
                  sourceFieldId: fb.id,
                  data: { ruleId: rule.id, effect: rule.effect },
                })
              }
              break
            }
          }
        }
      }
    }
  }
  private _ruleEventThrottle: Map<string, number> = new Map()

  /** Add an interaction rule. Returns the rule's id. */
  addInteractionRule(rule: InteractionRule): string {
    const id = rule.id || `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    this.interactionRules.push({ ...rule, id })
    return id
  }

  /** Remove an interaction rule by id */
  removeInteractionRule(ruleId: string): boolean {
    const before = this.interactionRules.length
    this.interactionRules = this.interactionRules.filter(r => r.id !== ruleId)
    return this.interactionRules.length < before
  }

  /** Register a custom command macro */
  addCustomCommand(cmd: CustomCommand): void {
    this.customCommands.set(cmd.name, cmd)
  }

  /** Get a custom command by name */
  getCustomCommand(name: string): CustomCommand | undefined {
    return this.customCommands.get(name)
  }

  /** Enforce solid boundaries — bounce fields off grid edges using analytic bounds */
  private stepBoundaries(): void {
    const wp = this.worldParams
    for (const field of this.fields.values()) {
      const bounds = this.getFieldBounds(field.id)
      if (!bounds) continue

      if (bounds.minX < 0) {
        field.transform.x -= bounds.minX
        if (field.transform.vx < 0) field.transform.vx = -field.transform.vx * wp.bounciness
      }
      if (bounds.maxX >= GRID_SIZE) {
        field.transform.x -= (bounds.maxX - (GRID_SIZE - 1))
        if (field.transform.vx > 0) field.transform.vx = -field.transform.vx * wp.bounciness
      }
      if (bounds.minY < 0) {
        field.transform.y -= bounds.minY
        if (field.transform.vy < 0) field.transform.vy = -field.transform.vy * wp.bounciness
      }
      if (bounds.maxY >= GRID_SIZE) {
        field.transform.y -= (bounds.maxY - (GRID_SIZE - 1))
        if (field.transform.vy > 0) field.transform.vy = -field.transform.vy * wp.bounciness
      }
    }
  }

  /** Wrap boundaries — toroidal topology. Fields wrap around grid edges. */
  private stepWrapBoundaries(): void {
    for (const field of this.fields.values()) {
      const t = field.transform
      // Wrap position around grid
      if (t.x < 0) t.x += GRID_SIZE
      if (t.x >= GRID_SIZE) t.x -= GRID_SIZE
      if (t.y < 0) t.y += GRID_SIZE
      if (t.y >= GRID_SIZE) t.y -= GRID_SIZE
    }
  }

  /** Wrap fields around grid edges — fields exiting one side appear on the opposite side */
  private stepBoundaryWrap(): void {
    for (const field of this.fields.values()) {
      const t = field.transform
      const bounds = this.getFieldBounds(field.id)
      if (!bounds) continue

      const fieldW = bounds.maxX - bounds.minX
      const fieldH = bounds.maxY - bounds.minY

      // Wrap horizontally
      if (bounds.maxX < 0) {
        t.x += GRID_SIZE + fieldW
      } else if (bounds.minX >= GRID_SIZE) {
        t.x -= GRID_SIZE + fieldW
      }

      // Wrap vertically
      if (bounds.maxY < 0) {
        t.y += GRID_SIZE + fieldH
      } else if (bounds.minY >= GRID_SIZE) {
        t.y -= GRID_SIZE + fieldH
      }
    }
  }

  /** Register a step hook — runs every simulation tick. Returns null on success, error string on failure. */
  addStepHook(id: string, author: string, description: string, code: string): string | null {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('sim', 'dt', code) as (sim: FieldSimulation, dt: number) => void
      this.stepHooks.set(id, { author, description, code, fn })
      return null
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`Failed to compile step hook ${id}:`, msg)
      return msg
    }
  }

  /** Remove a step hook */
  removeStepHook(id: string): void {
    this.stepHooks.delete(id)
  }

  /** Serialize step hooks for state sync (excludes fn) */
  getStepHookSnapshots(): Array<{ id: string; author: string; description: string; code: string }> {
    const result: Array<{ id: string; author: string; description: string; code: string }> = []
    for (const [id, hook] of this.stepHooks) {
      result.push({ id, author: hook.author, description: hook.description, code: hook.code })
    }
    return result
  }

  /** Given a grid coordinate, return the field that contains it, or null */
  getFieldAtCell(x: number, y: number): Field | null {
    for (const field of this.fields.values()) {
      if (this.pointInShape(x, y, field)) return field
    }
    return null
  }

  /** Get the axis-aligned bounding box of a field from its shape + transform (analytic) */
  getFieldBounds(fieldId: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const field = this.fields.get(fieldId)
    if (!field || !field.shape) return null

    const t = field.transform
    if (field.shape.type === 'circle') {
      const r = field.shape.radius
      return {
        minX: t.x - r,
        minY: t.y - r,
        maxX: t.x + r,
        maxY: t.y + r,
      }
    } else {
      return {
        minX: t.x,
        minY: t.y,
        maxX: t.x + field.shape.w,
        maxY: t.y + field.shape.h,
      }
    }
  }

  /** Get the center of a field */
  getFieldCenter(fieldId: string): { x: number; y: number } | null {
    const bounds = this.getFieldBounds(fieldId)
    if (!bounds) return null
    return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
  }

  /** Set field position directly */
  setPosition(fieldId: string, x: number, y: number): void {
    const field = this.fields.get(fieldId)
    if (!field) return
    field.transform.x = x
    field.transform.y = y
  }

  /** Add an effect to a field's effect stack */
  addFieldEffect(fieldId: string, effect: FieldEffect): void {
    const field = this.fields.get(fieldId)
    if (!field) return
    field.effects.push(effect)
    field.effects.sort((a, b) => a.order - b.order)
    this.addMemory(fieldId, {
      timestamp: new Date().toISOString(),
      type: 'effect_added',
      content: `Effect added: "${effect.description}" (${effect.blend} blend)`,
      sourceFieldId: null,
      data: { effectId: effect.id, author: effect.author },
    })
  }

  /** Remove an effect from a field's stack by effectId */
  removeFieldEffect(fieldId: string, effectId: string): boolean {
    const field = this.fields.get(fieldId)
    if (!field) return false
    const before = field.effects.length
    field.effects = field.effects.filter(e => e.id !== effectId)
    if (field.effects.length < before) {
      this.addMemory(fieldId, {
        timestamp: new Date().toISOString(),
        type: 'effect_removed',
        content: `Effect removed: ${effectId}`,
        sourceFieldId: null,
      })
      return true
    }
    return false
  }

  /** Get proximity info for a field relative to all other fields */
  getProximity(fieldId: string): FieldProximity[] {
    const field = this.fields.get(fieldId)
    if (!field) return []
    const myCenter = this.getFieldCenter(fieldId)
    const myBounds = this.getFieldBounds(fieldId)
    if (!myCenter || !myBounds) return []

    const result: FieldProximity[] = []
    for (const other of this.fields.values()) {
      if (other.id === fieldId) continue
      const ob = this.getFieldBounds(other.id)
      const oc = this.getFieldCenter(other.id)
      if (!ob || !oc) continue

      const gapX = Math.max(myBounds.minX - ob.maxX, ob.minX - myBounds.maxX, 0)
      const gapY = Math.max(myBounds.minY - ob.maxY, ob.minY - myBounds.maxY, 0)
      const overlapX = Math.min(myBounds.maxX, ob.maxX) - Math.max(myBounds.minX, ob.minX)
      const overlapY = Math.min(myBounds.maxY, ob.maxY) - Math.max(myBounds.minY, ob.minY)
      const overlapping = overlapX > 0 && overlapY > 0
      const distance = overlapping
        ? -Math.min(overlapX, overlapY)
        : Math.round(Math.sqrt(gapX * gapX + gapY * gapY))

      const dirX = oc.x - myCenter.x
      const dirY = oc.y - myCenter.y
      const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1

      result.push({
        fieldId: other.id,
        fieldName: other.name,
        distance,
        direction: [dirX / len, dirY / len],
        overlapping,
      })
    }
    return result
  }

  /** Add a memory entry to a field's history */
  addMemory(fieldId: string, entry: FieldMemoryEntry): void {
    let entries = this.fieldMemory.get(fieldId)
    if (!entries) {
      entries = []
      this.fieldMemory.set(fieldId, entries)
    }
    entries.push(entry)
    if (entries.length > FieldSimulation.MAX_MEMORY) {
      entries.splice(0, entries.length - FieldSimulation.MAX_MEMORY)
    }
  }

  /** Get memory entries for a field */
  getMemory(fieldId: string): FieldMemoryEntry[] {
    return this.fieldMemory.get(fieldId) || []
  }

  /** Clear memory for a field */
  clearMemory(fieldId: string): void {
    this.fieldMemory.delete(fieldId)
  }

  /** Get current world params for serialization */
  getWorldParams(): WorldParams {
    return { ...this.worldParams }
  }

  /** Serialize all fields to snapshots for the state store */
  generateSnapshots(): FieldSnapshot[] {
    const snapshots: FieldSnapshot[] = []
    for (const field of this.fields.values()) {
      const bounds = this.getFieldBounds(field.id)
      const center = this.getFieldCenter(field.id)
      // Sample state data at field center
      let stateAtCenter: { r: number; g: number; b: number; a: number } | undefined
      if (center) {
        const cx = Math.floor(center.x), cy = Math.floor(center.y)
        if (cx >= 0 && cx < GRID_SIZE && cy >= 0 && cy < GRID_SIZE) {
          const base = (cy * GRID_SIZE + cx) * 4
          stateAtCenter = { r: this.world.stateData[base], g: this.world.stateData[base + 1], b: this.world.stateData[base + 2], a: this.world.stateData[base + 3] }
        }
      }
      snapshots.push({
        id: field.id,
        name: field.name,
        color: field.color,
        shape: field.shape,
        bounds,
        effects: field.effects.map(e => ({
          id: e.id, author: e.author, glsl: e.glsl,
          description: e.description, blend: e.blend, order: e.order,
        })),
        transform: { ...field.transform },
        memory: [...this.getMemory(field.id)],
        proximity: this.getProximity(field.id),
        stateAtCenter,
        properties: Object.fromEntries(field.properties),
      })
    }
    return snapshots
  }

  /** Return all fields that have at least one effect */
  getFieldsWithEffects(): Field[] {
    const result: Field[] = []
    for (const field of this.fields.values()) {
      if (field.effects.length > 0) result.push(field)
    }
    return result
  }

  /** Generate a mask Uint8Array for a field's shape (for shader pass) — cached, invalidated on move */
  generateShapeMask(fieldId: string): Uint8Array | null {
    const field = this.fields.get(fieldId)
    if (!field) return null

    const bounds = this.getFieldBounds(fieldId)
    if (!bounds) return null

    // Cache key: integer position + shape descriptor
    const ix = Math.round(field.transform.x)
    const iy = Math.round(field.transform.y)
    const shapeKey = field.shape.type === 'circle' 
      ? `c${field.shape.radius}` 
      : `r${field.shape.w}x${field.shape.h}`
    
    const cached = this.maskCache.get(fieldId)
    if (cached && cached.x === ix && cached.y === iy && cached.shape === shapeKey) {
      return cached.mask
    }

    const mask = new Uint8Array(GRID_SIZE * GRID_SIZE)
    const minX = Math.max(0, Math.floor(bounds.minX))
    const minY = Math.max(0, Math.floor(bounds.minY))
    const maxX = Math.min(GRID_SIZE - 1, Math.ceil(bounds.maxX))
    const maxY = Math.min(GRID_SIZE - 1, Math.ceil(bounds.maxY))

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (this.pointInShape(x, y, field)) {
          mask[y * GRID_SIZE + x] = 255
        }
      }
    }

    this.maskCache.set(fieldId, { mask, x: ix, y: iy, shape: shapeKey })
    return mask
  }

  /** Invalidate mask cache for a field */
  invalidateMaskCache(fieldId: string): void {
    this.maskCache.delete(fieldId)
  }
}
