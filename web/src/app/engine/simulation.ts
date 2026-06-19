// Field Engine — Simulation (CPU-side, Phase 1)

import { GRID_SIZE, type FieldWorld, type Field, type FieldTransform, type FieldMemoryEntry, type FieldSnapshot, type FieldProximity, type WorldParams } from './types'

export class FieldSimulation {
  world: FieldWorld
  fields: Map<string, Field>
  running: boolean = false
  private diffusionRate: number = 0.02
  private fieldMemory: Map<string, FieldMemoryEntry[]> = new Map()
  private moveAccumulator: Map<string, { ax: number; ay: number }> = new Map()
  private collisionState: Map<string, Set<string>> = new Map() // tracks which field pairs are currently colliding
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
      // Restore GLSL
      field.glsl = snap.glsl
      field.effectDescription = snap.effectDescription
      // Restore properties
      for (const [key, prop] of Object.entries(snap.properties)) {
        field.properties.set(key, { name: prop.name, value: prop.value, min: prop.min, max: prop.max })
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

  /** Create a new field */
  createField(id: string, name: string, color: [number, number, number, number]): Field {
    const field: Field = {
      id,
      name,
      color,
      cells: new Set(),
      properties: new Map(),
      transform: FieldSimulation.defaultTransform(),
      glsl: null,
      effectDescription: null,
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

      // State: R=fieldWeight(1.0), G=fieldType(hash), B=0, A=0
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
        // Stop tiny velocities
        if (Math.abs(field.transform.vx) < 0.01) field.transform.vx = 0
        if (Math.abs(field.transform.vy) < 0.01) field.transform.vy = 0
        if (Math.abs(field.transform.vr) < 0.001) field.transform.vr = 0
      }
    }

    // Collision detection + collision force between overlapping fields
    this.stepCollisions(dt)

    // Boundary enforcement
    if (wp.boundaryMode === 'solid') {
      this.stepBoundaries()
    }

    // Update field transforms (velocity-driven visual movement)
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

    // Phase 1: simple diffusion — colors bleed into neighboring empty cells
    const size = GRID_SIZE
    const src = this.world.colorData
    // Work on a copy to avoid read-modify conflicts
    const dst = new Float32Array(src)

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const idx = y * size + x
        const base = idx * 4

        // Only diffuse if this cell has color (alpha > 0)
        if (src[base + 3] <= 0) continue

        const weight = src[base + 3]
        const rate = this.diffusionRate * dt

        // 4-neighbor diffusion (Von Neumann neighborhood)
        const neighbors = [
          ((y - 1) * size + x) * 4, // up
          ((y + 1) * size + x) * 4, // down
          (y * size + (x - 1)) * 4, // left
          (y * size + (x + 1)) * 4, // right
        ]

        for (const nBase of neighbors) {
          // Only diffuse into empty cells
          if (src[nBase + 3] > 0.001) continue

          const spread = rate * weight * 0.25 // split among 4 neighbors
          dst[nBase] += src[base] * spread
          dst[nBase + 1] += src[base + 1] * spread
          dst[nBase + 2] += src[base + 2] * spread
          dst[nBase + 3] += spread
        }

        // Slightly reduce source cell alpha to simulate diffusion loss
        dst[base + 3] -= rate * weight * 0.1
        if (dst[base + 3] < 0) dst[base + 3] = 0
      }
    }

    // Copy result back
    this.world.colorData.set(dst)
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

        const pairKey = [a.id, b.id].sort().join(':')
        const wasColliding = this.collisionState.get(a.id)?.has(b.id) || false

        if (overlapping && !wasColliding) {
          // New collision — fire events
          if (!this.collisionState.has(a.id)) this.collisionState.set(a.id, new Set())
          if (!this.collisionState.has(b.id)) this.collisionState.set(b.id, new Set())
          this.collisionState.get(a.id)!.add(b.id)
          this.collisionState.get(b.id)!.add(a.id)

          this.addMemory(a.id, {
            timestamp: new Date().toISOString(),
            type: 'collision',
            content: `Collision with ${b.name} (overlap: ${Math.min(overlapX, overlapY)}px)`,
            sourceFieldId: b.id,
            data: { overlapX, overlapY, otherFieldId: b.id, otherFieldName: b.name },
          })
          this.addMemory(b.id, {
            timestamp: new Date().toISOString(),
            type: 'collision',
            content: `Collision with ${a.name} (overlap: ${Math.min(overlapX, overlapY)}px)`,
            sourceFieldId: a.id,
            data: { overlapX, overlapY, otherFieldId: a.id, otherFieldName: a.name },
          })
        } else if (!overlapping && wasColliding) {
          // Collision ended
          this.collisionState.get(a.id)?.delete(b.id)
          this.collisionState.get(b.id)?.delete(a.id)
        }

        // Apply collision force if overlapping
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

          // Positive collisionForce = repel, negative = attract
          a.transform.vx -= dx * forceMag
          a.transform.vy -= dy * forceMag
          b.transform.vx += dx * forceMag
          b.transform.vy += dy * forceMag
        }
      }
    }
  }

  /** Enforce solid boundaries — bounce fields off grid edges */
  private stepBoundaries(): void {
    const wp = this.worldParams
    for (const field of this.fields.values()) {
      if (field.cells.size === 0) continue
      const bounds = this.getFieldBounds(field.id)
      if (!bounds) continue

      // Left wall
      if (bounds.minX <= 0 && field.transform.vx < 0) {
        field.transform.vx = -field.transform.vx * wp.bounciness
      }
      // Right wall
      if (bounds.maxX >= GRID_SIZE - 1 && field.transform.vx > 0) {
        field.transform.vx = -field.transform.vx * wp.bounciness
      }
      // Top wall
      if (bounds.minY <= 0 && field.transform.vy < 0) {
        field.transform.vy = -field.transform.vy * wp.bounciness
      }
      // Bottom wall
      if (bounds.maxY >= GRID_SIZE - 1 && field.transform.vy > 0) {
        field.transform.vy = -field.transform.vy * wp.bounciness
      }
    }
  }

  /** Given a cell index, return the field that owns it, or null */
  getFieldAtCell(cellIndex: number): Field | null {
    if (cellIndex < 0 || cellIndex >= GRID_SIZE * GRID_SIZE) return null
    const base = cellIndex * 4
    if (this.world.colorData[base + 3] <= 0) return null
    for (const field of this.fields.values()) {
      if (field.cells.has(cellIndex)) return field
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
    return { minX, minY, maxX, maxY }
  }

  /** Set or clear a field's GLSL effect */
  setFieldEffect(fieldId: string, glsl: string | null, description: string | null): void {
    const field = this.fields.get(fieldId)
    if (!field) return
    field.glsl = glsl
    field.effectDescription = description
    if (glsl) {
      this.addMemory(fieldId, {
        timestamp: new Date().toISOString(),
        type: 'effect_set',
        content: `Effect set: ${description || 'custom GLSL'}`,
        sourceFieldId: null,
        data: { glslLength: glsl.length },
      })
    } else {
      this.addMemory(fieldId, {
        timestamp: new Date().toISOString(),
        type: 'effect_cleared',
        content: 'Effect cleared',
        sourceFieldId: null,
      })
    }
  }

  /** Return all fields that have an active GLSL effect */
  getFieldsWithEffects(): Field[] {
    const result: Field[] = []
    for (const field of this.fields.values()) {
      if (field.glsl !== null) result.push(field)
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

  /** Physically relocate all cells in a field by (dx, dy) grid units */
  moveField(fieldId: string, dx: number, dy: number): void {
    const field = this.fields.get(fieldId)
    if (!field || (dx === 0 && dy === 0)) return

    const oldCells = Array.from(field.cells)
    const newCells: number[] = []

    // Clear old positions directly (no iterating other fields)
    for (const idx of oldCells) {
      const base = idx * 4
      this.world.colorData[base] = 0
      this.world.colorData[base + 1] = 0
      this.world.colorData[base + 2] = 0
      this.world.colorData[base + 3] = 0
      this.world.stateData[base] = 0
      this.world.stateData[base + 1] = 0
      this.world.stateData[base + 2] = 0
      this.world.stateData[base + 3] = 0
    }

    // Compute new positions
    field.cells.clear()
    for (const idx of oldCells) {
      const x = idx % GRID_SIZE
      const y = Math.floor(idx / GRID_SIZE)
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue
      newCells.push(ny * GRID_SIZE + nx)
    }

    // Paint at new positions
    this.paintCells(fieldId, newCells, field.color)
  }

  /** Get proximity info for a field relative to all other fields */
  getProximity(fieldId: string): FieldProximity[] {
    const field = this.fields.get(fieldId)
    if (!field) return []
    const myBounds = this.getFieldBounds(fieldId)
    if (!myBounds) return []
    const myCenterX = (myBounds.minX + myBounds.maxX) / 2
    const myCenterY = (myBounds.minY + myBounds.maxY) / 2

    const result: FieldProximity[] = []
    for (const other of this.fields.values()) {
      if (other.id === fieldId) continue
      const ob = this.getFieldBounds(other.id)
      if (!ob) continue
      const otherCenterX = (ob.minX + ob.maxX) / 2
      const otherCenterY = (ob.minY + ob.maxY) / 2

      // AABB edge distance
      const gapX = Math.max(myBounds.minX - ob.maxX, ob.minX - myBounds.maxX, 0)
      const gapY = Math.max(myBounds.minY - ob.maxY, ob.minY - myBounds.maxY, 0)
      const overlapX = Math.min(myBounds.maxX, ob.maxX) - Math.max(myBounds.minX, ob.minX)
      const overlapY = Math.min(myBounds.maxY, ob.maxY) - Math.max(myBounds.minY, ob.minY)
      const overlapping = overlapX > 0 && overlapY > 0
      const distance = overlapping
        ? -Math.min(overlapX, overlapY)
        : Math.round(Math.sqrt(gapX * gapX + gapY * gapY))

      // Direction toward other field
      const dirX = otherCenterX - myCenterX
      const dirY = otherCenterY - myCenterY
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

  /** Get current world params for serialization */
  getWorldParams(): WorldParams {
    return { ...this.worldParams }
  }

  /** Serialize all fields to snapshots for the state store */
  generateSnapshots(): FieldSnapshot[] {
    const snapshots: FieldSnapshot[] = []
    for (const field of this.fields.values()) {
      const bounds = this.getFieldBounds(field.id)
      const properties: Record<string, { name: string; value: number; min?: number; max?: number }> = {}
      for (const [key, prop] of field.properties) {
        properties[key] = { name: prop.name, value: prop.value, min: prop.min, max: prop.max }
      }
      snapshots.push({
        id: field.id,
        name: field.name,
        color: field.color,
        cellCount: field.cells.size,
        cells: Array.from(field.cells),
        bounds,
        glsl: field.glsl,
        effectDescription: field.effectDescription,
        transform: { ...field.transform },
        properties,
        memory: [...this.getMemory(field.id)],
        proximity: this.getProximity(field.id),
      })
    }
    return snapshots
  }

  /** Simple hash to give each field a unique type value in [0,1] */
  private fieldTypeHash(id: string): number {
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
    }
    return (Math.abs(hash) % 1000) / 1000
  }
}
