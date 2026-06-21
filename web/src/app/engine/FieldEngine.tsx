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
import type { BrushState, Camera, Field, FieldEffect, SelectionState, GenerationState } from './types'
import { GRID_SIZE } from './types'
import { DEFAULT_FIELD_EFFECT_GLSL } from './shaders'

let fieldCounter = 0
function genFieldId() {
  return `field_${++fieldCounter}_${Date.now()}`
}

let effectCounter = 0
function genEffectId() {
  return `effect_${++effectCounter}_${Date.now()}`
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

/** Format cell count for display */
function cellLabel(cellCount: number): string {
  return `${cellCount} cells`
}

export default function FieldEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<FieldRenderer | null>(null)
  const simulationRef = useRef<FieldSimulation | null>(null)
  const inputRef = useRef<FieldInput | null>(null)
  const animFrameRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)
  const lastFrameRef = useRef<number>(0)

  // Camera
  const cameraRef = useRef<Camera>({ x: GRID_SIZE / 2, y: GRID_SIZE / 2, zoom: 1 })
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
    selectionMask: new Uint8Array(GRID_SIZE * GRID_SIZE),
  })

  // Generation state — UI-only loading tracker, GLSL lives on Field objects
  const [generation, setGeneration] = useState<GenerationState>({
    loading: false,
    error: null,
    targetFieldId: null,
  })

  // Pointer state for panning
  const pointerDown = useRef(false)
  const isPanning = useRef(false)
  const lastPointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // Sync fields from simulation to React state
  const syncFields = useCallback(() => {
    const sim = simulationRef.current
    if (!sim) return
    setFields(new Map(sim.fields))
  }, [])

  // Update selection mask from field cells and upload to GPU
  const updateSelectionMask = useCallback((fieldId: string | null) => {
    const sim = simulationRef.current
    const renderer = rendererRef.current
    if (!sim || !renderer) return

    let mask: Uint8Array
    if (fieldId) {
      mask = sim.generateCellMask(fieldId) || new Uint8Array(GRID_SIZE * GRID_SIZE)
    } else {
      mask = new Uint8Array(GRID_SIZE * GRID_SIZE)
    }

    renderer.uploadSelectionData(mask)
    setSelection({ selectedFieldId: fieldId, selectionMask: mask })
  }, [])

  /** Compile the default solid-color shader for a field and upload its mask */
  const compileDefaultEffect = useCallback((fieldId: string, field: Field) => {
    const renderer = rendererRef.current
    const sim = simulationRef.current
    if (!renderer || !sim) return

    const defaultEffectId = `${fieldId}_default`
    const result = renderer.compileFieldEffect(defaultEffectId, DEFAULT_FIELD_EFFECT_GLSL)
    if (result.success) {
      const mask = sim.generateCellMask(fieldId)
      if (mask) renderer.uploadFieldMask(defaultEffectId, mask)
    }
  }, [])

  // Create field
  const handleCreateField = useCallback(() => {
    const sim = simulationRef.current
    if (!sim) return
    const id = genFieldId()
    const hue = DEFAULT_HUES[sim.fields.size % DEFAULT_HUES.length]
    const color = hueToRgba(hue)
    const name = `Field ${sim.fields.size + 1}`
    sim.createField(id, name, color)

    const field = sim.fields.get(id)
    if (field) compileDefaultEffect(id, field)

    setBrush(prev => ({ ...prev, activeFieldId: id }))
    syncFields()
  }, [syncFields, compileDefaultEffect])

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
      const result = renderer.compileFieldEffect(programKey, data.glsl)

      if (result.success) {
        const effect: FieldEffect = {
          id: effectId,
          author: 'user',
          glsl: data.glsl,
          description: data.description || 'AI generated',
          blend: 'alpha',
          order: 10,
        }
        sim.addFieldEffect(targetFieldId, effect)

        // Upload field mask
        const mask = sim.generateCellMask(targetFieldId)
        if (mask) renderer.uploadFieldMask(programKey, mask)

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
      // Re-compile default shader so field is still visible
      compileDefaultEffect(fieldId, field)
    }
    setGeneration({ loading: false, error: null, targetFieldId: null })
    syncFields()
  }, [selection.selectedFieldId, syncFields, compileDefaultEffect])

  // Pointer handlers — canvas is view-only (agents do the painting)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    pointerDown.current = true
    lastPointer.current = { x: e.clientX, y: e.clientY }

    // Always pan on click (left or middle button)
    isPanning.current = true
    canvas.style.cursor = 'grabbing'
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerDown.current || !isPanning.current) return

    const input = inputRef.current
    const canvas = canvasRef.current
    if (!input || !canvas) return

    const rect = canvas.getBoundingClientRect()
    const camera = cameraRef.current
    const dx = e.clientX - lastPointer.current.x
    const dy = e.clientY - lastPointer.current.y
    const delta = input.screenDeltaToGridDelta(dx, dy, rect, camera.zoom)

    camera.x -= delta.dx
    camera.y -= delta.dy
    lastPointer.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handlePointerUp = useCallback(() => {
    isPanning.current = false
    pointerDown.current = false
    const canvas = canvasRef.current
    if (canvas) canvas.style.cursor = 'grab'
  }, [])

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

  // Initialize engine
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new FieldRenderer()
    const sim = new FieldSimulation()
    const input = new FieldInput()

    rendererRef.current = renderer
    simulationRef.current = sim
    inputRef.current = input

    if (!renderer.init(canvas)) {
      console.error('Failed to initialize WebGL2 renderer')
      return
    }

    // Upload initial empty textures
    renderer.uploadColorData(sim.world.colorData)
    renderer.uploadStateData(sim.world.stateData)
    renderer.uploadSelectionData(new Uint8Array(GRID_SIZE * GRID_SIZE))

    startTimeRef.current = performance.now() / 1000
    lastFrameRef.current = performance.now()

    // Restore state from server, or create initial field
    fetch('/api/engine/state')
      .then(r => r.json())
      .then(data => {
        const sim = simulationRef.current
        const renderer = rendererRef.current
        if (!sim || !renderer) return
        const snaps = data.fields || []
        if (snaps.length > 0) {
          sim.restoreFromSnapshots(snaps)
          if (data.worldParams) sim.setWorldParams(data.worldParams)
          const firstId = snaps[0].id

          // Restore effect programs for all fields
          for (const field of sim.fields.values()) {
            // Always compile default shader
            const defaultKey = `${field.id}_default`
            const defResult = renderer.compileFieldEffect(defaultKey, DEFAULT_FIELD_EFFECT_GLSL)
            if (defResult.success) {
              const mask = sim.generateCellMask(field.id)
              if (mask) renderer.uploadFieldMask(defaultKey, mask)
            }
            // Restore custom effects
            for (const effect of field.effects) {
              const programKey = `${field.id}_${effect.id}`
              const result = renderer.compileFieldEffect(programKey, effect.glsl)
              if (result.success) {
                const mask = sim.generateCellMask(field.id)
                if (mask) renderer.uploadFieldMask(programKey, mask)
              }
            }
          }

          setBrush(prev => ({ ...prev, activeFieldId: firstId }))
        }
        setFields(new Map(sim.fields))
      })
      .catch(() => {
        setFields(new Map(sim.fields))
      })

    // Render loop
    function frame() {
      const now = performance.now()
      const dt = (now - lastFrameRef.current) / 1000
      lastFrameRef.current = now

      const sim = simulationRef.current
      const renderer = rendererRef.current
      if (!sim || !renderer) return

      sim.step(dt)

      renderer.uploadColorData(sim.world.colorData)
      renderer.uploadStateData(sim.world.stateData)

      const camera = cameraRef.current
      const time = now / 1000 - startTimeRef.current

      // Build effect list from all fields' effect stacks + default shaders
      const fieldEffects: FieldEffectData[] = []
      for (const field of sim.fields.values()) {
        const bounds = sim.getFieldBounds(field.id)
        if (!bounds) continue

        // Generate cell mask for this field (updated each frame for moving fields)
        const mask = sim.generateCellMask(field.id)

        // Default solid-color shader (always rendered)
        const defaultKey = `${field.id}_default`
        if (renderer.hasFieldEffect(defaultKey)) {
          if (mask) renderer.uploadFieldMask(defaultKey, mask)
          fieldEffects.push({
            fieldId: field.id,
            programKey: defaultKey,
            bounds: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY],
            transform: [field.transform.x, field.transform.y, field.transform.rotation, field.transform.scale],
            params: [field.color[0], field.color[1], field.color[2], field.color[3]],
            blend: 'alpha',
          })
        }

        // Custom effects from the effect stack
        for (const effect of field.effects) {
          const programKey = `${field.id}_${effect.id}`
          if (!renderer.hasFieldEffect(programKey)) continue
          if (mask) renderer.uploadFieldMask(programKey, mask)
          fieldEffects.push({
            fieldId: field.id,
            programKey,
            bounds: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY],
            transform: [field.transform.x, field.transform.y, field.transform.rotation, field.transform.scale],
            params: [field.color[0], field.color[1], field.color[2], field.color[3]],
            blend: effect.blend,
          })
        }
      }

      renderer.render(camera, camera.zoom, time, fieldEffects)

      animFrameRef.current = requestAnimationFrame(frame)
    }

    animFrameRef.current = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      renderer.destroy()
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

          // Helper to push terminal entries
          const pushTerminal = (type: string, fieldId: string | undefined, summary: string, detail?: string) => {
            const field = fieldId ? sim.fields.get(fieldId) : undefined
            setTerminalLog(prev => [...prev.slice(-99), {
              type,
              fieldName: field?.name || fieldId || '?',
              fieldColor: field?.color || [0.5, 0.5, 0.5, 1],
              summary,
              detail,
              timestamp: Date.now(),
            }])
          }

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

                const effectId = genEffectId()
                const programKey = `${targetFieldId}_${effectId}`
                const result = renderer.compileFieldEffect(programKey, genData.glsl)
                if (result.success) {
                  const effect: FieldEffect = {
                    id: effectId,
                    author: 'ai_generate',
                    glsl: genData.glsl,
                    description: genData.description || 'AI generated',
                    blend: 'alpha',
                    order: 10,
                  }
                  sim.addFieldEffect(targetFieldId, effect)
                  const mask = sim.generateCellMask(targetFieldId)
                  if (mask) renderer.uploadFieldMask(programKey, mask)
                  setGeneration({ loading: false, error: null, targetFieldId: null })
                  syncFields()
                  pushTerminal('generate', targetFieldId, 'complete', genData.glsl)
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

            case 'inject_glsl': {
              // Backward-compatible: translates to add_effect. If same author has an
              // existing effect, replaces it.
              const allFieldIds = Array.from(sim.fields.keys())
              const targetId = cmd.fieldId || allFieldIds[0]
              if (!targetId) {
                pushTerminal('inject_glsl', undefined, 'ERROR: no fields exist')
                break
              }

              // Consent check: fields can only code themselves
              const fromField = (cmd as Record<string, unknown>).fromFieldId as string | undefined
              if (fromField && fromField !== targetId) {
                const targetField = sim.fields.get(targetId)
                pushTerminal('inject_glsl', fromField, `BLOCKED: cannot code '${targetField?.name || targetId}' — send a field_message proposing your shader instead`)
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
              const result = renderer.compileFieldEffect(programKey, cmd.glsl)

              if (result.success) {
                const effect: FieldEffect = {
                  id: effectId,
                  author,
                  glsl: cmd.glsl,
                  description: cmd.description || 'Injected by agent',
                  blend: 'alpha',
                  order: 10,
                }
                sim.addFieldEffect(targetId, effect)

                const mask = sim.generateCellMask(targetId)
                if (mask) renderer.uploadFieldMask(programKey, mask)

                syncFields()
                pushTerminal('inject_glsl', targetId, cmd.description || 'shader injected', cmd.glsl)
              } else {
                pushTerminal('inject_glsl', targetId, `COMPILE ERROR: ${result.error?.substring(0, 100)}`)
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
                pushTerminal('add_effect', targetId, 'ERROR: field not found')
                break
              }

              const effectId = genEffectId()
              const programKey = `${targetId}_${effectId}`
              const blend = cmd.blend || 'alpha'
              const result = renderer.compileFieldEffect(programKey, cmd.glsl)

              if (result.success) {
                const effect: FieldEffect = {
                  id: effectId,
                  author: cmd.author || cmd.fromFieldId || 'agent',
                  glsl: cmd.glsl,
                  description: cmd.description || 'effect added',
                  blend,
                  order: cmd.order ?? (field.effects.length + 1) * 10,
                }
                sim.addFieldEffect(targetId, effect)

                const mask = sim.generateCellMask(targetId)
                if (mask) renderer.uploadFieldMask(programKey, mask)

                syncFields()
                pushTerminal('add_effect', targetId, `${effect.description} (${blend})`, cmd.glsl)
              } else {
                pushTerminal('add_effect', targetId, `COMPILE ERROR: ${result.error?.substring(0, 100)}`)
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

            case 'clear_effect': {
              const clearTargetId = cmd.fieldId || undefined
              if (clearTargetId) {
                renderer.removeAllFieldEffects(clearTargetId)
                const field = sim.fields.get(clearTargetId)
                if (field) {
                  field.effects = []
                  // Re-compile default shader
                  const defaultKey = `${clearTargetId}_default`
                  const defResult = renderer.compileFieldEffect(defaultKey, DEFAULT_FIELD_EFFECT_GLSL)
                  if (defResult.success) {
                    const mask = sim.generateCellMask(clearTargetId)
                    if (mask) renderer.uploadFieldMask(defaultKey, mask)
                  }
                }
                syncFields()
              } else {
                // Clear all effects from all fields
                for (const field of sim.fields.values()) {
                  renderer.removeAllFieldEffects(field.id)
                  field.effects = []
                  // Re-compile default shader
                  const defaultKey = `${field.id}_default`
                  const defResult = renderer.compileFieldEffect(defaultKey, DEFAULT_FIELD_EFFECT_GLSL)
                  if (defResult.success) {
                    const mask = sim.generateCellMask(field.id)
                    if (mask) renderer.uploadFieldMask(defaultKey, mask)
                  }
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
              renderer.removeAllWorldEffects()
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
              renderer.removeAllWorldEffects()
              sim.clearAll()
              sim.fields.clear()
              sim.interactionRules = []
              sim.customCommands.clear()

              updateSelectionMask(null)
              setGeneration({ loading: false, error: null, targetFieldId: null })
              syncFields()
              pushTerminal('reset', undefined, 'Full reset — all fields and rules deleted')
              break

            case 'create_field': {
              const id = genFieldId()
              const hue = DEFAULT_HUES[sim.fields.size % DEFAULT_HUES.length]
              const color = cmd.color || hueToRgba(hue)
              const name = cmd.name || `Field ${sim.fields.size + 1}`

              sim.createField(id, name, color)

              // Paint initial cells if provided
              if (cmd.cells && Array.isArray(cmd.cells)) {
                sim.paintCells(id, cmd.cells, color)
              }

              // Compile default shader
              const field = sim.fields.get(id)
              if (field && field.cells.size > 0) {
                const defaultKey = `${id}_default`
                const defResult = renderer.compileFieldEffect(defaultKey, DEFAULT_FIELD_EFFECT_GLSL)
                if (defResult.success) {
                  const mask = sim.generateCellMask(id)
                  if (mask) renderer.uploadFieldMask(defaultKey, mask)
                }
              }

              setBrush(prev => ({ ...prev, activeFieldId: id }))
              syncFields()
              pushTerminal('create_field', id, `'${name}'`)
              break
            }

            case 'paint': {
              const targetId = cmd.fieldId || brush.activeFieldId
              if (!targetId) break
              const field = sim.fields.get(targetId)
              if (!field) break
              const cells = cmd.cells as number[] | undefined
              if (!cells || !Array.isArray(cells)) break
              const color = cmd.color || field.color
              sim.paintCells(targetId, cells, color)

              // Ensure default shader is compiled
              const defaultKey = `${targetId}_default`
              if (!renderer.hasFieldEffect(defaultKey)) {
                renderer.compileFieldEffect(defaultKey, DEFAULT_FIELD_EFFECT_GLSL)
              }

              syncFields()
              pushTerminal('paint', targetId, `${cells.length} cells`)
              break
            }

            case 'erase': {
              const cells = cmd.cells as number[] | undefined
              if (!cells || !Array.isArray(cells)) break
              sim.eraseCells(cells)
              syncFields()
              pushTerminal('erase', undefined, `${cells.length} cells`)
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

            case 'set_position': {
              const posField = sim.fields.get(cmd.fieldId)
              if (!posField) break
              sim.setPosition(cmd.fieldId, cmd.x, cmd.y)
              syncFields()
              pushTerminal('set_position', cmd.fieldId, `(${cmd.x}, ${cmd.y})`)
              break
            }

            case 'set_velocity': {
              const velField = sim.fields.get(cmd.fieldId)
              if (!velField) break
              velField.transform.vx = cmd.vx
              velField.transform.vy = cmd.vy
              if (cmd.vr !== undefined) velField.transform.vr = cmd.vr
              if (!sim.running) {
                sim.running = true
                setRunning(true)
              }
              syncFields()
              pushTerminal('set_velocity', cmd.fieldId, `vx=${cmd.vx}, vy=${cmd.vy}`)
              break
            }

            case 'set_world_params': {
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
              pushTerminal('set_world_data', cmd.fieldId, wdKeys.join(', ') || '(no data)')
              break
            }

            case 'define_interaction': {
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
              if (!cmd.hookId || !cmd.code) {
                pushTerminal('add_step_hook', cmd.author, 'ERROR: hookId and code required')
                break
              }
              const hookOk = sim.addStepHook(cmd.hookId, cmd.author || 'unknown', cmd.description || '', cmd.code)
              if (hookOk) {
                if (!sim.running) { sim.running = true; setRunning(true) }
                pushTerminal('add_step_hook', cmd.author, `"${cmd.hookId}": ${cmd.description || 'step hook added'}`, cmd.code)
              } else {
                pushTerminal('add_step_hook', cmd.author, `COMPILE ERROR for "${cmd.hookId}"`)
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

            case 'add_world_effect': {
              const effectId = genEffectId()
              const blend = cmd.blend || 'alpha'
              const worldResult = renderer.compileWorldEffect(effectId, cmd.glsl, blend)
              if (worldResult.success) {
                pushTerminal('add_world_effect', cmd.fieldId, cmd.description || 'world effect added', cmd.glsl)
              } else {
                pushTerminal('add_world_effect', cmd.fieldId, `COMPILE ERROR: ${worldResult.error?.substring(0, 100)}`)
              }
              break
            }

            case 'remove_world_effect': {
              if (cmd.effectId) {
                renderer.removeWorldEffect(cmd.effectId)
                pushTerminal('remove_world_effect', undefined, `removed ${cmd.effectId}`)
              }
              break
            }

            case 'inject_world_glsl': {
              // Backward-compatible: translates to add_world_effect
              const effectId = genEffectId()
              const worldResult = renderer.compileWorldEffect(effectId, cmd.glsl, 'alpha')
              if (worldResult.success) {
                pushTerminal('inject_world_glsl', (cmd as Record<string, unknown>).fieldId as string, cmd.description || 'world shader set', cmd.glsl)
              } else {
                pushTerminal('inject_world_glsl', (cmd as Record<string, unknown>).fieldId as string, `COMPILE ERROR: ${worldResult.error?.substring(0, 100)}`)
              }
              break
            }

            case 'clear_world_effect': {
              renderer.removeAllWorldEffects()
              pushTerminal('clear_world_effect', undefined, 'all world effects removed')
              break
            }

            case 'status':
              pushTerminal('status', undefined, `fields=${sim.fields.size} running=${sim.running} effects=${sim.getFieldsWithEffects().length} rules=${sim.interactionRules.length}`)
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
        await fetch('/api/engine/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: sim.generateSnapshots(), worldParams: sim.getWorldParams() }),
        })
      } catch { /* best-effort */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  const selectedField = selection.selectedFieldId ? fields.get(selection.selectedFieldId) : null

  return (
    <div className="fixed inset-0 bg-background overflow-hidden flex">
      {/* Canvas area */}
      <div className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ cursor: 'grab' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={e => e.preventDefault()}
        />

        {/* Info overlay */}
        <div className="absolute top-3 left-3 text-[10px] text-muted font-mono flex items-center gap-2">
          <span className="pointer-events-none">
            {GRID_SIZE}x{GRID_SIZE} | zoom: {cameraRef.current.zoom.toFixed(1)}x
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
              renderer.removeAllWorldEffects()
              sim.clearAll()
              sim.fields.clear()
              sim.interactionRules = []
              sim.customCommands.clear()

              updateSelectionMask(null)
              syncFields()
              // Also reset server store
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

        {/* Field legend */}
        <div className="absolute bottom-3 left-3 text-[10px] font-mono pointer-events-none">
          {Array.from(fields.values()).map(f => (
            <div key={f.id} className="flex items-center gap-1 mb-0.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{
                backgroundColor: `rgb(${Math.round(f.color[0]*255)},${Math.round(f.color[1]*255)},${Math.round(f.color[2]*255)})`
              }} />
              <span className="text-muted">{f.name}: {cellLabel(f.cells.size)}{f.effects.length > 0 ? ` +${f.effects.length}fx` : ''}</span>
            </div>
          ))}
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
