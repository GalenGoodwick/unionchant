// Field Engine v3 — Simulation (CPU-side, shape-based)

import { GRID_SIZE, type FieldWorld, type Field, type FieldShape, type FieldTransform, type FieldEffect, type FieldMemoryEntry, type FieldSnapshot, type FieldProximity, type WorldParams, type InteractionRule, type CustomCommand, type FieldLink, type Projectile, type FieldSkeleton, type SkeletonNode, type SkeletonEdge } from './types'

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
  spawnQueue: Array<{ name: string; color: [number, number, number, number]; shape?: FieldShape; x: number; y: number }> = []
  /** Persistent visual links between fields */
  fieldLinks: Map<string, FieldLink> = new Map()
  /** Shared world data — key-value store accessible from step hooks */
  worldData: Record<string, unknown> = {}
  /** Lightweight projectiles — rendered via effectData, not as fields */
  projectiles: Projectile[] = []
  static readonly MAX_MEMORY = 100
  static readonly MAX_PROJECTILES = 200

  /** World-level physics parameters */
  worldParams: WorldParams = {
    gravity: 0,
    friction: 0,
    collisionForce: 0,
    boundaryMode: 'open',
    bounciness: 0.5,
    gravitationalConstant: 0,
    bloomIntensity: 0.3,
    bloomThreshold: 0.8,
    windX: 0,
    windY: 0,
  }

  constructor() {
    const totalCells = GRID_SIZE * GRID_SIZE * 4
    this.world = {
      size: GRID_SIZE,
      colorData: new Float32Array(totalCells),
      stateData: new Float32Array(totalCells),
      effectData: new Float32Array(totalCells),
    }
    this.fields = new Map()
  }

  /** Restore fields from server-stored snapshots (called on mount) */
  restoreFromSnapshots(snapshots: FieldSnapshot[]): void {
    for (const snap of snapshots) {
      this.createField(snap.id, snap.name, snap.color, snap.shape)
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
      // Restore skeleton
      if (snap.skeleton) {
        field.skeleton = snap.skeleton
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

  /** Create a new field — optionally with a shape hint */
  createField(id: string, name: string, color: [number, number, number, number], shape?: FieldShape): Field {
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
    const shapeDesc = shape
      ? (shape.type === 'polygon' ? `polygon r=${shape.radius} sides=${shape.sides}` : `rect ${shape.w}x${shape.h}`)
      : 'no form'
    this.addMemory(id, {
      timestamp: new Date().toISOString(),
      type: 'created',
      content: `Field "${name}" created (${shapeDesc})`,
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
  queueSpawn(name: string, color: [number, number, number, number], shape: FieldShape | undefined, x: number, y: number): void {
    if (this.spawnQueue.length >= 30) return // Limit spawns per tick (raised for multi-agent)
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
  setShape(fieldId: string, shape?: FieldShape): void {
    const field = this.fields.get(fieldId)
    if (!field) return
    field.shape = shape
    const shapeDesc = shape
      ? (shape.type === 'polygon' ? `polygon r=${shape.radius} sides=${shape.sides}` : `rect ${shape.w}x${shape.h}`)
      : 'no form'
    this.addMemory(fieldId, {
      timestamp: new Date().toISOString(),
      type: 'shape_changed',
      content: `Shape changed to ${shapeDesc}`,
      sourceFieldId: null,
    })
  }

  /** Test if a point is inside a field's shape (in grid coordinates) */
  pointInShape(x: number, y: number, field: Field): boolean {
    if (!field.shape) return false
    const t = field.transform
    if (field.shape.type === 'polygon') {
      // Regular polygon: test point-in-polygon using angular sectors
      const dx = x - t.x
      const dy = y - t.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > field.shape.radius) return false
      const sides = field.shape.sides
      const angle = Math.atan2(dy, dx)
      const sector = (2 * Math.PI) / sides
      // Distance to polygon edge at this angle
      const sectorAngle = ((angle % sector) + sector) % sector
      const halfSector = sector / 2
      const edgeDist = field.shape.radius * Math.cos(halfSector) / Math.cos(sectorAngle - halfSector)
      return dist <= edgeDist
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

    // N-body gravitational attraction/repulsion between fields
    if (wp.gravitationalConstant !== 0) {
      this.stepGravitation(dt)
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

    // Skeleton physics (spring forces, wind, gravity on nodes)
    this.stepSkeletonPhysics(dt)

    // Update field transforms (velocity → position)
    this.stepTransforms(dt)

    // Update particles (fade, shrink, despawn expired)
    this.stepParticles(dt)

    // Update projectiles and stamp into effectData
    this.stepProjectiles(dt)

    // Fade effect layer
    this.fadeEffects(dt)
  }

  /** Apply n-body gravitational attraction/repulsion between all field pairs */
  private stepGravitation(dt: number): void {
    const G = this.worldParams.gravitationalConstant
    const fieldList = Array.from(this.fields.values())
    const minDist = 10 // Prevent singularity at zero distance

    for (let i = 0; i < fieldList.length; i++) {
      for (let j = i + 1; j < fieldList.length; j++) {
        const a = fieldList[i]
        const b = fieldList[j]

        const dx = b.transform.x - a.transform.x
        const dy = b.transform.y - a.transform.y
        const distSq = dx * dx + dy * dy
        const dist = Math.sqrt(distSq)
        if (dist < minDist) continue

        // F = G / r^2, applied along the direction between fields
        const force = G / distSq * dt
        const nx = dx / dist
        const ny = dy / dist

        a.transform.vx += nx * force
        a.transform.vy += ny * force
        b.transform.vx -= nx * force
        b.transform.vy -= ny * force
      }
    }
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


  /** Find a field by name (convenience for step hooks: sim.getFieldByName('Alpha')) */
  getFieldByName(name: string): Field | null {
    for (const field of this.fields.values()) {
      if (field.name === name) return field
    }
    return null
  }

  /** Get distance between two fields by their center points */
  getFieldDistance(fieldA: Field, fieldB: Field): number {
    const dx = fieldA.transform.x - fieldB.transform.x
    const dy = fieldA.transform.y - fieldB.transform.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  /** Find all fields within a radius of a point (for step hooks: sim.getFieldsNear(256, 256, 100)) */
  getFieldsNear(x: number, y: number, radius: number): Field[] {
    const result: Field[] = []
    const r2 = radius * radius
    for (const field of this.fields.values()) {
      const dx = field.transform.x - x
      const dy = field.transform.y - y
      if (dx * dx + dy * dy <= r2) {
        result.push(field)
      }
    }
    return result
  }

  /** Broadcast a message to all fields from a source field */
  broadcastMessage(fromFieldId: string, content: string, data?: Record<string, unknown>): void {
    const fromField = this.fields.get(fromFieldId)
    if (!fromField) return
    for (const [id, field] of this.fields) {
      if (id === fromFieldId) continue
      this.addMemory(id, {
        timestamp: new Date().toISOString(),
        type: 'message_received',
        content: `[Broadcast from ${fromField.name}] ${content}`,
        sourceFieldId: fromFieldId,
        data,
      })
    }
  }

  /** Get the total energy across all non-particle fields */
  getTotalEnergy(): number {
    let total = 0
    for (const field of this.fields.values()) {
      if (field.name.startsWith('spark') || field.name.startsWith('particle') || field.name.startsWith('comet')) continue
      const energy = field.properties.get('energy')
      if (typeof energy === 'number') total += energy
    }
    return total
  }

  /** Get count of non-particle fields */
  getFieldCount(): number {
    let count = 0
    for (const field of this.fields.values()) {
      if (!field.name.startsWith('spark') && !field.name.startsWith('particle') && !field.name.startsWith('comet')) count++
    }
    return count
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
    if (!field) return null

    const t = field.transform
    if (!field.shape) {
      // No shape — return a small area around the position
      return { minX: t.x - 1, minY: t.y - 1, maxX: t.x + 1, maxY: t.y + 1 }
    }

    if (field.shape.type === 'polygon') {
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
        skeleton: field.skeleton,
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
    if (!field || !field.shape) return null

    const bounds = this.getFieldBounds(fieldId)
    if (!bounds) return null

    // Cache key: integer position + shape descriptor
    const ix = Math.round(field.transform.x)
    const iy = Math.round(field.transform.y)
    const shapeKey = field.shape.type === 'polygon'
      ? `p${field.shape.radius}x${field.shape.sides}`
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

  /** Add a visual link between two fields */
  addLink(link: FieldLink): string {
    const id = link.id || 'link_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    this.fieldLinks.set(id, { ...link, id })
    return id
  }

  /** Remove a link */
  removeLink(linkId: string): boolean {
    return this.fieldLinks.delete(linkId)
  }

  /** Remove all links involving a field */
  removeLinksForField(fieldId: string): void {
    for (const [id, link] of this.fieldLinks) {
      if (link.fromFieldId === fieldId || link.toFieldId === fieldId) {
        this.fieldLinks.delete(id)
      }
    }
  }

  /** Get all links as serializable array */
  getLinkSnapshots(): FieldLink[] {
    return Array.from(this.fieldLinks.values())
  }

  /** Get link endpoint positions (for rendering) */
  getLinkEndpoints(): Array<{ id: string; fromX: number; fromY: number; toX: number; toY: number; color: [number, number, number, number]; width: number; style: string; intensity: number }> {
    const result: Array<{ id: string; fromX: number; fromY: number; toX: number; toY: number; color: [number, number, number, number]; width: number; style: string; intensity: number }> = []
    for (const link of this.fieldLinks.values()) {
      const fromField = this.fields.get(link.fromFieldId)
      const toField = this.fields.get(link.toFieldId)
      if (!fromField || !toField) continue
      result.push({
        id: link.id,
        fromX: fromField.transform.x,
        fromY: fromField.transform.y,
        toX: toField.transform.x,
        toY: toField.transform.y,
        color: link.color,
        width: link.width,
        style: link.style,
        intensity: link.intensity,
      })
    }
    return result
  }

  /** Particle system — temporary fields that auto-despawn after a lifetime */
  private particles: Map<string, { id: string; lifetime: number; maxLifetime: number; fieldId: string }> = new Map()

  /** Spawn a particle — a temporary field with a limited lifetime (seconds) */
  spawnParticle(name: string, color: [number, number, number, number], x: number, y: number, vx: number, vy: number, lifetime: number = 2.0, radius: number = 3): string {
    const id = 'particle_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    const field = this.createField(id, name, color, { type: 'polygon', radius, sides: 16 })
    field.transform.x = x
    field.transform.y = y
    field.transform.vx = vx
    field.transform.vy = vy
    this.particles.set(id, { id, lifetime, maxLifetime: lifetime, fieldId: id })
    return id
  }

  /** Update particles — decrement lifetime, fade alpha, remove expired */
  stepParticles(dt: number): string[] {
    const expired: string[] = []
    for (const [id, particle] of this.particles) {
      particle.lifetime -= dt
      const field = this.fields.get(particle.fieldId)
      if (!field) {
        expired.push(id)
        continue
      }
      // Fade alpha based on remaining lifetime
      const lifeFrac = Math.max(0, particle.lifetime / particle.maxLifetime)
      field.color[3] = lifeFrac
      // Shrink as it dies
      field.transform.scale = lifeFrac
      if (particle.lifetime <= 0) {
        expired.push(id)
        this.removeField(particle.fieldId)
      }
    }
    for (const id of expired) {
      this.particles.delete(id)
    }
    return expired
  }

  /** Get active particle count */
  getParticleCount(): number {
    return this.particles.size
  }

  /** Render trails and links into the effect layer.
   *  Uses effectData (R=effectType, G=hue, B=brightness, A=intensity).
   *  The base shader's effect rendering handles the visual output. */
  renderTrailsAndLinks(): void {
    // Stamp trail dots at each field's current position
    for (const field of this.fields.values()) {
      const x = field.transform.x
      const y = field.transform.y
      const r = Math.max(1, Math.round(
        (field.shape?.type === 'polygon' ? field.shape.radius
          : field.shape?.type === 'rect' ? Math.min(field.shape.w, field.shape.h) / 2 : 5) * 0.3
      ))
      const hue = this.rgbToHue(field.color)
      const brightness = Math.max(field.color[0], field.color[1], field.color[2])
      this.stampEffectCircle(x, y, r, 1, hue, brightness, 0.5)
    }

    // Draw links as effect lines
    for (const link of this.fieldLinks.values()) {
      const fromField = this.fields.get(link.fromFieldId)
      const toField = this.fields.get(link.toFieldId)
      if (!fromField || !toField) continue
      const hue = this.rgbToHue(link.color)
      const brightness = Math.max(link.color[0], link.color[1], link.color[2])
      this.stampEffectLine(
        fromField.transform.x, fromField.transform.y,
        toField.transform.x, toField.transform.y,
        Math.max(1, Math.round(link.width)),
        1, hue, brightness, link.intensity
      )
    }
  }

  /** Convert RGBA color to hue (0-1) for effect layer */
  private rgbToHue(color: [number, number, number, number]): number {
    const [r, g, b] = color
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    if (max === min) return 0
    const d = max - min
    let h = 0
    if (max === r) h = ((g - b) / d + 6) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    return h / 6
  }

  /** Stamp an effect line between two points */
  stampEffectLine(x0: number, y0: number, x1: number, y1: number, width: number, effectType: number, hue: number, brightness: number, intensity: number): void {
    const dx = x1 - x0, dy = y1 - y0
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1) return
    const steps = Math.ceil(len)
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const cx = x0 + dx * t
      const cy = y0 + dy * t
      // Stamp a small circle at each step for width
      for (let wy = -Math.floor(width / 2); wy <= Math.floor(width / 2); wy++) {
        for (let wx = -Math.floor(width / 2); wx <= Math.floor(width / 2); wx++) {
          if (wx * wx + wy * wy <= (width / 2) * (width / 2)) {
            this.stampEffectPixel(cx + wx, cy + wy, effectType, hue, brightness, intensity)
          }
        }
      }
    }
  }

  // ─── Effect Layer ───

  /** Write a single effect pixel — the atomic operation.
   *  Shapes are defined by which pixels you write to. */
  stampEffectPixel(x: number, y: number, effectType: number, hue: number, brightness: number, intensity: number): void {
    const gx = Math.round(x), gy = Math.round(y)
    if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) return
    const idx = (gy * GRID_SIZE + gx) * 4
    const data = this.world.effectData
    data[idx] = effectType
    data[idx + 1] = hue
    data[idx + 2] = brightness
    data[idx + 3] = Math.max(data[idx + 3], intensity)
  }

  /** Stamp an effect using a pixel offset array — arbitrary shapes.
   *  offsets: array of [dx, dy] pairs relative to (x,y) center */
  stampEffectShape(x: number, y: number, offsets: [number, number][], effectType: number, hue: number, brightness: number, intensity: number): void {
    for (const [dx, dy] of offsets) {
      this.stampEffectPixel(x + dx, y + dy, effectType, hue, brightness, intensity)
    }
  }

  /** Convenience: stamp a circular effect (for simple cases) */
  stampEffectCircle(x: number, y: number, radius: number, effectType: number, hue: number, brightness: number, intensity: number): void {
    const gx = Math.round(x), gy = Math.round(y)
    const r = Math.max(1, Math.round(radius))
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue
        this.stampEffectPixel(gx + dx, gy + dy, effectType, hue, brightness, intensity)
      }
    }
  }

  /** Clear effects in a radius */
  clearEffects(x: number, y: number, radius: number): void {
    const gx = Math.round(x), gy = Math.round(y)
    const r = Math.round(radius)
    const data = this.world.effectData
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue
        const px = gx + dx, py = gy + dy
        if (px < 0 || px >= GRID_SIZE || py < 0 || py >= GRID_SIZE) continue
        const idx = (py * GRID_SIZE + px) * 4
        data[idx] = 0
        data[idx + 1] = 0
        data[idx + 2] = 0
        data[idx + 3] = 0
      }
    }
  }

  /** Fade all effects — called each tick */
  private fadeEffects(dt: number): void {
    const data = this.world.effectData
    const fadeRate = dt * 2.0
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) {
        data[i] -= fadeRate
        if (data[i] <= 0) {
          data[i] = 0
          data[i - 3] = 0
          data[i - 2] = 0
          data[i - 1] = 0
        }
      }
    }
  }

  /** Spawn a lightweight projectile */
  spawnProjectile(x: number, y: number, vx: number, vy: number, effectType: number, hue: number, size: number, intensity: number, lifetime: number): void {
    if (this.projectiles.length >= FieldSimulation.MAX_PROJECTILES) return
    this.projectiles.push({ x, y, vx, vy, effectType, color: hue, size, intensity, age: 0, lifetime })
  }

  /** Update projectiles — move, stamp, expire */
  private stepProjectiles(dt: number): void {
    const alive: Projectile[] = []
    for (const p of this.projectiles) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.age += dt
      if (p.age >= p.lifetime) continue
      if (p.x < 0 || p.x >= GRID_SIZE || p.y < 0 || p.y >= GRID_SIZE) continue
      const fade = 1.0 - (p.age / p.lifetime)
      this.stampEffectCircle(p.x, p.y, p.size, p.effectType, p.color, 1.0, p.intensity * fade)
      alive.push(p)
    }
    this.projectiles = alive
  }

  // ─── Skeleton System ───

  static readonly MAX_SKELETON_NODES = 128

  /** Set entire skeleton for a field */
  setSkeleton(fieldId: string, skeleton: FieldSkeleton): void {
    const field = this.fields.get(fieldId)
    if (!field) return
    // Clamp to max nodes
    if (skeleton.nodes.length > FieldSimulation.MAX_SKELETON_NODES) {
      skeleton.nodes = skeleton.nodes.slice(0, FieldSimulation.MAX_SKELETON_NODES)
    }
    field.skeleton = skeleton
  }

  /** Add a single node to a field's skeleton */
  addSkeletonNode(fieldId: string, node: SkeletonNode): void {
    const field = this.fields.get(fieldId)
    if (!field) return
    if (!field.skeleton) {
      field.skeleton = { nodes: [], edges: [], physics: false }
    }
    if (field.skeleton.nodes.length >= FieldSimulation.MAX_SKELETON_NODES) return
    field.skeleton.nodes.push(node)
  }

  /** Remove a node and all connected edges */
  removeSkeletonNode(fieldId: string, nodeId: string): void {
    const field = this.fields.get(fieldId)
    if (!field?.skeleton) return
    field.skeleton.nodes = field.skeleton.nodes.filter(n => n.id !== nodeId)
    field.skeleton.edges = field.skeleton.edges.filter(e => e.from !== nodeId && e.to !== nodeId)
    // Update parent references
    for (const node of field.skeleton.nodes) {
      if (node.parentId === nodeId) node.parentId = null
    }
  }

  /** Reposition a skeleton node */
  moveSkeletonNode(fieldId: string, nodeId: string, x: number, y: number): void {
    const field = this.fields.get(fieldId)
    if (!field?.skeleton) return
    const node = field.skeleton.nodes.find(n => n.id === nodeId)
    if (node) {
      node.x = x
      node.y = y
    }
  }

  /** Add an edge between two skeleton nodes */
  connectSkeletonNodes(fieldId: string, fromId: string, toId: string, width: number = 1, stiffness: number = 0.5): void {
    const field = this.fields.get(fieldId)
    if (!field?.skeleton) return
    // Verify both nodes exist
    const hasFrom = field.skeleton.nodes.some(n => n.id === fromId)
    const hasTo = field.skeleton.nodes.some(n => n.id === toId)
    if (!hasFrom || !hasTo) return
    // Don't duplicate
    if (field.skeleton.edges.some(e => e.from === fromId && e.to === toId)) return
    field.skeleton.edges.push({ from: fromId, to: toId, width, stiffness })
  }

  /** Generate a skeleton from a template */
  generateSkeleton(fieldId: string, template: string, params: Record<string, unknown>): void {
    const field = this.fields.get(fieldId)
    if (!field) return

    let skeleton: FieldSkeleton
    switch (template) {
      case 'tree':
        skeleton = this.generateTreeSkeleton(params)
        break
      case 'humanoid':
        skeleton = this.generateHumanoidSkeleton(params)
        break
      case 'crystal':
        skeleton = this.generateCrystalSkeleton(params)
        break
      case 'vine':
        skeleton = this.generateVineSkeleton(params)
        break
      case 'star_burst':
        skeleton = this.generateStarBurstSkeleton(params)
        break
      default:
        return
    }

    field.skeleton = skeleton
  }

  /** Generate a tree skeleton — recursive branching */
  private generateTreeSkeleton(params: Record<string, unknown>): FieldSkeleton {
    const depth = (params.depth as number) || 4
    const branchFactor = (params.branchFactor as number) || 3
    const trunkRadius = (params.trunkRadius as number) || 8
    const spread = (params.spread as number) || 0.7
    const taper = (params.taper as number) || 0.6

    const nodes: SkeletonNode[] = []
    const edges: SkeletonEdge[] = []
    let nodeIdx = 0

    function addBranch(
      parentId: string | null,
      x: number, y: number,
      angle: number, length: number,
      radius: number, currentDepth: number
    ) {
      if (currentDepth > depth || nodes.length >= 127) return

      const id = `n${nodeIdx++}`
      nodes.push({ id, x, y, radius, parentId, properties: { depth: currentDepth } })

      if (parentId) {
        edges.push({ from: parentId, to: id, width: radius, stiffness: currentDepth / depth })
      }

      if (currentDepth >= depth) return

      const nextLen = length * 0.7
      const nextRadius = radius * taper
      const angleStep = spread / Math.max(branchFactor - 1, 1)
      const startAngle = angle - spread * 0.5

      for (let i = 0; i < branchFactor && nodes.length < 127; i++) {
        const branchAngle = startAngle + angleStep * i + (Math.random() - 0.5) * 0.2
        const nx = x + Math.cos(branchAngle) * nextLen
        const ny = y + Math.sin(branchAngle) * nextLen
        addBranch(id, nx, ny, branchAngle, nextLen, nextRadius, currentDepth + 1)
      }
    }

    // Root node at base
    const rootId = `n${nodeIdx++}`
    nodes.push({ id: rootId, x: 0, y: 0, radius: trunkRadius, parentId: null })

    // Trunk goes upward (negative y = up in screen space)
    const trunkLen = trunkRadius * 4
    const trunkTopId = `n${nodeIdx++}`
    nodes.push({ id: trunkTopId, x: 0, y: -trunkLen, radius: trunkRadius * 0.7, parentId: rootId })
    edges.push({ from: rootId, to: trunkTopId, width: trunkRadius, stiffness: 0.1 })

    // Branch from trunk top
    addBranch(trunkTopId, 0, -trunkLen, -Math.PI / 2, trunkLen * 0.6, trunkRadius * taper, 1)

    return { nodes, edges, physics: false }
  }

  /** Generate a humanoid skeleton */
  private generateHumanoidSkeleton(params: Record<string, unknown>): FieldSkeleton {
    const height = (params.height as number) || 60
    const limbLength = (params.limbLength as number) || 20

    const nodes: SkeletonNode[] = []
    const edges: SkeletonEdge[] = []

    // Torso
    nodes.push({ id: 'hip', x: 0, y: 0, radius: 4, parentId: null })
    nodes.push({ id: 'chest', x: 0, y: -height * 0.4, radius: 5, parentId: 'hip' })
    nodes.push({ id: 'head', x: 0, y: -height * 0.5 - 8, radius: 6, parentId: 'chest' })
    edges.push({ from: 'hip', to: 'chest', width: 4, stiffness: 0.1 })
    edges.push({ from: 'chest', to: 'head', width: 3, stiffness: 0.1 })

    // Arms
    nodes.push({ id: 'l_shoulder', x: -8, y: -height * 0.38, radius: 3, parentId: 'chest' })
    nodes.push({ id: 'l_elbow', x: -limbLength * 0.6, y: -height * 0.28, radius: 2.5, parentId: 'l_shoulder' })
    nodes.push({ id: 'l_hand', x: -limbLength, y: -height * 0.18, radius: 2, parentId: 'l_elbow' })
    edges.push({ from: 'chest', to: 'l_shoulder', width: 3, stiffness: 0.3 })
    edges.push({ from: 'l_shoulder', to: 'l_elbow', width: 2.5, stiffness: 0.5 })
    edges.push({ from: 'l_elbow', to: 'l_hand', width: 2, stiffness: 0.5 })

    nodes.push({ id: 'r_shoulder', x: 8, y: -height * 0.38, radius: 3, parentId: 'chest' })
    nodes.push({ id: 'r_elbow', x: limbLength * 0.6, y: -height * 0.28, radius: 2.5, parentId: 'r_shoulder' })
    nodes.push({ id: 'r_hand', x: limbLength, y: -height * 0.18, radius: 2, parentId: 'r_elbow' })
    edges.push({ from: 'chest', to: 'r_shoulder', width: 3, stiffness: 0.3 })
    edges.push({ from: 'r_shoulder', to: 'r_elbow', width: 2.5, stiffness: 0.5 })
    edges.push({ from: 'r_elbow', to: 'r_hand', width: 2, stiffness: 0.5 })

    // Legs
    nodes.push({ id: 'l_knee', x: -5, y: height * 0.25, radius: 3, parentId: 'hip' })
    nodes.push({ id: 'l_foot', x: -5, y: height * 0.5, radius: 2.5, parentId: 'l_knee' })
    edges.push({ from: 'hip', to: 'l_knee', width: 3, stiffness: 0.3 })
    edges.push({ from: 'l_knee', to: 'l_foot', width: 2.5, stiffness: 0.3 })

    nodes.push({ id: 'r_knee', x: 5, y: height * 0.25, radius: 3, parentId: 'hip' })
    nodes.push({ id: 'r_foot', x: 5, y: height * 0.5, radius: 2.5, parentId: 'r_knee' })
    edges.push({ from: 'hip', to: 'r_knee', width: 3, stiffness: 0.3 })
    edges.push({ from: 'r_knee', to: 'r_foot', width: 2.5, stiffness: 0.3 })

    return { nodes, edges, physics: false }
  }

  /** Generate a crystal skeleton — radial lattice */
  private generateCrystalSkeleton(params: Record<string, unknown>): FieldSkeleton {
    const points = (params.points as number) || 6
    const layers = (params.layers as number) || 3

    const nodes: SkeletonNode[] = []
    const edges: SkeletonEdge[] = []

    // Center node
    nodes.push({ id: 'center', x: 0, y: 0, radius: 4, parentId: null })

    for (let layer = 1; layer <= layers; layer++) {
      const layerRadius = layer * 12
      const nodeRadius = 3 / layer
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2
        const id = `l${layer}_${i}`
        const parentId = layer === 1 ? 'center' : `l${layer - 1}_${i}`
        nodes.push({
          id,
          x: Math.cos(angle) * layerRadius,
          y: Math.sin(angle) * layerRadius,
          radius: nodeRadius,
          parentId,
        })
        edges.push({ from: parentId, to: id, width: nodeRadius, stiffness: 0.2 })

        // Connect adjacent nodes in same layer
        if (i > 0) {
          const prevId = `l${layer}_${i - 1}`
          edges.push({ from: prevId, to: id, width: nodeRadius * 0.5, stiffness: 0.3 })
        }
      }
      // Close the ring
      if (points > 2) {
        edges.push({ from: `l${layer}_${points - 1}`, to: `l${layer}_0`, width: nodeRadius * 0.5, stiffness: 0.3 })
      }
    }

    return { nodes, edges, physics: false }
  }

  /** Generate a vine skeleton — sinuous curve */
  private generateVineSkeleton(params: Record<string, unknown>): FieldSkeleton {
    const length = (params.length as number) || 80
    const curvature = (params.curvature as number) || 0.3
    const segments = (params.segments as number) || 12

    const nodes: SkeletonNode[] = []
    const edges: SkeletonEdge[] = []
    const segLen = length / segments

    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const x = Math.sin(t * Math.PI * 2 * curvature) * length * 0.3
      const y = -i * segLen
      const radius = 2 + (1 - t) * 3
      const id = `v${i}`
      const parentId = i === 0 ? null : `v${i - 1}`
      nodes.push({ id, x, y, radius, parentId })
      if (i > 0) {
        edges.push({ from: `v${i - 1}`, to: id, width: radius, stiffness: 0.4 + t * 0.5 })
      }
    }

    return { nodes, edges, physics: false }
  }

  /** Generate a star burst skeleton — radial spikes */
  private generateStarBurstSkeleton(params: Record<string, unknown>): FieldSkeleton {
    const rays = (params.rays as number) || 8
    const length = (params.length as number) || 30
    const taper = (params.taper as number) || 0.3

    const nodes: SkeletonNode[] = []
    const edges: SkeletonEdge[] = []

    nodes.push({ id: 'center', x: 0, y: 0, radius: 5, parentId: null })

    for (let i = 0; i < rays; i++) {
      const angle = (i / rays) * Math.PI * 2
      const tipId = `ray${i}`
      nodes.push({
        id: tipId,
        x: Math.cos(angle) * length,
        y: Math.sin(angle) * length,
        radius: 5 * taper,
        parentId: 'center',
      })
      edges.push({ from: 'center', to: tipId, width: 3, stiffness: 0.6 })
    }

    return { nodes, edges, physics: false }
  }

  /** Skeleton physics — spring forces, gravity, wind on nodes */
  private stepSkeletonPhysics(dt: number): void {
    const wp = this.worldParams

    for (const field of this.fields.values()) {
      if (!field.skeleton?.physics) continue
      const skel = field.skeleton

      // Build node index for fast lookup
      const nodeMap = new Map<string, SkeletonNode>()
      const nodeVel = new Map<string, { vx: number; vy: number }>()
      for (const node of skel.nodes) {
        nodeMap.set(node.id, node)
        if (!nodeVel.has(node.id)) {
          // Store velocity in node properties
          const props = node.properties || (node.properties = {})
          nodeVel.set(node.id, {
            vx: (props._vx as number) || 0,
            vy: (props._vy as number) || 0,
          })
        }
      }

      // Spring forces along edges (Hooke's law)
      for (const edge of skel.edges) {
        const a = nodeMap.get(edge.from)
        const b = nodeMap.get(edge.to)
        if (!a || !b) continue

        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 0.01) continue

        // Compute and cache rest length from initial positions
        if (edge.restLength === undefined || edge.restLength <= 0) {
          edge.restLength = dist
        }

        const displacement = dist - edge.restLength
        const springK = (1 - edge.stiffness) * 80
        const force = springK * displacement

        const nx = dx / dist
        const ny = dy / dist

        const va = nodeVel.get(edge.from)!
        const vb = nodeVel.get(edge.to)!

        // Root nodes are anchored (parentId === null)
        if (a.parentId !== null) {
          va.vx += nx * force * dt
          va.vy += ny * force * dt
        }
        if (b.parentId !== null) {
          vb.vx -= nx * force * dt
          vb.vy -= ny * force * dt
        }
      }

      // Apply gravity and wind to non-root nodes
      for (const node of skel.nodes) {
        if (node.parentId === null) continue // root is anchored
        const vel = nodeVel.get(node.id)!

        // Gravity (scaled down for skeleton-local coords)
        vel.vy += wp.gravity * dt * 0.1

        // Wind (stronger on leaf nodes — nodes with no children)
        if (wp.windX || wp.windY) {
          const isLeaf = !skel.edges.some(e => e.from === node.id)
          const windMult = isLeaf ? 1.0 : 0.3
          vel.vx += (wp.windX || 0) * windMult * dt
          vel.vy += (wp.windY || 0) * windMult * dt
        }

        // Damping
        vel.vx *= 0.92
        vel.vy *= 0.92

        // Integrate
        node.x += vel.vx * dt
        node.y += vel.vy * dt

        // Store back
        const props = node.properties || (node.properties = {})
        props._vx = vel.vx
        props._vy = vel.vy
      }
    }
  }

  /** Pack skeleton data into a Float32Array for GPU upload.
   *  128 pixels * 4 floats = 512 floats. Each pixel = one node: (x, y, radius, parentIndex) */
  packSkeletonTexture(field: Field): Float32Array {
    const data = new Float32Array(FieldSimulation.MAX_SKELETON_NODES * 4)
    if (!field.skeleton) return data

    const skel = field.skeleton
    const t = field.transform

    // Build index map for parent lookup
    const indexMap = new Map<string, number>()
    for (let i = 0; i < skel.nodes.length; i++) {
      indexMap.set(skel.nodes[i].id, i)
    }

    const cosR = Math.cos(t.rotation)
    const sinR = Math.sin(t.rotation)

    for (let i = 0; i < skel.nodes.length && i < FieldSimulation.MAX_SKELETON_NODES; i++) {
      const node = skel.nodes[i]
      // Rotate node position by field rotation, then translate to world space
      const rx = node.x * cosR - node.y * sinR
      const ry = node.x * sinR + node.y * cosR
      const base = i * 4
      data[base] = t.x + rx
      data[base + 1] = t.y + ry
      data[base + 2] = node.radius * t.scale
      data[base + 3] = node.parentId ? (indexMap.get(node.parentId) ?? -1) : -1
    }

    return data
  }

}
