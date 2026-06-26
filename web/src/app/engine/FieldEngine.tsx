'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { FieldRenderer } from './renderer'
import type { FieldEffectData } from './renderer'
import { FieldSimulation } from './simulation'
import { FieldInput } from './input'
import Toolbar from './Toolbar'
import PromptPanel from './PromptPanel'
import AgentDialogPanel from './AgentDialogPanel'
import type { DialogEntry } from './AgentDialogPanel'
import AgentTerminalPanel from './AgentTerminalPanel'
import type { TerminalEntry } from './AgentTerminalPanel'
import type { BrushState, Camera, Field, FieldEffect, SelectionState, GenerationState, InteractionEffect, CameraFollow, HudElement, SuperFieldGPU } from './types'
import { DEFAULT_GRID_SIZE } from './types'
import { GameAudio } from './audio'
import { useToast } from '@/components/Toast'
// DEFAULT_FIELD_EFFECT_GLSL removed — fields are invisible until agents give them a shader

let fieldCounter = 0
function genFieldId() {
  return `field_${++fieldCounter}_${Date.now()}`
}

let effectCounter = 0
function genEffectId() {
  return `effect_${++effectCounter}_${Date.now()}`
}

/** Convert screen pixel coordinates to float grid coordinates (no flooring) */
function screenToGrid(
  screenX: number, screenY: number,
  canvasRect: DOMRect,
  camera: { x: number; y: number },
  zoom: number,
  gridSize: number = DEFAULT_GRID_SIZE
): { x: number; y: number } {
  const normX = (screenX - canvasRect.left) / canvasRect.width
  const normY = (screenY - canvasRect.top) / canvasRect.height
  const aspect = canvasRect.width / canvasRect.height
  const gridRange = gridSize / zoom

  if (aspect > 1) {
    return {
      x: camera.x + (normX - 0.5) * gridRange * aspect,
      y: camera.y + (normY - 0.5) * gridRange,
    }
  } else {
    return {
      x: camera.x + (normX - 0.5) * gridRange,
      y: camera.y + (normY - 0.5) * gridRange / aspect,
    }
  }
}

const DEFAULT_HUES = [190, 30, 120, 280, 0, 60, 330, 210]

function hueToRgba(hue: number): [number, number, number, number] {
  const h = hue / 360
  const s = 0.75
  const l = 0.6
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 1/6) { r = c; g = x }
  else if (h < 2/6) { r = x; g = c }
  else if (h < 3/6) { g = c; b = x }
  else if (h < 4/6) { g = x; b = c }
  else if (h < 5/6) { r = x; b = c }
  else { r = c; b = x }
  return [r + m, g + m, b + m, 1.0]
}

/** Wrap interaction WGSL for the field effect pipeline.
 *  Interaction shaders define `fn interactionEffect(coord, regionMin, regionMax, time, params) → vec4f`.
 *  This wrapper adapts it to `fn fieldEffect(...)` expected by the field pipeline. */
function wrapInteractionWgsl(interactionWgsl: string): string {
  return `
// Per-pixel overlap mask: 1.0 where both parent fields' dilated presence overlaps, 0.0 elsewhere.
fn overlapMask(coord: vec2f) -> f32 {
  return textureSample(fieldMask, texSampler, coord / frame.gridSize).r;
}

${interactionWgsl}

fn fieldEffect(coord: vec2f, regionMin: vec2f, regionMax: vec2f, time: f32, params: vec4f) -> vec4f {
  let eff = interactionEffect(coord, regionMin, regionMax, time, params);
  let mask = overlapMask(coord);
  return vec4f(eff.rgb, eff.a * mask);
}`
}

