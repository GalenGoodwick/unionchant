// Field Engine — Simulation (CPU-side, cell-based)

import { GRID_SIZE, type FieldWorld, type Field, type FieldTransform, type FieldEffect, type FieldMemoryEntry, type FieldSnapshot, type FieldProximity, type WorldParams, type InteractionRule, type CustomCommand } from './types'

export class FieldSimulation {
  world: FieldWorld
  fields: Map<string, Field>
  running: boolean = false
  private fieldMemory: Map<string, FieldMemoryEntry[]> = new Map()
  private moveAccumulator: Map<string, { ax: number; ay: number }> = new Map()
  private collisionState: Map<string, Set<string>> = new Map()
  /** Agent-defined interaction rules — executed each physics tick */
  interactionRules: InteractionRule[] = []
  /** Agent-defined custom commands — macros of existing commands */
  customCommands: Map<string, CustomCommand> = new Map()
  /** Agent-defined step hooks — JavaScript functions that run every simulation tick */
  stepHooks: Map<string, { author: string; description: string; fn: (sim: FieldSimulation, dt: number) => void }> = new Map()
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
      this.createField(snap.id, snap.name, snap.color)
      const field = this.fields.get(snap.id)
      if (!field) continue
      // Restore transform
      Object.assign(field.transform, snap.transform)
      // Restore effects
      if (snap.effects?.length) {
        field.effects = snap.effects.map(e => ({ ...e }))
      }
      // Restore memory
      if (snap.memory?.length) {
        this.fieldMemory.set(snap.id, [...snap.memory])
      }
      // Restore cells — paint them back onto the grid
      if (snap.cells?.length) {
        this.paintCells(snap.id, snap.cells, snap.color)
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

  /** Create a new field (empty — no cells until painted) */
  createField(id: string, name: string, color: [number, number, number, number]): Field {
    const field: Field = {
      id,
      name,
      color,
      cells: new Set(),
      transform: FieldSimulation.defaultTransform(),
      effects: [],
    }
    this.fields.set(id, field)
    this.addMemory(id, {
      timestamp: new Date().toISOString(),
      type: 'created',
      content: `Field "${name}" created`,
      sourceFieldId: null,
    })
    return field
  }

  /** Remove a field and clear its cells */
  removeField(id: string): void {
    const field = this.fields.get(id)
    if (!field) return

    for (const cellIndex of field.cells) {
      const base = cellIndex * 4
      this.world.colorData[base] = 0
      this.world.colorData[base + 1] = 0
      this.world.colorData[base + 2] = 0
      this.world.colorData[base + 3] = 0
      this.world.stateData[base] = 0
      this.world.stateData[base + 1] = 0
      this.world.stateData[base + 2] = 0
      this.world.stateData[base + 3] = 0
    }

    this.fields.delete(id)
    this.clearMemory(id)
  }

  /** Paint field influence onto cells */
  paintCells(fieldId: string, cellIndices: number[], color: [number, number, number, number]): void {
    const field = this.fields.get(fieldId)
    if (!field) return

    for (const idx of cellIndices) {
      if (idx < 0 || idx >= GRID_SIZE * GRID_SIZE) continue
      const base = idx * 4
      this.world.colorData[base] = color[0]
      this.world.colorData[base + 1] = color[1]
      this.world.colorData[base + 2] = color[2]
      this.world.colorData[base + 3] = color[3]

      // State: R=1.0 (occupied), G=fieldTypeHash, B=0, A=0
      this.world.stateData[base] = 1.0
      this.world.stateData[base + 1] = this.fieldTypeHash(fieldId)
      this.world.stateData[base + 2] = 0
      this.world.stateData[base + 3] = 0

      field.cells.add(idx)
    }
  }

  /** Clear cells */
  eraseCells(cellIndices: number[]): void {
    for (const idx of cellIndices) {
      if (idx < 0 || idx >= GRID_SIZE * GRID_SIZE) continue
      const base = idx * 4
      this.world.colorData[base] = 0
      this.world.colorData[base + 1] = 0
      this.world.colorData[base + 2] = 0
      this.world.colorData[base + 3] = 0
      this.world.stateData[base] = 0
      this.world.stateData[base + 1] = 0
      this.world.stateData[base + 2] = 0
      this.world.stateData[base + 3] = 0

      // Remove from all fields
      for (const field of this.fields.values()) {
        field.cells.delete(idx)
      }
    }
  }

  /** Hash field ID to a float for state texture identification */
  private fieldTypeHash(fieldId: string): number {
    let hash = 0
    for (let i = 0; i < fieldId.length; i++) {
      hash = ((hash << 5) - hash + fieldId.charCodeAt(i)) | 0
    }
    return (Math.abs(hash) % 1000) / 1000
  }

  /** Clear everything */
  clearAll(): void {
    this.world.colorData.fill(0)
    this.world.stateData.fill(0)
    for (const field of this.fields.values()) {
      field.cells.clear()
    }
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

    // Apply gravity to all fields with cells
    if (wp.gravity !== 0) {
      for (const field of this.fields.values()) {
        if (field.cells.size === 0) continue
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

    // Boundary enforcement
    if (wp.boundaryMode === 'solid') {
      this.stepBoundaries()
    }

    // Update field transforms (velocity → position)
    this.stepTransforms(dt)

    // Physical cell movement — accumulate velocity, shift cells when delta >= 1
    for (const field of this.fields.values()) {
      if (field.transform.vx === 0 && field.transform.vy === 0) continue
      const acc = this.moveAccumulator.get(field.id) || { ax: 0, ay: 0 }
      acc.ax += field.transform.vx * dt
      acc.ay += field.transform.vy * dt
      const dx = Math.trunc(acc.ax)
      const dy = Math.trunc(acc.ay)
      if (dx !== 0 || dy !== 0) {
        this.moveField(field.id, dx, dy)
        acc.ax -= dx
        acc.ay -= dy
      }
      this.moveAccumulator.set(field.id, acc)
    }
  }

  /** Detect collisions between fields and fire events + apply forces */
  private stepCollisions(dt: number): void {
    const fieldList = Array.from(this.fields.values()).filter(f => f.cells.size > 0)
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

    const fieldList = Array.from(this.fields.values()).filter(f => f.cells.size > 0)

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

  /** Enforce solid boundaries — bounce fields off grid edges */
  private stepBoundaries(): void {
    const wp = this.worldParams
    for (const field of this.fields.values()) {
      if (field.cells.size === 0) continue
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

  /** Register a step hook — runs every simulation tick */
  addStepHook(id: string, author: string, description: string, code: string): boolean {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('sim', 'dt', code) as (sim: FieldSimulation, dt: number) => void
      this.stepHooks.set(id, { author, description, fn })
      return true
    } catch (e) {
      console.warn(`Failed to compile step hook ${id}:`, e)
      return false
    }
  }

  /** Remove a step hook */
  removeStepHook(id: string): void {
    this.stepHooks.delete(id)
  }

  /** Given a grid coordinate, return the field that contains it, or null */
  getFieldAtCell(x: number, y: number): Field | null {
    const idx = y * GRID_SIZE + x
    for (const field of this.fields.values()) {
      if (field.cells.has(idx)) return field
    }
    return null
  }

  /** Get the axis-aligned bounding box of a field's cells */
  getFieldBounds(fieldId: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const field = this.fields.get(fieldId)
    if (!field || field.cells.size === 0) return null

    let minX = GRID_SIZE, minY = GRID_SIZE, maxX = 0, maxY = 0
    for (const idx of field.cells) {
      const x = idx % GRID_SIZE
      const y = Math.floor(idx / GRID_SIZE)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    // Apply transform offset
    const t = field.transform
    return {
      minX: minX + t.x,
      minY: minY + t.y,
      maxX: maxX + t.x,
      maxY: maxY + t.y,
    }
  }

  /** Get the center of a field's cells */
  getFieldCenter(fieldId: string): { x: number; y: number } | null {
    const bounds = this.getFieldBounds(fieldId)
    if (!bounds) return null
    return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
  }

  /** Teleport a field to an absolute grid position (moves cells) */
  setPosition(fieldId: string, x: number, y: number): void {
    const field = this.fields.get(fieldId)
    if (!field || field.cells.size === 0) return
    const bounds = this.getFieldBounds(fieldId)
    if (!bounds) return
    const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
    const dx = Math.round(x - center.x)
    const dy = Math.round(y - center.y)
    if (dx !== 0 || dy !== 0) {
      this.moveField(fieldId, dx, dy)
    }
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

  /** Read state data at a grid position */
  readData(x: number, y: number): [number, number, number, number] {
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return [0, 0, 0, 0]
    const base = (Math.floor(y) * GRID_SIZE + Math.floor(x)) * 4
    return [
      this.world.stateData[base],
      this.world.stateData[base + 1],
      this.world.stateData[base + 2],
      this.world.stateData[base + 3],
    ]
  }

  /** Physically relocate all cells in a field by (dx, dy) grid units */
  moveField(fieldId: string, dx: number, dy: number): void {
    const field = this.fields.get(fieldId)
    if (!field) return
    const oldCells = Array.from(field.cells)
    const newCells: number[] = []

    // Clear old cells
    for (const idx of oldCells) {
      const base = idx * 4
      this.world.colorData[base] = 0
      this.world.colorData[base + 1] = 0
      this.world.colorData[base + 2] = 0
      this.world.colorData[base + 3] = 0
      this.world.stateData[base] = 0
      this.world.stateData[base + 1] = 0
    }
    field.cells.clear()

    // Paint new cells at shifted positions
    for (const idx of oldCells) {
      const x = (idx % GRID_SIZE) + dx
      const y = Math.floor(idx / GRID_SIZE) + dy
      if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
        newCells.push(y * GRID_SIZE + x)
      }
    }

    this.paintCells(fieldId, newCells, field.color)
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
        const data = this.readData(center.x, center.y)
        stateAtCenter = { r: data[0], g: data[1], b: data[2], a: data[3] }
      }
      snapshots.push({
        id: field.id,
        name: field.name,
        color: field.color,
        cellCount: field.cells.size,
        cells: Array.from(field.cells),
        bounds,
        effects: field.effects.map(e => ({
          id: e.id, author: e.author, glsl: e.glsl,
          description: e.description, blend: e.blend, order: e.order,
        })),
        transform: { ...field.transform },
        memory: [...this.getMemory(field.id)],
        proximity: this.getProximity(field.id),
        stateAtCenter,
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

  /** Generate a mask Uint8Array for a field's cells (for shader pass) */
  generateCellMask(fieldId: string): Uint8Array | null {
    const field = this.fields.get(fieldId)
    if (!field || field.cells.size === 0) return null
    const mask = new Uint8Array(GRID_SIZE * GRID_SIZE)
    for (const idx of field.cells) {
      mask[idx] = 255
    }
    return mask
  }
}