export default function FieldEngine() {
  const { showToast } = useToast()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<FieldRenderer | null>(null)
  const simulationRef = useRef<FieldSimulation | null>(null)
  const inputRef = useRef<FieldInput | null>(null)
  const animFrameRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)
  const lastFrameRef = useRef<number>(0)
  const lastSampleTimeRef = useRef<number>(0)
  const lastPresenceRef = useRef<number>(0)
  const cachedOverlapMasksRef = useRef<Map<string, Uint8Array>>(new Map())
  const renderedSamplesRef = useRef<Map<string, { width: number; height: number; pixels: number[] }>>(new Map())

  // WGSL mods — reusable shader utilities registered by agents
  const wgslModsRef = useRef<Map<string, { id: string; code: string }>>(new Map())

  // Camera follow mode
  const cameraFollowRef = useRef<CameraFollow | null>(null)

  // Audio system
  const audioRef = useRef<GameAudio>(new GameAudio())

  // HUD elements (driven by worldData['hud'])
  const hudContainerRef = useRef<HTMLDivElement>(null)

  // Camera
  const gridSize = DEFAULT_GRID_SIZE
  const cameraRef = useRef<Camera>({ x: gridSize / 2, y: gridSize / 2, zoom: 1 })
  const [, forceUpdate] = useState(0)

  // Brush state
  const [brush, setBrush] = useState<BrushState>({
    tool: 'brush',
    size: 4,
    activeFieldId: null,
  })

  // Fields (mirrored from simulation for React rendering)
  const [fields, setFields] = useState<Map<string, Field>>(new Map())
  const [running, setRunning] = useState(false)

  // Selection state
  const [selection, setSelection] = useState<SelectionState>({
    selectedFieldId: null,
    selectionMask: new Uint8Array(DEFAULT_GRID_SIZE * DEFAULT_GRID_SIZE),
  })

  // Generation state — UI-only loading tracker, WGSL lives on Field objects
  const [generation, setGeneration] = useState<GenerationState>({
    loading: false,
    error: null,
    targetFieldId: null,
  })

  // Pointer state for panning (Space + drag to pan)
  const pointerDown = useRef(false)
  const isPanning = useRef(false)
  const spaceHeld = useRef(false)
  const lastPointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // Drag state for fields
  const draggingFieldId = useRef<string | null>(null)
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const dragStartScreen = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // Pixel hover tooltip
  const [pixelInfo, setPixelInfo] = useState<{
    screenX: number; screenY: number
    gridX: number; gridY: number
    r: number; g: number; b: number; a: number
    fields: string[]
  } | null>(null)
  const pixelInfoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Get concatenated WGSL mod code from all registered mods */
  const getModCode = useCallback((): string | undefined => {
    const mods = wgslModsRef.current
    if (mods.size === 0) return undefined
    return Array.from(mods.values()).map(m => m.code).join('\n')
  }, [])

  // Sync fields from simulation to React state
  const syncFields = useCallback(() => {
    const sim = simulationRef.current
    if (!sim) return
    setFields(new Map(sim.fields))
  }, [])

  // Update selection mask and upload to GPU
  const updateSelectionMask = useCallback((fieldId: string | null) => {
    const renderer = rendererRef.current
    if (!renderer) return
    const mask = new Uint8Array(gridSize * gridSize)
    renderer.uploadSelectionData(mask)
    setSelection({ selectedFieldId: fieldId, selectionMask: mask })
  }, [])

  // No default shader — fields are invisible until an agent adds an effect

  // Create field
  const handleCreateField = useCallback(() => {
    const sim = simulationRef.current
    if (!sim) return
    const id = genFieldId()
    const hue = DEFAULT_HUES[sim.fields.size % DEFAULT_HUES.length]
    const color = hueToRgba(hue)
    const name = `Field ${sim.fields.size + 1}`
    sim.createField(id, name, color)

    setBrush(prev => ({ ...prev, activeFieldId: id }))
    syncFields()
  }, [syncFields])

  // Delete field — removes all effects
  const handleDeleteField = useCallback((id: string) => {
    const sim = simulationRef.current
    const renderer = rendererRef.current
    if (!sim) return

    // Remove all effect programs for this field
    if (renderer) renderer.removeAllFieldEffects(id)

    sim.removeField(id)
    if (selection.selectedFieldId === id) {
      updateSelectionMask(null)
    }
    setBrush(prev => {
      if (prev.activeFieldId === id) {
        const remaining = Array.from(sim.fields.keys())
        return { ...prev, activeFieldId: remaining[0] || null }
      }
      return prev
    })
    syncFields()
  }, [syncFields, selection.selectedFieldId, updateSelectionMask])

  // Select field (toolbar click)
  const handleSelectField = useCallback((id: string) => {
    setBrush(prev => ({ ...prev, activeFieldId: id }))
  }, [])

  // Change field color — just update color, shader uses params
  const handleFieldColorChange = useCallback((id: string, color: [number, number, number, number]) => {
    const sim = simulationRef.current
    if (!sim) return
    const field = sim.fields.get(id)
    if (!field) return
    field.color = color
    syncFields()
  }, [syncFields])

  // Toggle simulation
  const handleToggleRunning = useCallback(() => {
    const sim = simulationRef.current
    if (!sim) return
    sim.running = !sim.running
    setRunning(sim.running)
  }, [])

  // Clear all — removes all effects from all fields
  const handleClear = useCallback(() => {
    const sim = simulationRef.current
    const renderer = rendererRef.current
    if (!sim) return

    // Remove all field effects
    if (renderer) {
      for (const field of sim.fields.values()) {
        renderer.removeAllFieldEffects(field.id)
      }
    }

    sim.clearAll()
    // Clear effects from all fields
    for (const field of sim.fields.values()) {
      field.effects = []
    }
    updateSelectionMask(null)
    setGeneration({ loading: false, error: null, targetFieldId: null })
    syncFields()
  }, [syncFields, updateSelectionMask])

  // Generate AI effect for selected field
  const handleGenerate = useCallback(async (prompt: string) => {
    const sim = simulationRef.current
    const renderer = rendererRef.current
    if (!sim || !renderer || !selection.selectedFieldId) return

    const targetFieldId = selection.selectedFieldId
    setGeneration({ loading: true, error: null, targetFieldId })

    try {
      const bounds = sim.getFieldBounds(targetFieldId)

      const res = await fetch('/api/engine/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, bounds, fieldId: targetFieldId }),
      })

      const data = await res.json()

      if (!res.ok) {
        setGeneration({ loading: false, error: data.error || 'Generation failed', targetFieldId })
        return
      }

      // Add as an effect
      const effectId = genEffectId()
      const programKey = `${targetFieldId}_${effectId}`
      const result = await renderer.compileFieldEffect(programKey, targetFieldId, data.wgsl, getModCode())

      if (result.success) {
        const effect: FieldEffect = {
          id: effectId,
          author: 'user',
          wgsl: data.wgsl,
          description: data.description || 'AI generated',
          blend: 'alpha',
          order: 10,
        }
        sim.addFieldEffect(targetFieldId, effect)

        setGeneration({ loading: false, error: null, targetFieldId: null })
        syncFields()
      } else {
        setGeneration({
          loading: false,
          error: `Shader compile error: ${result.error}`,
          targetFieldId,
        })
      }
    } catch (err) {
      setGeneration({
        loading: false,
        error: err instanceof Error ? err.message : 'Network error',
        targetFieldId,
      })
    }
  }, [selection.selectedFieldId, syncFields])

  // Clear effect for a specific field (or selected field)
  const handleClearEffect = useCallback((targetId?: string) => {
    const sim = simulationRef.current
    const renderer = rendererRef.current
    if (!sim || !renderer) return

    const fieldId = targetId || selection.selectedFieldId
    if (!fieldId) return

    renderer.removeAllFieldEffects(fieldId)
    const field = sim.fields.get(fieldId)
    if (field) {
      field.effects = []
    }
    setGeneration({ loading: false, error: null, targetFieldId: null })
    syncFields()
  }, [selection.selectedFieldId, syncFields])

  // Pointer handlers — canvas is view-only (agents do the painting)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current
    const sim = simulationRef.current
    if (!canvas) return

    pointerDown.current = true
    lastPointer.current = { x: e.clientX, y: e.clientY }

    // Space + click = pan camera
    if (spaceHeld.current) {
      isPanning.current = true
      canvas.style.cursor = 'grabbing'
      return
    }

    // Hit-test: check if pointer is over a field
    if (sim) {
      const rect = canvas.getBoundingClientRect()
      const camera = cameraRef.current
      const grid = screenToGrid(e.clientX, e.clientY, rect, camera, camera.zoom)
      const hitField = sim.getFieldAtPoint(grid.x, grid.y)

      if (hitField) {
        // Walk up to root parent so dragging a child moves the whole group
        let dragTarget = hitField
        while (dragTarget.parentFieldId) {
          const parent = sim.fields.get(dragTarget.parentFieldId)
          if (!parent) break
          dragTarget = parent
        }
        draggingFieldId.current = dragTarget.id
        dragOffset.current = {
          x: dragTarget.transform.x - grid.x,
          y: dragTarget.transform.y - grid.y,
        }
        dragStartScreen.current = { x: e.clientX, y: e.clientY }
        canvas.style.cursor = 'grabbing'
        return
      }
    }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const input = inputRef.current
    const canvas = canvasRef.current
    if (!input || !canvas) return

    const rect = canvas.getBoundingClientRect()
    const camera = cameraRef.current

    // Track mouse grid position for step hooks and agents
    const sim = simulationRef.current
    const gridPos = input.screenToCell(e.clientX, e.clientY, rect, camera, camera.zoom)
    if (sim) {
      sim.worldData['mouse_x'] = gridPos.x
      sim.worldData['mouse_y'] = gridPos.y
      sim.worldData['mouse_down'] = pointerDown.current
    }

    // Dragging a field — update its position and skip panning
    if (draggingFieldId.current && sim) {
      const grid = screenToGrid(e.clientX, e.clientY, rect, camera, camera.zoom)
      const newX = grid.x + dragOffset.current.x
      const newY = grid.y + dragOffset.current.y
      sim.setPosition(draggingFieldId.current, newX, newY)
      // Zero out velocity so physics doesn't fight the drag
      const field = sim.fields.get(draggingFieldId.current)
      if (field) {
        field.transform.vx = 0
        field.transform.vy = 0
      }
      syncFields()
      return
    }

    // Pixel hover tooltip (throttled)
    if (!pointerDown.current) {
      if (pixelInfoTimeout.current) clearTimeout(pixelInfoTimeout.current)
      pixelInfoTimeout.current = setTimeout(() => {
        const renderer = rendererRef.current
        if (!renderer?.device || !sim) { setPixelInfo(null); return }
        const gx = Math.floor(gridPos.x)
        const gy = Math.floor(gridPos.y)
        if (gx < 0 || gx >= gridSize || gy < 0 || gy >= gridSize) { setPixelInfo(null); return }

        // Read color from CPU-side colorData (avoids GPU readback for tooltip)
        const idx = (gy * gridSize + gx) * 4
        const cd = sim.world.colorData
        const r = Math.round(cd[idx] * 255)
        const g = Math.round(cd[idx + 1] * 255)
        const b = Math.round(cd[idx + 2] * 255)
        const a = Math.round(cd[idx + 3] * 255)

        // Use pixel-perfect presence data for field identification
        const fieldIds = sim.getFieldsAtPixel(gx, gy)
        const fieldsHere = fieldIds.map(id => sim.fields.get(id)?.name).filter(Boolean) as string[]

        setPixelInfo({
          screenX: e.clientX, screenY: e.clientY,
          gridX: gx, gridY: gy,
          r, g, b, a,
          fields: fieldsHere,
        })
      }, 50)
    } else {
      setPixelInfo(null)
    }

    if (!pointerDown.current || !isPanning.current) return

    const dx = e.clientX - lastPointer.current.x
    const dy = e.clientY - lastPointer.current.y
    const delta = input.screenDeltaToGridDelta(dx, dy, rect, camera.zoom)

    camera.x -= delta.dx
    camera.y -= delta.dy
    lastPointer.current = { x: e.clientX, y: e.clientY }
  }, [syncFields])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (draggingFieldId.current) {
      const sim = simulationRef.current
      const fieldId = draggingFieldId.current
      const dx = e.clientX - dragStartScreen.current.x
      const dy = e.clientY - dragStartScreen.current.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      draggingFieldId.current = null
      pointerDown.current = false
      const canvas = canvasRef.current
      if (canvas) canvas.style.cursor = 'grab'

      // Click (not drag) — save field + children to library as a group
      if (dist < 5 && sim) {
        const field = sim.fields.get(fieldId)
        if (field) {
          const allSnaps = sim.generateSnapshots()
          const snap = allSnaps.find(s => s.id === fieldId)
          if (snap) {
            // Collect this field + all descendants
            const groupIds = new Set<string>([fieldId])
            // Walk children recursively
            let changed = true
            while (changed) {
              changed = false
              for (const s of allSnaps) {
                if (s.parentFieldId && groupIds.has(s.parentFieldId) && !groupIds.has(s.id)) {
                  groupIds.add(s.id)
                  changed = true
                }
              }
            }
            const groupSnaps = allSnaps.filter(s => groupIds.has(s.id))
            try {
              const existing: unknown[] = JSON.parse(localStorage.getItem('fieldLibrary') || '[]')
              // Remove any previous entries for these IDs
              const filtered = existing.filter((f: unknown) => !groupIds.has((f as { id: string }).id))
              filtered.push(...groupSnaps)
              localStorage.setItem('fieldLibrary', JSON.stringify(filtered))
              const childCount = groupSnaps.length - 1
              const label = childCount > 0 ? `"${field.name}" + ${childCount} children` : `"${field.name}"`
              showToast(`Saved ${label} to library`, 'success')
            } catch { /* ignore */ }
          }
        }
      } else {
        syncFields()
      }
      return
    }

    isPanning.current = false
    pointerDown.current = false
    const canvas = canvasRef.current
    if (canvas) canvas.style.cursor = 'grab'
  }, [syncFields, showToast])

  // Wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const camera = cameraRef.current
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
      camera.zoom = Math.max(0.5, Math.min(8, camera.zoom * zoomFactor))
      forceUpdate(n => n + 1)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  // Keyboard input — writes key states into sim.worldData for step hooks
  useEffect(() => {
    const keyMap: Record<string, string> = {
      ArrowLeft: 'key_left', ArrowRight: 'key_right', ArrowUp: 'key_up', ArrowDown: 'key_down',
      a: 'key_a', d: 'key_d', w: 'key_w', s: 'key_s',
      ' ': 'key_space', Enter: 'key_enter', Shift: 'key_shift',
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const sim = simulationRef.current
      if (!sim) return
      if (e.key === ' ') spaceHeld.current = true
      const mapped = keyMap[e.key]
      if (mapped) {
        sim.worldData[mapped] = true
        // Prevent arrow keys from scrolling
        if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const sim = simulationRef.current
      if (!sim) return
      if (e.key === ' ') spaceHeld.current = false
      const mapped = keyMap[e.key]
      if (mapped) {
        sim.worldData[mapped] = false
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // Initialize engine
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new FieldRenderer(gridSize)
    const sim = new FieldSimulation(gridSize)
    const input = new FieldInput(gridSize)

    rendererRef.current = renderer
    simulationRef.current = sim
    inputRef.current = input

    let cancelled = false

    async function initEngine() {
    const ok = await renderer.init(canvas!)
    if (!ok || cancelled) {
      console.error('Failed to initialize WebGPU renderer')
      return
    }

    // Upload initial empty textures
    renderer.uploadColorData(sim.world.colorData)
    renderer.uploadStateData(sim.world.stateData)
    renderer.uploadSelectionData(new Uint8Array(gridSize * gridSize))

    startTimeRef.current = performance.now() / 1000
    lastFrameRef.current = performance.now()

    // Restore state from server, or create initial field
    try {
      const r = await fetch('/api/engine/state')
      const data = await r.json()
      if (cancelled) return
      const snaps = data.fields || []
      if (snaps.length > 0) {
        sim.restoreFromSnapshots(snaps)
        if (data.worldParams) sim.setWorldParams(data.worldParams)

        // Restore WGSL mods BEFORE compiling effects (effects may use mod functions)
        if (Array.isArray(data.wgslMods || data.glslMods)) {
          for (const mod of (data.wgslMods || data.glslMods)) {
            if (mod.id && mod.code) {
              wgslModsRef.current.set(mod.id, { id: mod.id, code: mod.code })
            }
          }
        }

        // Restore visual types for superimposed uber-shader
        if (Array.isArray(data.visualTypes)) {
          for (const vt of data.visualTypes) {
            if (vt.name && vt.wgsl) {
              renderer.registerVisualType(vt.name, vt.wgsl)
            }
          }
        }

        // Restore uber-shader interaction definitions
        if (Array.isArray(data.interactionDefs)) {
          if (!sim.interactionPairs) sim.interactionPairs = []
          for (const def of data.interactionDefs) {
            if (def.name && def.wgsl && def.fieldA && def.fieldB) {
              const result = renderer.registerInteraction(def.name, def.wgsl)
              const propagationTypeId = def.propagation ? renderer.resolvePropagation(def.propagation) : undefined
              sim.interactionPairs = sim.interactionPairs.filter((p: { name: string }) => p.name !== def.name)
              sim.interactionPairs.push({ name: def.name, fieldA: def.fieldA, fieldB: def.fieldB, interactionTypeId: result.id, propagationTypeId })
              console.log(`[Restore] Interaction '${def.name}': ${def.fieldA} + ${def.fieldB} (type ${result.id})`)
            }
          }
        }

        const firstId = snaps[0].id

        // Restore effect programs for all fields
        let compiled = 0, failed = 0
        for (const field of sim.fields.values()) {
          for (const effect of field.effects) {
            const programKey = `${field.id}_${effect.id}`
            const result = await renderer.compileFieldEffect(programKey, field.id, effect.wgsl, getModCode())
            if (result.success) {
              compiled++
            } else {
              failed++
              console.warn(`[Restore] Effect compile failed for ${field.name}/${effect.id}: ${result.error?.substring(0, 200)}`)
            }
          }
        }
        console.log(`[Restore] Effects: ${compiled} compiled, ${failed} failed, mods: ${wgslModsRef.current.size}`)

        setBrush(prev => ({ ...prev, activeFieldId: firstId }))
      }
      // Restore step hooks
      if (Array.isArray(data.stepHooks)) {
        for (const hook of data.stepHooks) {
          if (hook.id && hook.code) {
            sim.addStepHook(hook.id, hook.author || 'unknown', hook.description || '', hook.code)
          }
        }
      }
      // Restore interaction effects
      if (Array.isArray(data.interactionEffects)) {
        for (const ie of data.interactionEffects) {
          if (ie.wgsl) {
            sim.addInteractionEffect(ie)
          }
        }
      }
      // Restore world data
      if (data.worldData && typeof data.worldData === 'object') {
        Object.assign(sim.worldData, data.worldData)
      }
      setFields(new Map(sim.fields))
    } catch {
      if (!cancelled) setFields(new Map(sim.fields))
    }

    // Render loop
    function frame() {
      const now = performance.now()
      const dt = (now - lastFrameRef.current) / 1000
      lastFrameRef.current = now

      const sim = simulationRef.current
      const renderer = rendererRef.current
      if (!sim || !renderer) return

      sim.step(dt)

      // Process audio triggers from worldData
      const playSound = sim.worldData['__play_sound'] as { id?: string; frequency?: number; duration?: number; volume?: number; pitch?: number; type?: OscillatorType } | undefined
      if (playSound) {
        delete sim.worldData['__play_sound']
        const audio = audioRef.current
        if (playSound.id && audio.hasSound(playSound.id)) {
          audio.play(playSound.id, playSound.volume ?? 1.0, playSound.pitch ?? 1.0)
        } else if (playSound.frequency) {
          audio.beep(playSound.frequency, playSound.duration ?? 0.2, playSound.volume ?? 0.5, playSound.type)
        }
      }

      // Update HUD overlay from worldData
      const hudData = sim.worldData['hud'] as HudElement[] | undefined
      const hudContainer = hudContainerRef.current
      if (hudContainer) {
        if (hudData && Array.isArray(hudData)) {
          // Build or update HUD elements via DOM
          const existingIds = new Set<string>()
          for (const elem of hudData) {
            if (!elem.id || elem.visible === false) continue
            existingIds.add(elem.id)
            let el = hudContainer.querySelector(`[data-hud-id="${elem.id}"]`) as HTMLElement | null
            if (!el) {
              el = document.createElement('div')
              el.setAttribute('data-hud-id', elem.id)
              el.style.position = 'absolute'
              hudContainer.appendChild(el)
            }
            // Position
            el.style.left = elem.x ?? ''
            el.style.top = elem.y ?? ''
            el.style.right = elem.right ?? ''
            el.style.bottom = elem.bottom ?? ''
            el.style.color = elem.color ?? '#fff'
            el.style.fontSize = elem.fontSize ?? '16px'

            if (elem.type === 'text') {
              el.textContent = elem.text ?? ''
            } else if (elem.type === 'bar') {
              const pct = elem.max ? Math.min(100, ((elem.value ?? 0) / elem.max) * 100) : 0
              el.innerHTML = ''
              el.style.width = elem.width ?? '100px'
              el.style.height = '12px'
              el.style.backgroundColor = 'rgba(255,255,255,0.2)'
              el.style.borderRadius = '2px'
              el.style.overflow = 'hidden'
              const fill = document.createElement('div')
              fill.style.width = `${pct}%`
              fill.style.height = '100%'
              fill.style.backgroundColor = elem.barColor ?? elem.color ?? '#0f0'
              fill.style.transition = 'width 0.15s'
              el.appendChild(fill)
            } else if (elem.type === 'image') {
              if (el.tagName !== 'IMG') {
                const img = document.createElement('img') as HTMLImageElement
                img.setAttribute('data-hud-id', elem.id)
                img.style.position = 'absolute'
                el.replaceWith(img)
                el = img
              }
              (el as HTMLImageElement).src = elem.src ?? ''
              el.style.width = elem.imgWidth ?? ''
              el.style.height = elem.imgHeight ?? ''
              el.style.left = elem.x ?? ''
              el.style.top = elem.y ?? ''
              el.style.right = elem.right ?? ''
              el.style.bottom = elem.bottom ?? ''
            }
          }
          // Remove stale elements
          for (const child of Array.from(hudContainer.children)) {
            const id = child.getAttribute('data-hud-id')
            if (id && !existingIds.has(id)) child.remove()
          }
        } else {
          // No HUD data — clear all
          hudContainer.innerHTML = ''
        }
      }

      // Paint field shapes into colorData so base pass renders them
      sim.paintFieldShapes()

      renderer.uploadColorData(sim.world.colorData)
      renderer.uploadStateData(sim.world.stateData)
      renderer.uploadEffectData(sim.world.effectData)

      // Run GPU state update shader (if active)
      if (renderer.hasStateUpdate()) {
        const stateTime = now / 1000 - startTimeRef.current
        renderer.runStateUpdate(stateTime, dt / 1000)
        // Async readback — don't block the frame. State syncs next frame.
        renderer.readbackState(sim.world.stateData).catch(() => {})
      }

      const camera = cameraRef.current
      const time = now / 1000 - startTimeRef.current

      // Camera follow mode — lerp toward target field position
      const follow = cameraFollowRef.current
      if (follow) {
        const targetField = sim.fields.get(follow.targetFieldId)
        if (targetField) {
          const targetX = targetField.transform.x + follow.offsetX
          const targetY = targetField.transform.y + follow.offsetY
          const dx = targetX - camera.x
          const dy = targetY - camera.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > follow.deadZone) {
            const s = 1 - Math.pow(1 - follow.smoothing, dt * 60)
            camera.x += dx * s
            camera.y += dy * s
          }
        }
      }

      // Build effect list — mask texture clips to painted cells only
      const fieldEffects: FieldEffectData[] = []
      const fullBounds: [number, number, number, number] = [0, 0, gridSize, gridSize]
      for (const field of sim.fields.values()) {
        const bounds = sim.getFieldBounds(field.id)

        if (!bounds || field.effects.length === 0) continue

        const effectBounds: [number, number, number, number] = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]
        for (const effect of field.effects) {
          const programKey = `${field.id}_${effect.id}`
          if (!renderer.hasFieldEffect(programKey)) continue
          fieldEffects.push({
            fieldId: field.id,
            programKey,
            bounds: effectBounds,
            transform: [field.transform.x, field.transform.y, field.transform.rotation, field.transform.scale],
            params: [field.color[0], field.color[1], field.color[2], field.color[3]],
            blend: effect.blend,
            feedback: effect.feedback,
          })
        }
      }


      // --- Interaction effects (merged into field pipeline) ---
      if (sim.interactionEffects.length > 0) {
        const activePairs = sim.getActiveInteractionPairs()

        for (const { effect, fieldA, fieldB } of activePairs) {
          // Per-pair program key (fixes wildcard mask overwrite bug)
          const pairKey = `ix_${effect.id}_${fieldA.id}_${fieldB.id}`

          // Lazy compile (wrap interaction GLSL → fieldEffect)
          if (!renderer.hasFieldEffect(pairKey)) {
            const wrappedWgsl = wrapInteractionWgsl(effect.wgsl)
            // Fire-and-forget async compile — will be ready next frame
            renderer.compileFieldEffect(pairKey, pairKey, wrappedWgsl, getModCode())
              .then(result => { if (!result.success) console.warn(`Interaction effect ${effect.id} compile error:`, result.error) })
            continue
          }

          // Upload cached overlap mask if available (computed at 250ms intervals)
          const overlapMask = cachedOverlapMasksRef.current.get(pairKey)
          if (overlapMask) {
            renderer.uploadFieldMask(pairKey, overlapMask)
          }

          // Compute union bounds of both fields (expanded by spread) — the interaction
          // shader runs in this region, NOT the full 512x512 grid.
          const spread = effect.spread || 0
          const boundsA = sim.getFieldBounds(fieldA.id)
          const boundsB = sim.getFieldBounds(fieldB.id)
          const ixBounds: [number, number, number, number] = boundsA && boundsB
            ? [
                Math.max(0, Math.min(boundsA.minX, boundsB.minX) - spread),
                Math.max(0, Math.min(boundsA.minY, boundsB.minY) - spread),
                Math.min(gridSize, Math.max(boundsA.maxX, boundsB.maxX) + spread),
                Math.min(gridSize, Math.max(boundsA.maxY, boundsB.maxY) + spread),
              ]
            : fullBounds

          fieldEffects.push({
            fieldId: pairKey,
            programKey: pairKey,
            bounds: ixBounds,
            transform: [
              (fieldA.transform.x + fieldB.transform.x) / 2,
              (fieldA.transform.y + fieldB.transform.y) / 2,
              0, 1
            ],
            params: [fieldA.color[0], fieldB.color[0], 0, 0],
            blend: effect.blend,
            fieldAColor: fieldA.color,
            fieldBColor: fieldB.color,
            fieldATransform: [fieldA.transform.x, fieldA.transform.y, fieldA.transform.rotation, fieldA.transform.scale],
            fieldBTransform: [fieldB.transform.x, fieldB.transform.y, fieldB.transform.rotation, fieldB.transform.scale],
            precedence: effect.precedence,
          })

          // Process interaction hooks (throttled per-effect)
          if (effect.hooks && effect.hooks.length > 0) {
            const hookKey = `ix_hook_${effect.id}`
            const lastHookTime = (sim.worldData[hookKey] as number) || 0
            const minCooldown = Math.min(...effect.hooks.map(h => h.cooldown ?? 1.0))
            if (time - lastHookTime >= minCooldown) {
              sim.worldData[hookKey] = time
              for (const hook of effect.hooks) {
                const hookCooldownKey = `${hookKey}_${hook.type}`
                const lastThisHook = (sim.worldData[hookCooldownKey] as number) || 0
                if (time - lastThisHook < (hook.cooldown ?? 1.0)) continue
                sim.worldData[hookCooldownKey] = time

                const targets: string[] = []
                if (hook.target === 'A' || hook.target === 'both' || !hook.target) targets.push(fieldA.id)
                if (hook.target === 'B' || hook.target === 'both' || !hook.target) targets.push(fieldB.id)

                switch (hook.type) {
                  case 'memory':
                    for (const fid of targets) {
                      sim.addMemory(fid, {
                        timestamp: new Date().toISOString(),
                        type: 'collision',
                        content: hook.message || `Interaction: ${effect.description}`,
                        sourceFieldId: fid === fieldA.id ? fieldB.id : fieldA.id,
                      })
                    }
                    break
                  case 'modify_property':
                    if (hook.property) {
                      for (const fid of targets) {
                        const f = sim.fields.get(fid)
                        if (f) f.properties.set(hook.property, hook.value)
                      }
                    }
                    break
                  case 'apply_force':
                    for (const fid of targets) {
                      sim.applyForce(fid, hook.fx ?? 0, hook.fy ?? 0)
                    }
                    break
                  case 'webhook':
                    if (hook.url) {
                      fetch(hook.url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          effectId: effect.id,
                          fieldA: fieldA.id,
                          fieldB: fieldB.id,
                          time,
                        }),
                      }).catch(() => {})
                    }
                    break
                }
              }
            }
          }
        }

        // Clean up stale interaction programs
        const activePairKeys = new Set(activePairs.map(p => `ix_${p.effect.id}_${p.fieldA.id}_${p.fieldB.id}`))
        for (const key of Array.from(renderer.getFieldEffectKeys())) {
          if (key.startsWith('ix_') && !activePairKeys.has(key)) {
            renderer.removeFieldEffect(key)
            renderer.removeFieldMask(key)
          }
        }
      }

      // ─── Superimposed fields — pack fields with visualType for uber-shader ───
      const superFields: SuperFieldGPU[] = []
      const superFieldOrder: string[] = []  // Maps GPU array index → fieldId
      for (const field of sim.fields.values()) {
        if (field.visualType === undefined) continue
        const t = field.transform
        const shapeType = field.shapeType === 'rect' ? 1 : 0
        const dim1 = shapeType === 1 ? (field.w || 20) : (field.radius || 10)
        const dim2 = shapeType === 1 ? (field.h || 20) : 0
        const vp = field.visualParams || [0, 0, 0, 0]
        superFieldOrder.push(field.id)
        superFields.push({
          posScaleRot: [t.x, t.y, t.scale, t.rotation],
          shapeDims: [shapeType, dim1, dim2, 0],
          color: field.color,
          visualAndParams: [field.visualType, vp[0], vp[1], vp[2]],
          extraParams: [vp[3], field.properties.get('bidirectionalBehind') ? 1 : 0, 0, 0],
        })
      }

      // Trigger lazy compilation of superimposed pipeline
      if (superFields.length > 0) {
        renderer.isSuperReady()
      }

      // Store field order for pixel-perfect hit testing
      sim.superFieldOrder = superFieldOrder

      // Map interaction pairs (field name → field name) to GPU indices (idx → idx)
      // Build name→ID lookup since interactionPairs store field names, not IDs
      const nameToId = new Map<string, string>()
      for (const field of sim.fields.values()) {
        nameToId.set(field.name, field.id)
      }
      const activeInteractions: { fieldIdxA: number; fieldIdxB: number; interactionType: number; propagationType?: number }[] = []
      if (sim.interactionPairs && sim.interactionPairs.length > 0) {
        for (const pair of sim.interactionPairs) {
          const idA = nameToId.get(pair.fieldA) || pair.fieldA
          const idB = nameToId.get(pair.fieldB) || pair.fieldB
          const idxA = superFieldOrder.indexOf(idA)
          const idxB = superFieldOrder.indexOf(idB)
          if (idxA >= 0 && idxB >= 0) {
            activeInteractions.push({ fieldIdxA: idxA, fieldIdxB: idxB, interactionType: pair.interactionTypeId, propagationType: pair.propagationTypeId })
          }
        }
      }

      renderer.render(camera, camera.zoom, time, fieldEffects, superFields, activeInteractions)

      // Trigger async readback of hit ID map for pixel-perfect hit testing
      if (superFields.length > 0) {
        renderer.readbackHitMap()
        // Update simulation with latest hit map and grid-to-pixel converters
        sim.superHitMap = renderer.hitMap
        sim.superHitMapWidth = renderer.hitMapWidth
        sim.superHitMapHeight = renderer.hitMapHeight

        const canvas = canvasRef.current
        if (canvas) {
          const dpr = (window.devicePixelRatio || 1) * renderer.renderScale
          const cw = canvas.clientWidth
          const ch = canvas.clientHeight
          const bw = Math.round(cw * dpr)
          const bh = Math.round(ch * dpr)
          const aspect = bw / bh
          const gridRange = sim.gridSize / camera.zoom

          // Grid → buffer pixel (inverse of shader's pixel → grid transform)
          // Shader: gridCoord.y = camera.y + (0.5 - uv.y) * gridRange  (note: Y is flipped)
          // Inverse: uv.y = 0.5 - (gridY - camera.y) / gridRange
          //          pixel.y = (1.0 - uv.y) * bh  ... wait, shader does uv = 1 - pixel/res
          // Shader: uv.y = 1 - (pixel.y + 0.5) / bh
          //         gridCoord.y = camera.y + (0.5 - uv.y) * gridRange
          //                     = camera.y + (0.5 - 1 + (pixel.y+0.5)/bh) * gridRange
          //                     = camera.y + ((pixel.y+0.5)/bh - 0.5) * gridRange
          // Inverse: pixel.y = ((gridY - camera.y) / gridRange + 0.5) * bh - 0.5
          if (aspect > 1) {
            sim._gridToPixelX = (gx: number) => ((gx - camera.x) / (gridRange * aspect) + 0.5) * bw
            sim._gridToPixelY = (gy: number) => ((gy - camera.y) / gridRange + 0.5) * bh
          } else {
            sim._gridToPixelX = (gx: number) => ((gx - camera.x) / gridRange + 0.5) * bw
            sim._gridToPixelY = (gy: number) => ((gy - camera.y) / (gridRange / aspect) + 0.5) * bh
          }
        }
      }

      // Per-field presence map: render each field individually, readback pixel presence (throttled)
      // This is the "field renders to pixels → pixels return superimposition data" pipeline
      if (fieldEffects.length > 0 && now - lastPresenceRef.current > 250) {
        lastPresenceRef.current = now
        try {
          const presenceMaps = renderer.renderFieldPresenceMaps(time, fieldEffects)
          // Clear stale presence data for fields no longer rendering
          for (const fieldId of sim.fieldPresence.keys()) {
            if (!presenceMaps.has(fieldId)) {
              sim.fieldPresence.delete(fieldId)
            }
          }
          // Store new presence data
          for (const [fieldId, presence] of presenceMaps) {
            sim.fieldPresence.set(fieldId, presence)
          }

          // Pre-compute overlap masks for interaction effects (expensive dilation runs here at ~4fps, not 60fps)
          if (sim.interactionEffects.length > 0) {
            const activePairs = sim.getActiveInteractionPairs()
            const newMasks = new Map<string, Uint8Array>()
            for (const { effect, fieldA, fieldB } of activePairs) {
              const pairKey = `ix_${effect.id}_${fieldA.id}_${fieldB.id}`
              const presA = sim.fieldPresence.get(fieldA.id)
              const presB = sim.fieldPresence.get(fieldB.id)
              const presACount = presA ? presA.reduce((s: number, v: number) => s + (v > 0 ? 1 : 0), 0) : 0
              const presBCount = presB ? presB.reduce((s: number, v: number) => s + (v > 0 ? 1 : 0), 0) : 0
              const mask = sim.computePixelOverlapMask(fieldA.id, fieldB.id, effect.spread)
              const maskCount = mask ? mask.reduce((s: number, v: number) => s + (v > 0 ? 1 : 0), 0) : 0
              console.log(`[IX MASK] ${fieldA.name} (${presACount}px) x ${fieldB.name} (${presBCount}px) → mask=${maskCount}px spread=${effect.spread} pos=(${fieldA.transform.x.toFixed(0)},${fieldA.transform.y.toFixed(0)}) vs (${fieldB.transform.x.toFixed(0)},${fieldB.transform.y.toFixed(0)})`)
              if (mask) {
                newMasks.set(pairKey, mask)
              }
            }
            cachedOverlapMasksRef.current = newMasks
          }
        } catch (e) {
          console.warn('[Presence] readback failed:', e)
        }
      }

      // Sample rendered pixels per field (throttled to once per second, async)
      if (now - lastSampleTimeRef.current > 1000) {
        lastSampleTimeRef.current = now
        // Fire async sampling — results land next cycle
        ;(async () => {
          const samples = new Map<string, { width: number; height: number; pixels: number[] }>()
          for (const field of sim.fields.values()) {
            const bounds = sim.getFieldBounds(field.id)
            if (!bounds) continue
            const sample = await renderer.sampleRenderedRegion(
              camera, camera.zoom,
              bounds.minX, bounds.minY,
              bounds.maxX - bounds.minX, bounds.maxY - bounds.minY,
              16
            )
            if (sample) samples.set(field.id, sample)
          }
          renderedSamplesRef.current = samples
        // Expose pixel samples to step hooks via worldData
        const pixelData: Record<string, { width: number; height: number; avgColor: [number, number, number]; brightness: number }> = {}
        for (const [fid, s] of samples) {
          let rSum = 0, gSum = 0, bSum = 0
          const px = s.pixels
          const count = px.length / 4
          for (let i = 0; i < px.length; i += 4) {
            rSum += px[i]; gSum += px[i+1]; bSum += px[i+2]
          }
          pixelData[fid] = {
            width: s.width, height: s.height,
            avgColor: [rSum/count/255, gSum/count/255, bSum/count/255],
            brightness: (rSum + gSum + bSum) / (count * 3 * 255),
          }
        }
        sim.worldData['fieldPixels'] = pixelData
        })().catch(() => {})
      }

      animFrameRef.current = requestAnimationFrame(frame)
    }

    animFrameRef.current = requestAnimationFrame(frame)
    } // end initEngine

    initEngine()

    return () => {
      cancelled = true
      cancelAnimationFrame(animFrameRef.current)
      renderer.destroy()
      audioRef.current.destroy()
      rendererRef.current = null
      simulationRef.current = null
      inputRef.current = null
    }
  }, [])

  // Agent activity panels
  const [dialogLog, setDialogLog] = useState<DialogEntry[]>([])
  const [terminalLog, setTerminalLog] = useState<TerminalEntry[]>([])
  const [agentConnected, setAgentConnected] = useState(false)

  // SSE subscription to agent command channel
  useEffect(() => {
    let es: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout>

    function connect() {
      es = new EventSource('/api/engine/agent')

      es.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'connected') {
            setAgentConnected(true)
            return
          }

          const cmd = data.command
          if (!cmd) return

          const sim = simulationRef.current
          const renderer = rendererRef.current
          const input = inputRef.current
          if (!sim || !renderer || !input) return

          // Resolve field by name when fieldId is missing, or when fieldId doesn't match any actual field ID (agents often send names as fieldId)
          if (cmd.type !== 'create_field' && cmd.type !== 'set_world_data' && cmd.type !== 'set_world_params') {
            const nameToResolve = cmd.fieldId && !sim.fields.has(cmd.fieldId) ? cmd.fieldId : (!cmd.fieldId ? cmd.name : null)
            if (nameToResolve) {
              for (const [id, f] of sim.fields) {
                if (f.name === nameToResolve) {
                  cmd.fieldId = id
                  break
                }
              }
            }
          }

          // Helper to push terminal entries
          const pushTerminal = (type: string, fieldId: string | undefined, summary: string, detail?: string, author?: string) => {
            const field = fieldId ? sim.fields.get(fieldId) : undefined
            setTerminalLog(prev => [...prev.slice(-99), {
              type,
              fieldName: field?.name || fieldId || '?',
              fieldColor: field?.color || [0.5, 0.5, 0.5, 1],
              summary,
              detail,
              author: author || '',
              timestamp: Date.now(),
            }])
          }

          // Extract author from command for terminal identity
          const cmdAuthor = (cmd.author || cmd.fromFieldId || '') as string

          switch (cmd.type) {
            case 'select': {
              const field = sim.fields.get(cmd.fieldId)
              if (field) {
                setBrush(prev => ({ ...prev, activeFieldId: cmd.fieldId }))
              }
              break
            }

            case 'generate': {
              const targetFieldId = cmd.fieldId || Array.from(sim.fields.keys())[0]
              if (!targetFieldId) break

              const field = sim.fields.get(targetFieldId)
              if (field) {
                setBrush(prev => ({ ...prev, activeFieldId: targetFieldId }))
              }

              pushTerminal('generate', targetFieldId, `"${cmd.prompt}"`)

              setGeneration({ loading: true, error: null, targetFieldId })
              try {
                const bounds = sim.getFieldBounds(targetFieldId)
                const res = await fetch('/api/engine/generate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prompt: cmd.prompt, bounds, fieldId: targetFieldId }),
                })
                const genData = await res.json()

                if (!res.ok) {
                  setGeneration({ loading: false, error: genData.error || 'Generation failed', targetFieldId })
                  break
                }

                const shaderCode = genData.wgsl || genData.glsl
                if (!shaderCode || typeof shaderCode !== 'string') {
                  setGeneration({ loading: false, error: 'No shader code in response', targetFieldId })
                  break
                }
                const effectId = genEffectId()
                const programKey = `${targetFieldId}_${effectId}`
                const result = await renderer.compileFieldEffect(programKey, targetFieldId, shaderCode, getModCode())
                if (result.success) {
                  const effect: FieldEffect = {
                    id: effectId,
                    author: 'ai_generate',
                    wgsl: shaderCode,
                    description: genData.description || 'AI generated',
                    blend: 'alpha',
                    order: 10,
                  }
                  sim.addFieldEffect(targetFieldId, effect)
                  setGeneration({ loading: false, error: null, targetFieldId: null })
                  syncFields()
                  pushTerminal('generate', targetFieldId, 'complete', shaderCode)
                } else {
                  setGeneration({ loading: false, error: `Shader compile error: ${result.error}`, targetFieldId })
                }
              } catch (err) {
                setGeneration({
                  loading: false,
                  error: err instanceof Error ? err.message : 'Network error',
                  targetFieldId,
                })
              }
              break
            }

            case 'inject_wgsl':
            case 'inject_glsl': {
              // Backward-compatible: translates to add_effect. If same author has an
              // existing effect, replaces it.
              const shaderCode = cmd.wgsl || cmd.glsl
              if (!shaderCode || typeof shaderCode !== 'string') {
                pushTerminal('inject_wgsl', undefined, 'ERROR: wgsl or glsl string required')
                break
              }
              const allFieldIds = Array.from(sim.fields.keys())
              const targetId = cmd.fieldId || allFieldIds[0]
              if (!targetId) {
                pushTerminal('inject_wgsl', undefined, 'ERROR: no fields exist')
                break
              }

              // Consent check: fields can only code themselves
              const fromField = (cmd as Record<string, unknown>).fromFieldId as string | undefined
              if (fromField && fromField !== targetId) {
                const targetField = sim.fields.get(targetId)
                pushTerminal('inject_wgsl', fromField, `BLOCKED: cannot code '${targetField?.name || targetId}' — send a field_message proposing your shader instead`)
                break
              }

              setBrush(prev => ({ ...prev, activeFieldId: targetId }))

              const field = sim.fields.get(targetId)
              if (!field) break

              // Remove existing effects from same author (backward compat: author = fromField or 'agent')
              const author = fromField || 'agent'
              const existingEffects = field.effects.filter(e => e.author === author)
              for (const e of existingEffects) {
                const pk = `${targetId}_${e.id}`
                renderer.removeFieldEffect(pk)
                sim.removeFieldEffect(targetId, e.id)
              }

              const effectId = genEffectId()
              const programKey = `${targetId}_${effectId}`
              const result = await renderer.compileFieldEffect(programKey, targetId, shaderCode, getModCode())

              if (result.success) {
                const effect: FieldEffect = {
                  id: effectId,
                  author,
                  wgsl: shaderCode,
                  description: cmd.description || 'Injected by agent',
                  blend: 'alpha',
                  order: 10,
                  feedback: !!cmd.feedback,
                }
                sim.addFieldEffect(targetId, effect)
                syncFields()
                pushTerminal('inject_wgsl', targetId, cmd.description || 'shader injected', shaderCode)
              } else {
                pushTerminal('inject_wgsl', targetId, `COMPILE ERROR: ${result.error?.substring(0, 100)}`)
              }
              break
            }

            case 'add_effect': {
              const targetId = cmd.fieldId
              if (!targetId) {
                pushTerminal('add_effect', undefined, 'ERROR: fieldId required')
                break
              }
              const field = sim.fields.get(targetId)
              if (!field) {
                pushTerminal('add_effect', targetId, `ERROR: field '${targetId}' not found — create_field first`)
                break
              }
              // Accept wgsl/glsl at top level, as 'shader', or nested inside cmd.effect
              const shaderSrc = cmd.wgsl || cmd.glsl || cmd.shader
                || (cmd.effect && typeof cmd.effect === 'object' ? (cmd.effect.wgsl || cmd.effect.glsl) : undefined)
              if (cmd.effect && typeof cmd.effect === 'object') {
                cmd.blend = cmd.blend || cmd.effect.blend
                cmd.author = cmd.author || cmd.effect.author
                cmd.description = cmd.description || cmd.effect.description
              }
              if (!shaderSrc || typeof shaderSrc !== 'string') {
                pushTerminal('add_effect', targetId, 'ERROR: wgsl string required')
                break
              }

              const effectId = genEffectId()
              const programKey = `${targetId}_${effectId}`
              // Accept blend mode from 'blend' or 'effectType' (agents sometimes use effectType for blend)
              const rawBlend = cmd.blend || cmd.effectType
              const blend = (rawBlend === 'additive' || rawBlend === 'multiply') ? rawBlend : 'alpha'
              const result = await renderer.compileFieldEffect(programKey, targetId, shaderSrc, getModCode())

              if (result.success) {
                const effect: FieldEffect = {
                  id: effectId,
                  author: cmd.author || cmd.fromFieldId || 'agent',
                  wgsl: shaderSrc,
                  description: cmd.description || 'effect added',
                  blend,
                  order: cmd.order ?? (field.effects.length + 1) * 10,
                  feedback: !!cmd.feedback,
                }
                sim.addFieldEffect(targetId, effect)
                syncFields()
                pushTerminal('add_effect', targetId, `${effect.description} (${blend}${cmd.feedback ? ' +feedback' : ''})`, shaderSrc, cmdAuthor)
              } else {
                // Compile error — write to field memory and worldData so agents can see it
                const errMsg = result.error?.substring(0, 200) || 'unknown error'
                sim.addMemory(targetId, {
                  timestamp: new Date().toISOString(),
                  type: 'effect_added',
                  content: `COMPILE ERROR: ${errMsg}`,
                  sourceFieldId: null,
                })
                sim.worldData['last_compile_error'] = {
                  fieldId: targetId,
                  error: errMsg,
                  timestamp: Date.now(),
                }
                pushTerminal('add_effect', targetId, `COMPILE ERROR: ${errMsg}`, undefined, cmdAuthor)
              }
              break
            }

            case 'remove_effect': {
              const targetId = cmd.fieldId
              const effectId = cmd.effectId
              if (!targetId || !effectId) {
                pushTerminal('remove_effect', targetId, 'ERROR: fieldId and effectId required')
                break
              }
              const programKey = `${targetId}_${effectId}`
              renderer.removeFieldEffect(programKey)
              sim.removeFieldEffect(targetId, effectId)
              syncFields()
              pushTerminal('remove_effect', targetId, `removed ${effectId}`)
              break
            }

            case 'update_effect': {
              // Atomic swap: remove old effect by effectId, compile + add new one in one step
              const targetId = cmd.fieldId
              const effectId = cmd.effectId
              const updateShader = cmd.wgsl || cmd.glsl
              if (!targetId || !effectId || !updateShader) {
                pushTerminal('update_effect', targetId, 'ERROR: fieldId, effectId, and wgsl required')
                break
              }
              const field = sim.fields.get(targetId)
              if (!field) { pushTerminal('update_effect', targetId, 'ERROR: field not found'); break }
              const oldEffect = field.effects.find(e => e.id === effectId)
              if (!oldEffect) { pushTerminal('update_effect', targetId, `ERROR: effect ${effectId} not found`); break }

              const programKey = `${targetId}_${effectId}`
              const result = await renderer.compileFieldEffect(programKey, targetId, updateShader, getModCode())
              if (result.success) {
                // Update in place — no gap
                oldEffect.wgsl = updateShader
                if (cmd.description) oldEffect.description = cmd.description
                if (cmd.blend) oldEffect.blend = cmd.blend
                if (cmd.feedback !== undefined) oldEffect.feedback = !!cmd.feedback
                syncFields()
                pushTerminal('update_effect', targetId, `updated ${effectId}: ${cmd.description || oldEffect.description}`, updateShader, cmdAuthor)
              } else {
                const errMsg = result.error?.substring(0, 200) || 'unknown error'
                sim.worldData['last_compile_error'] = { fieldId: targetId, effectId, error: errMsg, timestamp: Date.now() }
                pushTerminal('update_effect', targetId, `COMPILE ERROR (kept old): ${errMsg}`, undefined, cmdAuthor)
              }
              break
            }

            case 'update_step_hook': {
              // Atomic swap: recompile step hook in place (same hookId)
              if (!cmd.hookId || !cmd.code) {
                pushTerminal('update_step_hook', cmd.author, 'ERROR: hookId and code required', undefined, cmdAuthor)
                break
              }
              // addStepHook already does Map.set() which overwrites — atomic by nature
              const hookErr = sim.addStepHook(cmd.hookId, cmd.author || 'unknown', cmd.description || '', cmd.code)
              if (!hookErr) {
                pushTerminal('update_step_hook', cmd.author, `updated "${cmd.hookId}": ${cmd.description || 'step hook updated'}`, cmd.code, cmdAuthor)
              } else {
                // Compile failed — old hook stays in place
                sim.worldData['last_compile_error'] = { hookId: cmd.hookId, error: hookErr, timestamp: Date.now() }
                pushTerminal('update_step_hook', cmd.author, `COMPILE ERROR (kept old "${cmd.hookId}"): ${hookErr}`, cmd.code, cmdAuthor)
              }
              syncFields()
              break
            }

            case 'clear_effect': {
              const clearTargetId = cmd.fieldId || undefined
              if (clearTargetId) {
                renderer.removeAllFieldEffects(clearTargetId)
                const field = sim.fields.get(clearTargetId)
                if (field) {
                  field.effects = []
                }
                syncFields()
              } else {
                for (const field of sim.fields.values()) {
                  renderer.removeAllFieldEffects(field.id)
                  field.effects = []
                }
                syncFields()
              }
              setGeneration({ loading: false, error: null, targetFieldId: null })
              break
            }

            case 'clear_all':
              for (const field of sim.fields.values()) {
                renderer.removeAllFieldEffects(field.id)
              }
              sim.clearAll()
              for (const field of sim.fields.values()) {
                field.effects = []
              }
              updateSelectionMask(null)
              setGeneration({ loading: false, error: null, targetFieldId: null })
              syncFields()
              break

            case 'reset':
              // Nuclear reset — remove ALL fields, effects, everything
              for (const field of sim.fields.values()) {
                renderer.removeAllFieldEffects(field.id)
              }
              // Clean up ix_* interaction effect programs
              for (const key of Array.from(renderer.getFieldEffectKeys())) {
                if (key.startsWith('ix_')) {
                  renderer.removeFieldEffect(key)
                  renderer.removeFieldMask(key)
                }
              }
              sim.clearAll()
              sim.fields.clear()
              sim.interactionRules = []
              sim.interactionEffects = []
              sim.customCommands.clear()
              sim.tweens.clear()
              sim.timers.clear()
              sim.collisionCallbacks.clear()
              sim.tagIndex.clear()
              sim.gameState = ''
              sim.gameStates.clear()
              sim.interactionPairs = []
              sim.worldData = {}
              sim.stepHooks.clear()
              cameraFollowRef.current = null
              cachedOverlapMasksRef.current = new Map()
              renderer.clearRegistries()

              updateSelectionMask(null)
              setGeneration({ loading: false, error: null, targetFieldId: null })
              syncFields()
              pushTerminal('reset', undefined, 'Full reset — all fields and rules deleted')
              break

            case 'create_field': {
              // Accept id, fieldId, or fall back to name, then auto-generate
              const id = cmd.id || cmd.fieldId || cmd.name || genFieldId()
              const hue = DEFAULT_HUES[sim.fields.size % DEFAULT_HUES.length]
              const color = cmd.color || hueToRgba(hue)
              const name = cmd.name || `Field ${sim.fields.size + 1}`

              sim.createField(id, name, color, cmd.parentFieldId as string | undefined)

              if (cmd.x !== undefined && cmd.y !== undefined) {
                sim.setPosition(id, cmd.x as number, cmd.y as number)
              }

              // Store shape properties on the field
              const newField = sim.fields.get(id)
              if (newField) {
                // Accept shape as string ('rect'/'circle') or object ({type:'rect', width, height})
                const shapeRaw = cmd.shape || cmd.shapeType
                if (typeof shapeRaw === 'string') {
                  newField.shapeType = shapeRaw as 'circle' | 'rect'
                } else if (shapeRaw && typeof shapeRaw === 'object') {
                  const so = shapeRaw as Record<string, unknown>
                  if (so.type) newField.shapeType = so.type as 'circle' | 'rect'
                  if (so.width !== undefined) newField.w = so.width as number
                  if (so.height !== undefined) newField.h = so.height as number
                  if (so.radius !== undefined) newField.radius = so.radius as number
                }
                // Also accept top-level w/h/radius
                if (cmd.radius !== undefined) newField.radius = cmd.radius as number
                if (cmd.w !== undefined) newField.w = cmd.w as number
                if (cmd.h !== undefined) newField.h = cmd.h as number
                if (cmd.width !== undefined) newField.w = cmd.width as number
                if (cmd.height !== undefined) newField.h = cmd.height as number
                // Visual type for superimposed rendering
                if (cmd.visualType !== undefined) {
                  const vt = cmd.visualType
                  if (typeof vt === 'string') {
                    const resolved = renderer.resolveVisualType(vt)
                    if (resolved !== undefined) {
                      newField.visualType = resolved
                    }
                  } else if (typeof vt === 'number') {
                    newField.visualType = vt
                  }
                }
                if (cmd.visualParams) {
                  newField.visualParams = cmd.visualParams as [number, number, number, number]
                }
              }

              setBrush(prev => ({ ...prev, activeFieldId: id }))
              syncFields()
              const parentLabel = cmd.parentFieldId ? ` parent=${cmd.parentFieldId}` : ''
              pushTerminal('create_field', id, `'${name}'${parentLabel}`, undefined, cmdAuthor)
              break
            }

            case 'set_tool':
              setBrush(prev => ({ ...prev, tool: cmd.tool as BrushState['tool'] }))
              break

            case 'field_message': {
              const fromField = sim.fields.get(cmd.fromFieldId)
              const toField = sim.fields.get(cmd.toFieldId)
              const fromName = fromField?.name || cmd.fromFieldId
              const toName = toField?.name || cmd.toFieldId
              setDialogLog(prev => [...prev.slice(-99), {
                from: fromName,
                to: toName,
                fromColor: fromField?.color || [0.5, 0.5, 0.5, 1],
                content: cmd.content,
                data: cmd.data,
                timestamp: Date.now(),
              }])
              sim.addMemory(cmd.fromFieldId, {
                timestamp: new Date().toISOString(),
                type: 'message_sent',
                content: `Sent to ${toName}: "${cmd.content}"`,
                sourceFieldId: cmd.toFieldId,
                data: cmd.data,
              })
              sim.addMemory(cmd.toFieldId, {
                timestamp: new Date().toISOString(),
                type: 'message_received',
                content: `From ${fromName}: "${cmd.content}"`,
                sourceFieldId: cmd.fromFieldId,
                data: cmd.data,
              })
              syncFields()
              break
            }

            case 'move': {
              const field = sim.fields.get(cmd.fieldId)
              if (!field) break
              field.transform.x += cmd.dx
              field.transform.y += cmd.dy
              syncFields()
              pushTerminal('move', cmd.fieldId, `(${cmd.dx}, ${cmd.dy})`)
              break
            }

            case 'delete_field': {
              const delField = sim.fields.get(cmd.fieldId)
              if (!delField) {
                pushTerminal('delete_field', cmd.fieldId, 'ERROR: field not found')
                break
              }
              const delName = delField.name
              renderer.removeAllFieldEffects(cmd.fieldId)
              sim.removeField(cmd.fieldId)
              syncFields()
              pushTerminal('delete_field', cmd.fieldId, `'${delName}' deleted`)
              break
            }

            case 'set_parent': {
              const field = sim.fields.get(cmd.fieldId)
              if (!field) {
                pushTerminal('set_parent', cmd.fieldId, 'ERROR: field not found')
                break
              }
              const success = sim.setParent(cmd.fieldId, cmd.parentFieldId as string | undefined)
              if (success) {
                syncFields()
                pushTerminal('set_parent', cmd.fieldId, cmd.parentFieldId ? `parent=${cmd.parentFieldId}` : 'parent cleared')
              } else {
                pushTerminal('set_parent', cmd.fieldId, `ERROR: invalid parent (not found, cycle, or depth limit exceeded)`)
              }
              break
            }

            case 'set_position': {
              const posField = sim.fields.get(cmd.fieldId)
              if (!posField) break
              sim.setPosition(cmd.fieldId, cmd.x, cmd.y)
              syncFields()
              pushTerminal('set_position', cmd.fieldId, `(${cmd.x}, ${cmd.y})`)
              break
            }

            case 'set_color': {
              const field = sim.fields.get(cmd.fieldId)
              if (!field) break
              if (Array.isArray(cmd.color) && cmd.color.length >= 3) {
                field.color = [cmd.color[0], cmd.color[1], cmd.color[2], cmd.color[3] ?? 1.0]
              }
              syncFields()
              pushTerminal('set_color', cmd.fieldId, `[${field.color.map((c: number) => c.toFixed(2)).join(', ')}]`)
              break
            }

            case 'set_scale': {
              const field = sim.fields.get(cmd.fieldId)
              if (!field) break
              field.transform.scale = (cmd.scale as number) || 1.0
              syncFields()
              pushTerminal('set_scale', cmd.fieldId, `scale=${field.transform.scale.toFixed(2)}`)
              break
            }

            case 'set_shape': {
              const field = sim.fields.get(cmd.fieldId)
              if (!field) break
              const shapeVal = ((cmd as Record<string, unknown>).shape || (cmd as Record<string, unknown>).shapeType) as 'circle' | 'rect' | undefined
              if (shapeVal) field.shapeType = shapeVal
              if ((cmd as Record<string, unknown>).radius !== undefined) field.radius = (cmd as Record<string, unknown>).radius as number
              if ((cmd as Record<string, unknown>).w !== undefined) field.w = (cmd as Record<string, unknown>).w as number
              if ((cmd as Record<string, unknown>).h !== undefined) field.h = (cmd as Record<string, unknown>).h as number
              syncFields()
              const shapeDesc = field.shapeType === 'circle' ? `circle r=${field.radius}` : `rect ${field.w}x${field.h}`
              pushTerminal('set_shape', cmd.fieldId, shapeDesc)
              break
            }

            case 'set_name': {
              const field = sim.fields.get(cmd.fieldId)
              if (!field) break
              const oldName = field.name
              field.name = (cmd.name as string) || field.name
              syncFields()
              pushTerminal('set_name', cmd.fieldId, `"${oldName}" -> "${field.name}"`)
              break
            }


            case 'set_property': {
              const propField = sim.fields.get(cmd.fieldId)
              if (!propField) {
                pushTerminal('set_property', cmd.fieldId, 'ERROR: field not found')
                break
              }
              const key = cmd.key as string
              const value = cmd.value
              if (!key) {
                pushTerminal('set_property', cmd.fieldId, 'ERROR: key required')
                break
              }
              propField.properties.set(key, value)
              syncFields()
              pushTerminal('set_property', cmd.fieldId, `${key} = ${JSON.stringify(value)}`)
              break
            }

            case 'get_properties': {
              const gpField = sim.fields.get(cmd.fieldId)
              if (!gpField) {
                pushTerminal('get_properties', cmd.fieldId, 'ERROR: field not found')
                break
              }
              const props = Object.fromEntries(gpField.properties)
              pushTerminal('get_properties', cmd.fieldId, JSON.stringify(props).substring(0, 200))
              break
            }

            case 'set_world_params': {
              if (!cmd.params || typeof cmd.params !== 'object') break
              sim.setWorldParams(cmd.params)
              if (cmd.params.gravity || cmd.params.friction || cmd.params.collisionForce) {
                if (!sim.running) {
                  sim.running = true
                  setRunning(true)
                }
              }
              syncFields()
              pushTerminal('set_world_params', undefined, JSON.stringify(cmd.params))
              break
            }

            case 'apply_force': {
              sim.applyForce(cmd.fieldId, cmd.fx, cmd.fy)
              if (!sim.running) {
                sim.running = true
                setRunning(true)
              }
              syncFields()
              pushTerminal('apply_force', cmd.fieldId, `(${cmd.fx}, ${cmd.fy})`)
              break
            }

            case 'set_world_data': {
              const wdKeys = (cmd.data && typeof cmd.data === 'object') ? Object.keys(cmd.data) : []
              // Apply to sim.worldData
              if (cmd.data && typeof cmd.data === 'object') {
                Object.assign(sim.worldData, cmd.data)
              }
              // Pipe narrative channel messages into dialog panel
              const narr = cmd.data?.narrative as { channel?: Array<{ author: string; text: string; time?: number }> } | undefined
              if (narr?.channel) {
                const prevLen = (sim.worldData as Record<string, unknown>).__narrativeLen as number || 0
                const newMsgs = narr.channel.slice(prevLen)
                for (const msg of newMsgs) {
                  setDialogLog(prev => [...prev.slice(-99), {
                    from: msg.author || '?',
                    to: 'all',
                    fromColor: msg.author === 'Alpha' ? [0.9, 0.3, 0.1, 1] as [number, number, number, number]
                      : msg.author === 'Beta' ? [0.1, 0.6, 0.9, 1] as [number, number, number, number]
                      : msg.author === 'Gamma' ? [0.2, 0.9, 0.4, 1] as [number, number, number, number]
                      : [0.7, 0.7, 0.7, 1] as [number, number, number, number],
                    content: msg.text,
                    timestamp: Date.now(),
                  }])
                }
                ;(sim.worldData as Record<string, unknown>).__narrativeLen = narr.channel.length
              }
              pushTerminal('set_world_data', cmd.fieldId, wdKeys.join(', ') || '(no data)')
              break
            }

            case 'define_interaction': {
              // Route: if cmd.wgsl is present, this is a superimposed interaction (a + b = c)
              if (cmd.wgsl) {
                const name = cmd.name as string
                const wgsl = cmd.wgsl as string
                const fieldA = cmd.fieldA as string
                const fieldB = cmd.fieldB as string
                if (!name) { pushTerminal('define_interaction', '', 'ERROR: name required'); break }
                if (!fieldA || !fieldB) { pushTerminal('define_interaction', name, 'ERROR: fieldA and fieldB required'); break }
                const expectedFn = `interaction_${name}`
                if (!wgsl.includes(expectedFn)) {
                  pushTerminal('define_interaction', name, `ERROR: WGSL must define fn ${expectedFn}(uvA: vec2f, uvB: vec2f, colorA: vec4f, colorB: vec4f, time: f32) -> vec4f`)
                  break
                }
                const result = renderer.registerInteraction(name, wgsl)
                // Resolve optional propagation type
                const propagationName = cmd.propagation as string | undefined
                const propagationTypeId = propagationName ? renderer.resolvePropagation(propagationName) : undefined
                if (!sim.interactionPairs) sim.interactionPairs = []
                sim.interactionPairs = sim.interactionPairs.filter((p: { name: string }) => p.name !== name)
                sim.interactionPairs.push({ name, fieldA, fieldB, interactionTypeId: result.id, propagationTypeId })
                const propLabel = propagationName ? ` propagation: ${propagationName}` : ''
                pushTerminal('define_interaction', name, `${fieldA} + ${fieldB} = ${name} (type ${result.id})${propLabel}`, undefined, cmdAuthor)
                break
              }
              // Legacy: interaction rule system
              const rule = cmd.rule
              if (!rule || !rule.trigger || !rule.effect) {
                pushTerminal('define_interaction', (rule as Record<string, unknown>)?.definedBy as string, 'ERROR: missing trigger or effect')
                break
              }
              const ruleId = sim.addInteractionRule({
                id: (rule as Record<string, unknown>).id as string || '',
                definedBy: rule.definedBy || 'unknown',
                trigger: rule.trigger,
                triggerDistance: rule.triggerDistance,
                fieldA: rule.fieldA,
                fieldB: rule.fieldB,
                effect: rule.effect,
                effectParams: rule.effectParams || {},
                description: rule.description,
              })
              if (!sim.running) {
                sim.running = true
                setRunning(true)
              }
              syncFields()
              pushTerminal('define_interaction', rule.definedBy, rule.description || `${rule.trigger} → ${rule.effect}`, `rule_id: ${ruleId}`)
              break
            }

            case 'remove_interaction': {
              if (cmd.ruleId) {
                sim.removeInteractionRule(cmd.ruleId)
                syncFields()
                pushTerminal('remove_interaction', undefined, cmd.ruleId)
              }
              break
            }

            case 'add_interaction_effect': {
              const ixWgsl = ((cmd as Record<string, unknown>).wgsl || (cmd as Record<string, unknown>).glsl) as string
              if (!ixWgsl) {
                pushTerminal('add_interaction_effect', (cmd as Record<string, unknown>).author as string, 'ERROR: wgsl required')
                break
              }
              // Validate the wrapped WGSL before adding
              const wrappedWgsl = wrapInteractionWgsl(ixWgsl)
              const testKey = `ix_validate_${Date.now()}`
              const compileResult = await renderer.compileFieldEffect(testKey, testKey, wrappedWgsl, getModCode())
              if (!compileResult.success) {
                pushTerminal('add_interaction_effect', (cmd as Record<string, unknown>).author as string, `WGSL error: ${compileResult.error}`)
                renderer.removeFieldEffect(testKey)
                renderer.removeFieldMask(testKey)
                break
              }
              // Clean up validation program — real programs are compiled per-pair in the frame loop
              renderer.removeFieldEffect(testKey)
              renderer.removeFieldMask(testKey)

              const effectId = sim.addInteractionEffect({
                author: (cmd as Record<string, unknown>).author as string || 'unknown',
                fieldA: (cmd as Record<string, unknown>).fieldA as string || null,
                fieldB: (cmd as Record<string, unknown>).fieldB as string || null,
                wgsl: ixWgsl,
                description: (cmd as Record<string, unknown>).description as string || '',
                blend: ((cmd as Record<string, unknown>).blend as 'alpha' | 'additive' | 'multiply') || 'alpha',
                spread: (cmd as Record<string, unknown>).spread as number || 0,
                order: (cmd as Record<string, unknown>).order as number || 0,
                precedence: !!(cmd as Record<string, unknown>).precedence,
                hooks: (cmd as Record<string, unknown>).hooks as InteractionEffect['hooks'] || undefined,
              })
              const fieldALabel = (cmd as Record<string, unknown>).fieldA as string || 'any'
              const fieldBLabel = (cmd as Record<string, unknown>).fieldB as string || 'any'
              pushTerminal('add_interaction_effect', (cmd as Record<string, unknown>).author as string,
                (cmd as Record<string, unknown>).description as string || `${fieldALabel} × ${fieldBLabel}`,
                `id: ${effectId}`, cmdAuthor)
              syncFields()
              break
            }

            case 'remove_interaction_effect': {
              const effectId = (cmd as Record<string, unknown>).effectId as string
              if (effectId) {
                sim.removeInteractionEffect(effectId)
                // Clean up any compiled per-pair programs for this effect
                for (const key of Array.from(renderer.getFieldEffectKeys())) {
                  if (key.startsWith(`ix_${effectId}_`)) {
                    renderer.removeFieldEffect(key)
                    renderer.removeFieldMask(key)
                  }
                }
                syncFields()
                pushTerminal('remove_interaction_effect', undefined, effectId)
              }
              break
            }

            case 'define_command': {
              const cmdDef = cmd.command
              if (!cmdDef || !cmdDef.name || !cmdDef.macro || cmdDef.macro.length === 0) {
                pushTerminal('define_command', cmdDef?.definedBy, 'ERROR: name and macro required')
                break
              }
              sim.addCustomCommand({
                name: cmdDef.name,
                definedBy: cmdDef.definedBy || 'unknown',
                description: cmdDef.description || '',
                macro: cmdDef.macro,
              })
              pushTerminal('define_command', cmdDef.definedBy, `"${cmdDef.name}" (${cmdDef.macro.length} steps)`)
              break
            }

            case 'execute_command': {
              const customCmd = sim.getCustomCommand(cmd.name)
              pushTerminal('execute_command', customCmd?.definedBy, `"${cmd.name}" — ${customCmd ? `${customCmd.macro.length} steps (expanded by bridge)` : 'unknown command'}`)
              break
            }

            case 'add_step_hook': {
              // Accept 'name' as alias for 'hookId'
              if (!cmd.hookId && cmd.name) cmd.hookId = cmd.name
              if (!cmd.hookId || !cmd.code) {
                pushTerminal('add_step_hook', cmd.author, 'ERROR: hookId and code required', undefined, cmdAuthor)
                break
              }
              const hookErr = sim.addStepHook(cmd.hookId, cmd.author || 'unknown', cmd.description || '', cmd.code)
              if (!hookErr) {
                if (!sim.running) { sim.running = true; setRunning(true) }
                pushTerminal('add_step_hook', cmd.author, `"${cmd.hookId}": ${cmd.description || 'step hook added'}`, cmd.code, cmdAuthor)
              } else {
                // Write compile error to worldData so agents can see it
                sim.worldData['last_compile_error'] = {
                  hookId: cmd.hookId,
                  error: hookErr,
                  timestamp: Date.now(),
                }
                pushTerminal('add_step_hook', cmd.author, `COMPILE ERROR for "${cmd.hookId}": ${hookErr}`, cmd.code, cmdAuthor)
              }
              syncFields()
              break
            }

            case 'remove_step_hook': {
              if (cmd.hookId) {
                sim.removeStepHook(cmd.hookId)
                pushTerminal('remove_step_hook', undefined, `removed ${cmd.hookId}`)
              }
              break
            }

            case 'add_state_shader': {
              // GPU state update shader — runs each frame via render-to-texture ping-pong
              // Agent provides cellUpdate(coord, state, color, time, dt) function
              const stateShader = (cmd.wgsl || cmd.glsl) as string
              if (stateShader) {
                const stateResult = await renderer.compileStateUpdate(stateShader, getModCode())
                if (stateResult.success) {
                  pushTerminal('add_state_shader', cmd.fieldId, cmd.description || 'state update shader active', stateShader, cmd.author as string)
                } else {
                  pushTerminal('add_state_shader', cmd.fieldId, `STATE SHADER COMPILE ERROR: ${stateResult.error?.substring(0, 100)}`)
                  sim.worldData['last_compile_error'] = {
                    type: 'state_shader',
                    error: stateResult.error,
                    timestamp: Date.now()
                  }
                }
              }
              break
            }

            case 'remove_state_shader': {
              renderer.removeStateUpdate()
              pushTerminal('remove_state_shader', undefined, 'state update shader removed')
              break
            }

            case 'clone_field': {
              const sourceField = sim.fields.get(cmd.fieldId)
              if (!sourceField) {
                pushTerminal('clone_field', cmd.fieldId, 'ERROR: source field not found')
                break
              }
              const cloneId = genFieldId()
              const cloneName = (cmd.name as string) || `${sourceField.name} (clone)`
              const cloneColor = (cmd.color as [number, number, number, number]) || [...sourceField.color] as [number, number, number, number]

              sim.createField(cloneId, cloneName, cloneColor)
              
              // Copy position with optional offset
              const offsetX = (cmd.offsetX as number) || 30
              const offsetY = (cmd.offsetY as number) || 0
              sim.setPosition(cloneId, sourceField.transform.x + offsetX, sourceField.transform.y + offsetY)
              
              // Clone effects
              for (const effect of sourceField.effects) {
                const newEffectId = genEffectId()
                const programKey = `${cloneId}_${newEffectId}`
                const result = await renderer.compileFieldEffect(programKey, cloneId, effect.wgsl, getModCode())
                if (result.success) {
                  sim.addFieldEffect(cloneId, {
                    id: newEffectId,
                    author: effect.author,
                    wgsl: effect.wgsl,
                    description: effect.description,
                    blend: effect.blend,
                    order: effect.order,
                    feedback: effect.feedback,
                  })
                }
              }
              
              syncFields()
              pushTerminal('clone_field', cmd.fieldId, `cloned as '${cloneName}' (id: ${cloneId})`)
              break
            }

            case 'list_fields': {
              const fieldList = Array.from(sim.fields.values()).map(f => {
                return `${f.name} [${f.id}] at (${f.transform.x.toFixed(0)},${f.transform.y.toFixed(0)}) effects=${f.effects.length}`
              })
              pushTerminal('list_fields', undefined, `${sim.fields.size} fields`, fieldList.join('\n'))
              break
            }

            // --- Lightweight effect commands (no field creation) ---
            case 'spawn_effect': {
              const ex = cmd.x as number, ey = cmd.y as number
              const et = (cmd.effectType as number) || 1
              const ec = (cmd.color as number) || 0.5
              const es2 = (cmd.size as number) || 2
              const ei = (cmd.intensity as number) || 1.0
              if (cmd.offsets && Array.isArray(cmd.offsets)) {
                sim.stampEffectShape(ex, ey, cmd.offsets as [number, number][], et, ec, 1.0, ei)
              } else {
                sim.stampEffectCircle(ex, ey, es2, et, ec, 1.0, ei)
              }
              break
            }

            case 'spawn_projectile': {
              const px = cmd.x as number, py = cmd.y as number
              const pvx = (cmd.vx as number) || 0, pvy = (cmd.vy as number) || 0
              const pt = (cmd.effectType as number) || 1
              const pc = (cmd.color as number) || 0.5
              const ps = (cmd.size as number) || 2
              const pi = (cmd.intensity as number) || 1.0
              const pl = (cmd.lifetime as number) || 3.0
              sim.spawnProjectile(px, py, pvx, pvy, pt, pc, ps, pi, pl)
              break
            }

            case 'clear_effects': {
              const cx = cmd.x as number, cy = cmd.y as number
              const cr = (cmd.radius as number) || 50
              sim.clearEffects(cx, cy, cr)
              break
            }

            // --- WGSL Mod commands ---
            case 'register_wgsl_mod':
            case 'register_glsl_mod': {
              const modId = cmd.id as string
              const modCode = cmd.code as string
              if (!modId || !modCode) {
                pushTerminal('register_wgsl_mod', undefined, 'ERROR: id and code required')
                break
              }
              wgslModsRef.current.set(modId, { id: modId, code: modCode })
              pushTerminal('register_wgsl_mod', undefined, `Registered mod "${modId}" (${modCode.length} chars)`)
              break
            }

            case 'remove_wgsl_mod':
            case 'remove_glsl_mod': {
              const modId = cmd.id as string
              if (!modId) {
                pushTerminal('remove_wgsl_mod', undefined, 'ERROR: id required')
                break
              }
              const existed = wgslModsRef.current.delete(modId)
              pushTerminal('remove_wgsl_mod', undefined, existed ? `Removed mod "${modId}"` : `Mod "${modId}" not found`)
              break
            }

            case 'sample_region': {
              const srX = cmd.x as number ?? 256
              const srY = cmd.y as number ?? 256
              const srRadius = Math.min(cmd.radius as number ?? 16, 64) // cap at 64
              const srResult = sim.sampleRegion(srX, srY, srRadius)
              pushTerminal('sample_region', undefined, `(${srX},${srY}) r=${srRadius}: ${srResult.uniqueFieldIds.length} fields, avg=(${srResult.avgColor.map(c => c.toFixed(2)).join(',')})`)
              break
            }

            // ─── Game Engine Commands ───

            case 'set_camera': {
              if (cmd.follow) {
                cameraFollowRef.current = {
                  targetFieldId: cmd.follow as string,
                  smoothing: (cmd.smoothing as number) ?? 0.1,
                  offsetX: (cmd.offsetX as number) ?? 0,
                  offsetY: (cmd.offsetY as number) ?? 0,
                  deadZone: (cmd.deadZone as number) ?? 5,
                }
                pushTerminal('set_camera', cmd.follow as string, `following, smoothing=${cameraFollowRef.current.smoothing}`)
              } else if (cmd.follow === null || cmd.follow === false) {
                cameraFollowRef.current = null
                pushTerminal('set_camera', undefined, 'follow disabled')
              }
              if (cmd.x !== undefined && cmd.y !== undefined) {
                cameraRef.current.x = cmd.x as number
                cameraRef.current.y = cmd.y as number
              }
              if (cmd.zoom !== undefined) {
                cameraRef.current.zoom = Math.max(0.1, Math.min(10, cmd.zoom as number))
              }
              break
            }

            case 'save_scene': {
              const sceneName = cmd.name as string
              if (!sceneName) { pushTerminal('save_scene', undefined, 'ERROR: name required'); break }
              const sceneData = {
                name: sceneName,
                fields: sim.generateSnapshots(),
                worldParams: sim.getWorldParams(),
                worldData: { ...sim.worldData },
                stepHooks: sim.getStepHookSnapshots(),
                interactionRules: [...sim.interactionRules],
                interactionEffects: [...sim.interactionEffects],
                timestamp: Date.now(),
              }
              try {
                await fetch('/api/engine/scene', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'save', name: sceneName, scene: sceneData }),
                })
                pushTerminal('save_scene', undefined, `"${sceneName}" saved (${sceneData.fields.length} fields)`)
              } catch { pushTerminal('save_scene', undefined, `ERROR: failed to save "${sceneName}"`) }
              break
            }

            case 'load_scene': {
              const sceneName = cmd.name as string
              if (!sceneName) { pushTerminal('load_scene', undefined, 'ERROR: name required'); break }
              try {
                const resp = await fetch(`/api/engine/scene?name=${encodeURIComponent(sceneName)}`)
                const { scene } = await resp.json()
                if (!scene) { pushTerminal('load_scene', undefined, `ERROR: scene "${sceneName}" not found`); break }

                // Clear current state
                for (const field of sim.fields.values()) {
                  renderer.removeAllFieldEffects(field.id)
                }
                for (const key of Array.from(renderer.getFieldEffectKeys())) {
                  if (key.startsWith('ix_')) { renderer.removeFieldEffect(key); renderer.removeFieldMask(key) }
                }
                sim.clearAll()
                sim.fields.clear()
                sim.interactionRules = []
                sim.interactionEffects = []
                sim.stepHooks.clear()
                sim.tweens.clear()
                sim.timers.clear()
                sim.collisionCallbacks.clear()
                cachedOverlapMasksRef.current = new Map()

                // Restore scene
                sim.restoreFromSnapshots(scene.fields || [])
                if (scene.worldParams) sim.setWorldParams(scene.worldParams)
                if (scene.worldData) Object.assign(sim.worldData, scene.worldData)
                if (scene.interactionRules) sim.interactionRules = scene.interactionRules
                if (scene.interactionEffects) {
                  for (const ie of scene.interactionEffects) sim.addInteractionEffect(ie)
                }
                if (scene.stepHooks) {
                  for (const h of scene.stepHooks) sim.addStepHook(h.id, h.author, h.description, h.code)
                }

                // Recompile effects
                for (const field of sim.fields.values()) {
                  for (const effect of field.effects) {
                    const programKey = `${field.id}_${effect.id}`
                    await renderer.compileFieldEffect(programKey, field.id, effect.wgsl, getModCode())
                  }
                }

                updateSelectionMask(null)
                syncFields()
                pushTerminal('load_scene', undefined, `"${sceneName}" loaded (${scene.fields?.length || 0} fields)`)
              } catch { pushTerminal('load_scene', undefined, `ERROR: failed to load "${sceneName}"`) }
              break
            }

            case 'list_scenes': {
              try {
                const resp = await fetch('/api/engine/scene?action=list')
                const { scenes } = await resp.json()
                pushTerminal('list_scenes', undefined, `${(scenes as string[])?.length || 0} scenes`, (scenes as string[])?.join(', ') || 'none')
              } catch { pushTerminal('list_scenes', undefined, 'ERROR: failed to list scenes') }
              break
            }

            case 'delete_scene': {
              const sceneName = cmd.name as string
              if (!sceneName) { pushTerminal('delete_scene', undefined, 'ERROR: name required'); break }
              try {
                await fetch('/api/engine/scene', {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: sceneName }),
                })
                pushTerminal('delete_scene', undefined, `"${sceneName}" deleted`)
              } catch { pushTerminal('delete_scene', undefined, `ERROR: failed to delete "${sceneName}"`) }
              break
            }

            case 'play_sound': {
              const audio = audioRef.current
              if (cmd.id && audio.hasSound(cmd.id as string)) {
                audio.play(cmd.id as string, (cmd.volume as number) ?? 1.0, (cmd.pitch as number) ?? 1.0)
                pushTerminal('play_sound', undefined, `"${cmd.id}"`)
              } else if (cmd.frequency) {
                audio.beep(cmd.frequency as number, (cmd.duration as number) ?? 0.2, (cmd.volume as number) ?? 0.5, (cmd.type as OscillatorType) ?? 'sine')
                pushTerminal('play_sound', undefined, `beep ${cmd.frequency}Hz`)
              } else {
                pushTerminal('play_sound', undefined, 'ERROR: id or frequency required')
              }
              break
            }

            case 'load_sound': {
              if (!cmd.id || !cmd.url) { pushTerminal('load_sound', undefined, 'ERROR: id and url required'); break }
              const loaded = await audioRef.current.loadSound(cmd.id as string, cmd.url as string)
              pushTerminal('load_sound', undefined, loaded ? `"${cmd.id}" loaded` : `ERROR: failed to load "${cmd.id}"`)
              break
            }

            case 'set_volume': {
              audioRef.current.setVolume((cmd.volume as number) ?? 1.0)
              pushTerminal('set_volume', undefined, `${audioRef.current.getVolume().toFixed(2)}`)
              break
            }

            case 'set_game_state': {
              const stateName = cmd.state as string
              if (!stateName) { pushTerminal('set_game_state', undefined, 'ERROR: state required'); break }
              sim.setGameState(stateName)
              pushTerminal('set_game_state', undefined, `→ "${stateName}"`)
              break
            }

            case 'define_game_state': {
              const stateName = cmd.name as string
              if (!stateName) { pushTerminal('define_game_state', undefined, 'ERROR: name required'); break }
              sim.defineGameState(stateName, {
                name: stateName,
                onEnter: cmd.onEnter as string | undefined,
                onExit: cmd.onExit as string | undefined,
                pausePhysics: !!(cmd.pausePhysics),
              })
              pushTerminal('define_game_state', undefined, `"${stateName}" defined${cmd.pausePhysics ? ' (pauses physics)' : ''}`)
              break
            }

            case 'add_tag': {
              const fieldId = cmd.fieldId as string
              const tags = cmd.tags as string[]
              if (!fieldId || !tags?.length) { pushTerminal('add_tag', cmd.fieldId, 'ERROR: fieldId and tags required'); break }
              sim.addTag(fieldId, tags)
              syncFields()
              pushTerminal('add_tag', fieldId, tags.join(', '))
              break
            }

            case 'remove_tag': {
              const fieldId = cmd.fieldId as string
              const tags = cmd.tags as string[]
              if (!fieldId || !tags?.length) { pushTerminal('remove_tag', cmd.fieldId, 'ERROR: fieldId and tags required'); break }
              sim.removeTag(fieldId, tags)
              syncFields()
              pushTerminal('remove_tag', fieldId, tags.join(', '))
              break
            }

            case 'set_visual': {
              const fieldId = cmd.fieldId as string
              if (!fieldId) { pushTerminal('set_visual', '', 'ERROR: fieldId required'); break }
              const field = sim.fields.get(fieldId)
              if (!field) { pushTerminal('set_visual', fieldId, 'ERROR: field not found'); break }
              const vt = cmd.visualType
              if (vt !== undefined) {
                if (typeof vt === 'string') {
                  const resolved = renderer.resolveVisualType(vt)
                  if (resolved !== undefined) {
                    field.visualType = resolved
                  }
                } else if (typeof vt === 'number') {
                  field.visualType = vt
                } else if (vt === null) {
                  field.visualType = undefined
                }
              }
              if (cmd.visualParams !== undefined) {
                field.visualParams = cmd.visualParams as [number, number, number, number]
              }
              syncFields()
              pushTerminal('set_visual', fieldId, `type=${field.visualType}`, undefined, cmdAuthor)
              break
            }

            case 'define_visual': {
              const name = cmd.name as string
              const wgsl = cmd.wgsl as string
              if (!name) { pushTerminal('define_visual', '', 'ERROR: name required'); break }
              if (!wgsl) { pushTerminal('define_visual', name, 'ERROR: wgsl required'); break }
              // Validate function name matches
              const expectedFn = `visual_${name}`
              if (!wgsl.includes(expectedFn)) {
                pushTerminal('define_visual', name, `ERROR: WGSL must define fn ${expectedFn}(uv: vec2f, sdf: f32, color: vec4f, time: f32, params: vec4f, behind: vec4f) -> vec4f`)
                break
              }
              const result = renderer.registerVisualType(name, wgsl)
              pushTerminal('define_visual', name, `registered as type ${result.id}`, undefined, cmdAuthor)
              break
            }

            case 'define_propagation': {
              const name = cmd.name as string
              const wgsl = cmd.wgsl as string
              if (!name) { pushTerminal('define_propagation', '', 'ERROR: name required'); break }
              if (!wgsl) { pushTerminal('define_propagation', name, 'ERROR: wgsl required'); break }
              const expectedFn = `propagation_${name}`
              if (!wgsl.includes(expectedFn)) {
                pushTerminal('define_propagation', name, `ERROR: WGSL must define fn ${expectedFn}(srcColor: vec4f, offset: vec2f, dist: f32, time: f32) -> vec4f`)
                break
              }
              const result = renderer.registerPropagation(name, wgsl)
              pushTerminal('define_propagation', name, `registered as type ${result.id}`, undefined, cmdAuthor)
              break
            }

            case 'add_timer': {
              const timerId = cmd.id as string || cmd.timerId as string
              const hookId = cmd.hookId as string
              const delay = cmd.delay as number
              if (!timerId || !hookId || !delay) { pushTerminal('add_timer', undefined, 'ERROR: id, hookId, and delay required'); break }
              sim.addTimer(timerId, hookId, delay, !!(cmd.repeat))
              if (!sim.running) { sim.running = true; setRunning(true) }
              pushTerminal('add_timer', undefined, `"${timerId}" → hook "${hookId}" after ${delay}s${cmd.repeat ? ' (repeat)' : ''}`)
              break
            }

            case 'remove_timer': {
              const timerId = cmd.id as string || cmd.timerId as string
              if (!timerId) { pushTerminal('remove_timer', undefined, 'ERROR: id required'); break }
              sim.removeTimer(timerId)
              pushTerminal('remove_timer', undefined, `"${timerId}" removed`)
              break
            }

            case 'fire_event': {
              const eventName = cmd.event as string || cmd.name as string
              if (!eventName) { pushTerminal('fire_event', undefined, 'ERROR: event/name required'); break }
              sim.fireEvent(eventName, cmd.data as Record<string, unknown> | undefined)
              pushTerminal('fire_event', undefined, `"${eventName}"`)
              break
            }

            case 'add_collision_callback': {
              const cbId = cmd.id as string
              if (!cbId) { pushTerminal('add_collision_callback', undefined, 'ERROR: id required'); break }
              sim.addCollisionCallback({
                id: cbId,
                matchA: (cmd.matchA as { fieldId?: string; tag?: string }) || {},
                matchB: (cmd.matchB as { fieldId?: string; tag?: string }) || {},
                onEnter: cmd.onEnter as string | undefined,
                onExit: cmd.onExit as string | undefined,
                onStay: cmd.onStay as string | undefined,
              })
              if (!sim.running) { sim.running = true; setRunning(true) }
              pushTerminal('add_collision_callback', undefined, `"${cbId}" registered`)
              break
            }

            case 'remove_collision_callback': {
              const cbId = cmd.id as string
              if (!cbId) { pushTerminal('remove_collision_callback', undefined, 'ERROR: id required'); break }
              sim.removeCollisionCallback(cbId)
              pushTerminal('remove_collision_callback', undefined, `"${cbId}" removed`)
              break
            }

            case 'tween': {
              const tweenId = cmd.id as string || `tween_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
              const fieldId = cmd.fieldId as string
              const property = cmd.property as string
              const to = cmd.to as number
              const duration = cmd.duration as number
              if (!fieldId || !property || to === undefined || !duration) {
                pushTerminal('tween', cmd.fieldId, 'ERROR: fieldId, property, to, and duration required')
                break
              }
              sim.addTween(tweenId, fieldId, property, to, duration, (cmd.easing as 'linear' | 'easeIn' | 'easeOut' | 'easeInOut') || 'linear', cmd.onComplete as string | undefined)
              if (!sim.running) { sim.running = true; setRunning(true) }
              pushTerminal('tween', fieldId, `${property} → ${to} over ${duration}s (${cmd.easing || 'linear'})`)
              break
            }

            case 'cancel_tween': {
              const tweenId = cmd.id as string
              if (!tweenId) { pushTerminal('cancel_tween', undefined, 'ERROR: id required'); break }
              sim.cancelTween(tweenId)
              pushTerminal('cancel_tween', undefined, `"${tweenId}" cancelled`)
              break
            }

            case 'status':
              pushTerminal('status', undefined, `fields=${sim.fields.size} running=${sim.running} effects=${sim.getFieldsWithEffects().length} rules=${sim.interactionRules.length} projectiles=${sim.projectiles.length} mods=${wgslModsRef.current.size} tweens=${sim.tweens.size} timers=${sim.timers.size} gameState=${sim.gameState || 'none'}`)
              break
          }
        } catch (err) {
          console.error('Agent command error:', err)
        }
      }

      es.onerror = () => {
        setAgentConnected(false)
        es?.close()
        // Retry in 5s
        retryTimeout = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      clearTimeout(retryTimeout)
      es?.close()
      setAgentConnected(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Intentionally empty — refs handle the mutable state

  // Periodic state sync — push field snapshots to server every 2s
  useEffect(() => {
    const interval = setInterval(async () => {
      const sim = simulationRef.current
      if (!sim || sim.fields.size === 0) return
      try {
        // Enrich worldData with cell presence samples for agents
        sim.worldData['cellSample'] = {
          center: sim.getCellInfo(256, 256),
          fieldSamples: Object.fromEntries(
            Array.from(sim.fields.values()).map(f => [
              f.id,
              sim.getCellInfo(Math.round(f.transform.x), Math.round(f.transform.y))
            ])
          ),
        }

        await fetch('/api/engine/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: sim.generateSnapshots(),
            worldParams: sim.getWorldParams(),
            stepHooks: sim.getStepHookSnapshots(),
            worldData: sim.worldData,
            renderedSamples: Object.fromEntries(renderedSamplesRef.current),
            interactionEffects: sim.interactionEffects,
          }),
        })
      } catch { /* best-effort */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  // Periodic snapshot — export canvas as PNG, save to disk for Claude Code
  useEffect(() => {
    const SNAPSHOT_INTERVAL = 30000 // every 30 seconds
    const interval = setInterval(async () => {
      const canvas = canvasRef.current
      if (!canvas) return
      try {
        const dataUrl = canvas.toDataURL('image/png')
        if (!dataUrl || dataUrl === 'data:,') return
        await fetch('/api/engine/save-snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: dataUrl }),
        })
      } catch { /* best-effort */ }
    }, SNAPSHOT_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  const selectedField = selection.selectedFieldId ? fields.get(selection.selectedFieldId) : null

  return (
    <div className="fixed inset-0 bg-background overflow-hidden flex">
      {/* Canvas + fields panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Canvas area */}
        <div className="flex-1 relative overflow-hidden min-h-0">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ cursor: 'grab' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onContextMenu={e => e.preventDefault()}
            onPointerLeave={() => { setPixelInfo(null); if (pixelInfoTimeout.current) clearTimeout(pixelInfoTimeout.current) }}
          />

          {/* HUD overlay — positioned absolutely over the canvas, pointer-events disabled */}
          <div
            ref={hudContainerRef}
            className="absolute inset-0 pointer-events-none z-10 font-mono"
            style={{ fontFamily: 'monospace' }}
          />

          {/* Pixel hover tooltip */}
          {pixelInfo && (
            <div
              className="fixed z-50 pointer-events-none bg-black/85 text-white text-[10px] font-mono px-2 py-1 rounded border border-white/20 whitespace-nowrap"
              style={{ left: pixelInfo.screenX + 14, top: pixelInfo.screenY - 10 }}
            >
              <div>({pixelInfo.gridX}, {pixelInfo.gridY})</div>
              <div className="flex items-center gap-1">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm border border-white/30"
                  style={{ backgroundColor: `rgba(${pixelInfo.r},${pixelInfo.g},${pixelInfo.b},${pixelInfo.a / 255})` }}
                />
                rgba({pixelInfo.r},{pixelInfo.g},{pixelInfo.b},{pixelInfo.a})
              </div>
              {pixelInfo.fields.length > 0 && (
                <div className="text-accent">{pixelInfo.fields.join(', ')}</div>
              )}
            </div>
          )}

          {/* Info overlay */}
          <div className="absolute top-3 left-3 text-[10px] text-muted font-mono flex items-center gap-2">
            <span className="pointer-events-none">
              {gridSize}x{gridSize} | zoom: {cameraRef.current.zoom.toFixed(1)}x
              {selectedField && <span> | selected: {selectedField.name}</span>}
              {agentConnected && <span className="text-accent"> | agent live</span>}
            </span>
            <button
              onClick={() => {
                const sim = simulationRef.current
                const renderer = rendererRef.current
                if (!sim || !renderer) return
                for (const field of sim.fields.values()) {
                  renderer.removeAllFieldEffects(field.id)
                }
                sim.clearAll()
                sim.fields.clear()
                sim.interactionRules = []
                sim.customCommands.clear()

                updateSelectionMask(null)
                syncFields()
                fetch('/api/engine/agent', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (document.cookie.match(/token=([^;]*)/)?.[1] || '') },
                  body: JSON.stringify({ type: 'reset' }),
                }).catch(() => {})
              }}
              className="px-2 py-1 bg-error/20 text-error border border-error/30 rounded text-[10px] font-bold hover:bg-error/40 transition-colors"
            >
              RESET MATCH
            </button>
          </div>

          {/* User prompt input */}
          <div className="absolute bottom-3 right-3 z-10">
            <input
              type="text"
              className="bg-black/80 border border-border text-white text-xs font-mono px-2 py-1 w-64 rounded"
              placeholder="Type a prompt..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  const sim = simulationRef.current
                  if (sim) {
                    sim.worldData['user_prompt'] = e.currentTarget.value
                    sim.worldData['user_prompt_time'] = Date.now()
                  }
                  e.currentTarget.value = ''
                }
              }}
            />
          </div>
        </div>

        {/* Field list panel — scrollable under the canvas */}
        <div className="h-40 flex-shrink-0 border-t border-border bg-background/95 overflow-y-auto">
          <div className="px-3 py-2">
            <div className="text-[10px] text-muted font-mono mb-1">{fields.size} fields</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1">
              {Array.from(fields.values()).map(f => (
                <div
                  key={f.id}
                  onClick={() => setBrush(prev => ({ ...prev, activeFieldId: f.id }))}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                    brush.activeFieldId === f.id
                      ? 'bg-accent/20 border border-accent/40'
                      : 'bg-surface/50 border border-border hover:border-muted'
                  }`}
                >
                  <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{
                    backgroundColor: `rgba(${Math.round(f.color[0]*255)},${Math.round(f.color[1]*255)},${Math.round(f.color[2]*255)},${f.color[3]})`
                  }} />
                  <span className="text-foreground truncate">{f.name}</span>
                  <span className="text-muted ml-auto flex-shrink-0">
                    {f.effects.length > 0 ? `${f.effects.length}fx` : '—'}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteField(f.id) }}
                    className="text-error/50 hover:text-error text-xs ml-1 flex-shrink-0"
                    title={`Delete ${f.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Agent activity sidebar */}
      <div className="w-96 flex-shrink-0 flex flex-col border-l border-border bg-background">
        <AgentDialogPanel entries={dialogLog} />
        <div className="border-t border-border" />
        <AgentTerminalPanel entries={terminalLog} />
      </div>
    </div>
  )
}
