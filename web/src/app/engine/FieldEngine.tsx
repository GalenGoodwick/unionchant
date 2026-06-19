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
import type { BrushState, Camera, Field, FieldProperty, SelectionState, GenerationState } from './types'
import { GRID_SIZE } from './types'

let fieldCounter = 0
function genFieldId() {
  return `field_${++fieldCounter}_${Date.now()}`
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


  // Previous cell counts for change tracking
  const prevCellCounts = useRef<Map<string, number>>(new Map())

  // Pointer state for drawing
  const pointerDown = useRef(false)
  const isPanning = useRef(false)
  const lastPointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const shapeStart = useRef<{ x: number; y: number } | null>(null)
  const freeformPoints = useRef<{ x: number; y: number }[]>([])

  // Sync fields from simulation to React state
  const syncFields = useCallback(() => {
    const sim = simulationRef.current
    if (!sim) return

    // Track cell count changes
    for (const [id, field] of sim.fields) {
      const prev = prevCellCounts.current.get(id) ?? 0
      const curr = field.cells.size
      if (prev !== curr && prev !== 0) {
        const delta = curr - prev
        sim.addMemory(id, {
          timestamp: new Date().toISOString(),
          type: 'cells_changed',
          content: `Cell count ${delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(delta)} (${prev} → ${curr})`,
          sourceFieldId: null,
          data: { previous: prev, current: curr, delta },
        })
      }
      prevCellCounts.current.set(id, curr)
    }
    // Clean up removed fields
    for (const id of prevCellCounts.current.keys()) {
      if (!sim.fields.has(id)) prevCellCounts.current.delete(id)
    }

    setFields(new Map(sim.fields))
  }, [])

  // Update selection mask and upload to GPU
  const updateSelectionMask = useCallback((fieldId: string | null) => {
    const sim = simulationRef.current
    const renderer = rendererRef.current
    if (!sim || !renderer) return

    const mask = new Uint8Array(GRID_SIZE * GRID_SIZE)

    if (fieldId) {
      const field = sim.fields.get(fieldId)
      if (field) {
        for (const cellIndex of field.cells) {
          mask[cellIndex] = 255
        }
      }
    }

    renderer.uploadSelectionData(mask)
    setSelection({ selectedFieldId: fieldId, selectionMask: mask })
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
    setBrush(prev => ({ ...prev, activeFieldId: id }))
    syncFields()
  }, [syncFields])

  // Delete field — also removes any active effect
  const handleDeleteField = useCallback((id: string) => {
    const sim = simulationRef.current
    const renderer = rendererRef.current
    if (!sim) return

    // Remove effect program before removing field
    if (renderer) renderer.removeFieldEffect(id)

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

  // Change field color
  const handleFieldColorChange = useCallback((id: string, color: [number, number, number, number]) => {
    const sim = simulationRef.current
    if (!sim) return
    const field = sim.fields.get(id)
    if (!field) return
    field.color = color
    if (field.cells.size > 0) {
      sim.paintCells(id, Array.from(field.cells), color)
    }
    syncFields()
  }, [syncFields])

  // Add property to field
  const handleAddProperty = useCallback((fieldId: string, name: string) => {
    const sim = simulationRef.current
    if (!sim) return
    const field = sim.fields.get(fieldId)
    if (!field) return
    if (field.properties.has(name)) return
    field.properties.set(name, { name, value: 50, min: 0, max: 100 })
    syncFields()
  }, [syncFields])

  // Update property
  const handleUpdateProperty = useCallback((fieldId: string, name: string, updates: Partial<FieldProperty>) => {
    const sim = simulationRef.current
    if (!sim) return
    const field = sim.fields.get(fieldId)
    if (!field) return
    const prop = field.properties.get(name)
    if (!prop) return
    Object.assign(prop, updates)
    syncFields()
  }, [syncFields])

  // Remove property
  const handleRemoveProperty = useCallback((fieldId: string, name: string) => {
    const sim = simulationRef.current
    if (!sim) return
    const field = sim.fields.get(fieldId)
    if (!field) return
    field.properties.delete(name)
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
        if (field.glsl) {
          renderer.removeFieldEffect(field.id)
        }
      }
    }

    sim.clearAll()
    // Also clear GLSL from all fields
    for (const field of sim.fields.values()) {
      field.glsl = null
      field.effectDescription = null
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

      const result = renderer.compileFieldEffect(targetFieldId, data.glsl)

      if (result.success) {
        // Reset transform when new effect is generated
        const field = sim.fields.get(targetFieldId)
        if (field) {
          field.transform = { x: 0, y: 0, rotation: 0, scale: 1, vx: 0, vy: 0, vr: 0 }
        }

        // Store GLSL on the field itself
        sim.setFieldEffect(targetFieldId, data.glsl, data.description)

        // Upload field mask
        const mask = new Uint8Array(GRID_SIZE * GRID_SIZE)
        const maskField = sim.fields.get(targetFieldId)
        if (maskField) {
          for (const idx of maskField.cells) mask[idx] = 255
        }
        renderer.uploadFieldMask(targetFieldId, mask)

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

    renderer.removeFieldEffect(fieldId)
    sim.setFieldEffect(fieldId, null, null)
    setGeneration({ loading: false, error: null, targetFieldId: null })
    syncFields()
  }, [selection.selectedFieldId, syncFields])

  // Paint at cell position
  const paintAt = useCallback((screenX: number, screenY: number) => {
    const sim = simulationRef.current
    const input = inputRef.current
    const canvas = canvasRef.current
    if (!sim || !input || !canvas || !brush.activeFieldId) return

    const field = sim.fields.get(brush.activeFieldId)
    if (!field) return

    const rect = canvas.getBoundingClientRect()
    const camera = cameraRef.current
    const cell = input.screenToCell(screenX, screenY, rect, camera, camera.zoom)

    if (brush.tool === 'brush') {
      const cells = input.getBrushCells(cell.x, cell.y, brush.size)
      sim.paintCells(brush.activeFieldId, cells, field.color)
    }
  }, [brush.activeFieldId, brush.tool, brush.size])

  // Finalize shape drawing
  const finalizeShape = useCallback((screenX: number, screenY: number) => {
    const sim = simulationRef.current
    const input = inputRef.current
    const canvas = canvasRef.current
    if (!sim || !input || !canvas || !brush.activeFieldId || !shapeStart.current) return

    const field = sim.fields.get(brush.activeFieldId)
    if (!field) return

    const rect = canvas.getBoundingClientRect()
    const camera = cameraRef.current
    const endCell = input.screenToCell(screenX, screenY, rect, camera, camera.zoom)
    const startCell = shapeStart.current

    let cells: number[] = []
    switch (brush.tool) {
      case 'line':
        cells = input.getLineCells(startCell, endCell, brush.size)
        break
      case 'circle': {
        const dx = endCell.x - startCell.x
        const dy = endCell.y - startCell.y
        const radius = Math.round(Math.sqrt(dx * dx + dy * dy))
        cells = input.getCircleCells(startCell, radius)
        break
      }
      case 'rect':
        cells = input.getRectCells(startCell, endCell)
        break
      case 'freeform':
        cells = input.getFreeformCells(freeformPoints.current, brush.size)
        break
    }

    if (cells.length > 0) {
      sim.paintCells(brush.activeFieldId, cells, field.color)
    }
    syncFields()
  }, [brush.activeFieldId, brush.tool, brush.size, syncFields])

  // Pointer handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    pointerDown.current = true
    lastPointer.current = { x: e.clientX, y: e.clientY }

    // Pan on middle button
    if (e.button === 1) {
      isPanning.current = true
      canvas.style.cursor = 'grabbing'
      return
    }

    const input = inputRef.current
    const sim = simulationRef.current
    if (!input || !sim) return

    const rect = canvas.getBoundingClientRect()
    const camera = cameraRef.current
    const cell = input.screenToCell(e.clientX, e.clientY, rect, camera, camera.zoom)
    const cellIndex = cell.y * GRID_SIZE + cell.x

    // Select mode: click to select field
    if (brush.tool === 'select') {
      const field = sim.getFieldAtCell(cellIndex)
      if (field) {
        updateSelectionMask(field.id)
        setBrush(prev => ({ ...prev, activeFieldId: field.id }))
      } else {
        updateSelectionMask(null)
      }
      return
    }

    // Pan if no active field
    if (!brush.activeFieldId) {
      isPanning.current = true
      canvas.style.cursor = 'grabbing'
      return
    }

    // Drawing tools
    if (brush.tool === 'brush') {
      paintAt(e.clientX, e.clientY)
    } else if (brush.tool === 'freeform') {
      freeformPoints.current = [cell]
      shapeStart.current = cell
    } else {
      shapeStart.current = cell
    }

    canvas.setPointerCapture(e.pointerId)
  }, [brush.activeFieldId, brush.tool, paintAt, updateSelectionMask])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerDown.current) return

    if (isPanning.current) {
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
      return
    }

    if (brush.tool === 'brush') {
      paintAt(e.clientX, e.clientY)
    } else if (shapeStart.current) {
      const input = inputRef.current
      const canvas = canvasRef.current
      const renderer = rendererRef.current
      if (!input || !canvas || !renderer) return

      const rect = canvas.getBoundingClientRect()
      const camera = cameraRef.current
      const cell = input.screenToCell(e.clientX, e.clientY, rect, camera, camera.zoom)

      if (brush.tool === 'freeform') {
        freeformPoints.current.push(cell)
      }

      // Compute preview cells for the current shape
      let previewCells: number[] = []
      const startCell = shapeStart.current
      switch (brush.tool) {
        case 'line':
          previewCells = input.getLineCells(startCell, cell, brush.size)
          break
        case 'circle': {
          const dx = cell.x - startCell.x
          const dy = cell.y - startCell.y
          const radius = Math.round(Math.sqrt(dx * dx + dy * dy))
          previewCells = input.getCircleCells(startCell, radius)
          break
        }
        case 'rect':
          previewCells = input.getRectCells(startCell, cell)
          break
        case 'freeform':
          previewCells = input.getFreeformCells(freeformPoints.current, brush.size)
          break
      }

      // Show preview via selection texture
      if (previewCells.length > 0) {
        const mask = new Uint8Array(GRID_SIZE * GRID_SIZE)
        for (const idx of previewCells) {
          if (idx >= 0 && idx < mask.length) mask[idx] = 255
        }
        renderer.uploadSelectionData(mask)
      }
    }
  }, [brush.tool, brush.size, paintAt])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isPanning.current) {
      isPanning.current = false
      const canvas = canvasRef.current
      if (canvas) canvas.style.cursor = brush.tool === 'select' ? 'default' : 'crosshair'
    } else if (brush.tool !== 'brush' && brush.tool !== 'select' && shapeStart.current) {
      finalizeShape(e.clientX, e.clientY)
      shapeStart.current = null
      freeformPoints.current = []
    } else {
      syncFields()
    }
    pointerDown.current = false

    // Clear shape preview from selection texture
    const renderer = rendererRef.current
    if (renderer && brush.tool !== 'select') {
      // If there's an active selection, restore it; otherwise clear
      if (selection.selectedFieldId) {
        renderer.uploadSelectionData(selection.selectionMask)
      } else {
        renderer.uploadSelectionData(new Uint8Array(GRID_SIZE * GRID_SIZE))
      }
    }
  }, [brush.tool, finalizeShape, syncFields, selection.selectedFieldId, selection.selectionMask])

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
        if (!sim) return
        const snaps = data.fields || []
        if (snaps.length > 0) {
          sim.restoreFromSnapshots(snaps)
          if (data.worldParams) sim.setWorldParams(data.worldParams)
          const firstId = snaps[0].id
          setBrush(prev => ({ ...prev, activeFieldId: firstId }))
        } else {
          const id = genFieldId()
          sim.createField(id, 'Field 1', hueToRgba(DEFAULT_HUES[0]))
          setBrush(prev => ({ ...prev, activeFieldId: id }))
        }
        setFields(new Map(sim.fields))
      })
      .catch(() => {
        // Fallback: create fresh field
        const id = genFieldId()
        sim.createField(id, 'Field 1', hueToRgba(DEFAULT_HUES[0]))
        setBrush(prev => ({ ...prev, activeFieldId: id }))
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

      // Build effect list from all fields with active GLSL
      const fieldEffects: FieldEffectData[] = []
      for (const field of sim.fields.values()) {
        if (!field.glsl || !renderer.hasFieldEffect(field.id)) continue
        if (field.cells.size === 0) continue
        const bounds = sim.getFieldBounds(field.id)
        if (!bounds) continue

        // Re-upload mask each frame (cells may change from painting)
        const mask = new Uint8Array(GRID_SIZE * GRID_SIZE)
        for (const idx of field.cells) mask[idx] = 255
        renderer.uploadFieldMask(field.id, mask)

        fieldEffects.push({
          fieldId: field.id,
          bounds: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY],
          transform: [field.transform.x, field.transform.y, field.transform.rotation, field.transform.scale],
          params: [0, 0, 0, 0],
        })
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
            case 'paint': {
              // Find or use specified field
              const fieldId = cmd.fieldId || Array.from(sim.fields.keys())[0]
              const field = sim.fields.get(fieldId)
              if (!field) break

              // Agents must provide raw cell indices — no shape primitives
              const cells: number[] = cmd.cells || []
              if (cells.length === 0) break

              sim.paintCells(fieldId, cells, field.color)
              pushTerminal('paint', fieldId, `${cells.length} cells`)
              syncFields()
              break
            }

            case 'erase': {
              const fieldId = cmd.fieldId || Array.from(sim.fields.keys())[0]
              const cells: number[] = cmd.cells || []
              if (cells.length === 0) break
              sim.eraseCells(cells)
              pushTerminal('erase', fieldId, `${cells.length} cells`)
              syncFields()
              break
            }

            case 'select': {
              const field = sim.fields.get(cmd.fieldId)
              if (field) {
                updateSelectionMask(cmd.fieldId)
                setBrush(prev => ({ ...prev, activeFieldId: cmd.fieldId, tool: 'select' }))
              }
              break
            }

            case 'generate': {
              const targetFieldId = cmd.fieldId || Array.from(sim.fields.keys())[0]
              if (!targetFieldId) break

              // Auto-select if not already
              const field = sim.fields.get(targetFieldId)
              if (field) {
                updateSelectionMask(targetFieldId)
                setBrush(prev => ({ ...prev, activeFieldId: targetFieldId }))
                // Small delay to let selection upload
                await new Promise(r => setTimeout(r, 50))
              }

              pushTerminal('generate', targetFieldId, `"${cmd.prompt}"`)

              // Inline generate for this field (don't rely on React state)
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

                const result = renderer.compileFieldEffect(targetFieldId, genData.glsl)
                if (result.success) {
                  const targetField = sim.fields.get(targetFieldId)
                  if (targetField) {
                    targetField.transform = { x: 0, y: 0, rotation: 0, scale: 1, vx: 0, vy: 0, vr: 0 }
                  }
                  sim.setFieldEffect(targetFieldId, genData.glsl, genData.description)
                  const mask = new Uint8Array(GRID_SIZE * GRID_SIZE)
                  const mField = sim.fields.get(targetFieldId)
                  if (mField) {
                    for (const idx of mField.cells) mask[idx] = 255
                  }
                  renderer.uploadFieldMask(targetFieldId, mask)
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
              // Direct GLSL injection — no API call, Claude Code writes the shader
              const allFieldIds = Array.from(sim.fields.keys())
              const targetId = cmd.fieldId || allFieldIds[0]
              if (!targetId) {
                pushTerminal('inject_glsl', undefined, 'ERROR: no fields exist')
                break
              }

              // Auto-select
              updateSelectionMask(targetId)
              setBrush(prev => ({ ...prev, activeFieldId: targetId }))

              const bounds = sim.getFieldBounds(targetId)

              if (!bounds) {
                pushTerminal('inject_glsl', targetId, 'ERROR: no painted cells')
                break
              }

              const result = renderer.compileFieldEffect(targetId, cmd.glsl)

              if (result.success) {
                // NOTE: Do NOT reset transform here. Unlike 'generate' (which assumes clean state),
                // inject_glsl is used by autonomous agents who manage their own velocity and position.
                // Resetting transform would kill any active movement the agent has set up.
                // Only reset the visual transform offsets (x, y, rotation, scale), keep velocity intact.
                const targetField = sim.fields.get(targetId)
                if (targetField) {
                  targetField.transform.x = 0
                  targetField.transform.y = 0
                  targetField.transform.rotation = 0
                  targetField.transform.scale = 1
                  // vx, vy, vr are preserved — the field keeps its momentum
                }
                sim.setFieldEffect(targetId, cmd.glsl, cmd.description || 'Injected by agent')

                // Upload field mask
                const mask = new Uint8Array(GRID_SIZE * GRID_SIZE)
                const mField = sim.fields.get(targetId)
                if (mField) {
                  for (const idx of mField.cells) mask[idx] = 255
                }
                renderer.uploadFieldMask(targetId, mask)

                syncFields()
                pushTerminal('inject_glsl', targetId, cmd.description || 'shader injected', cmd.glsl)
              } else {
                pushTerminal('inject_glsl', targetId, `COMPILE ERROR: ${result.error?.substring(0, 100)}`)
              }
              break
            }

            case 'clear_effect': {
              const clearTargetId = cmd.fieldId || undefined
              if (clearTargetId) {
                renderer.removeFieldEffect(clearTargetId)
                sim.setFieldEffect(clearTargetId, null, null)
                syncFields()
              } else {
                // Clear all effects
                for (const field of sim.fields.values()) {
                  if (field.glsl) {
                    renderer.removeFieldEffect(field.id)
                    sim.setFieldEffect(field.id, null, null)
                  }
                }
                syncFields()
              }
              setGeneration({ loading: false, error: null, targetFieldId: null })
              break
            }

            case 'clear_all':
              // Remove all field effects first
              for (const field of sim.fields.values()) {
                if (field.glsl) {
                  renderer.removeFieldEffect(field.id)
                }
              }
              sim.clearAll()
              for (const field of sim.fields.values()) {
                field.glsl = null
                field.effectDescription = null
              }
              updateSelectionMask(null)
              setGeneration({ loading: false, error: null, targetFieldId: null })
              syncFields()
              break

            case 'create_field': {
              const id = genFieldId()
              const hue = DEFAULT_HUES[sim.fields.size % DEFAULT_HUES.length]
              const color = cmd.color || hueToRgba(hue)
              const name = cmd.name || `Field ${sim.fields.size + 1}`
              sim.createField(id, name, color)
              setBrush(prev => ({ ...prev, activeFieldId: id }))
              syncFields()
              pushTerminal('create_field', id, `'${name}'`)
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
              // Log to both fields' memory
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
              sim.moveField(cmd.fieldId, cmd.dx, cmd.dy)
              syncFields()
              pushTerminal('move', cmd.fieldId, `(${cmd.dx}, ${cmd.dy})`)
              break
            }

            case 'set_velocity': {
              const velField = sim.fields.get(cmd.fieldId)
              if (!velField) break
              velField.transform.vx = cmd.vx
              velField.transform.vy = cmd.vy
              if (cmd.vr !== undefined) velField.transform.vr = cmd.vr
              // Velocity needs step() to tick — enable simulation
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
              // Auto-enable simulation when physics are set
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
              // Auto-enable simulation
              if (!sim.running) {
                sim.running = true
                setRunning(true)
              }
              syncFields()
              pushTerminal('apply_force', cmd.fieldId, `(${cmd.fx}, ${cmd.fy})`)
              break
            }

            case 'set_property': {
              const propField = sim.fields.get(cmd.fieldId)
              if (!propField) break
              const existingProp = propField.properties.get(cmd.name)
              if (existingProp) {
                existingProp.value = cmd.value
                if (cmd.min !== undefined) existingProp.min = cmd.min
                if (cmd.max !== undefined) existingProp.max = cmd.max
              } else {
                propField.properties.set(cmd.name, {
                  name: cmd.name,
                  value: cmd.value,
                  min: cmd.min ?? 0,
                  max: cmd.max ?? 100,
                })
              }
              sim.addMemory(cmd.fieldId, {
                timestamp: new Date().toISOString(),
                type: 'property_changed',
                content: `Property "${cmd.name}" set to ${cmd.value}`,
                sourceFieldId: null,
                data: { name: cmd.name, value: cmd.value },
              })
              syncFields()
              pushTerminal('set_property', cmd.fieldId, `${cmd.name} = ${cmd.value}`)
              break
            }

            case 'set_world_data': {
              pushTerminal('set_world_data', cmd.fieldId, Object.keys(cmd.data).join(', '))
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
              // Auto-enable simulation — interaction rules need physics ticking
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
              // Macro expansion happens server-side in the bridge.
              // Individual steps arrive as separate SSE commands.
              // This case only fires if sent directly (not via bridge).
              const customCmd = sim.getCustomCommand(cmd.name)
              pushTerminal('execute_command', customCmd?.definedBy, `"${cmd.name}" — ${customCmd ? `${customCmd.macro.length} steps (expanded by bridge)` : 'unknown command'}`)
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
          style={{ cursor: brush.tool === 'select' ? 'default' : 'crosshair' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={e => e.preventDefault()}
        />

        {/* Info overlay */}
        <div className="absolute top-3 left-3 text-[10px] text-muted font-mono pointer-events-none">
          {GRID_SIZE}x{GRID_SIZE} | zoom: {cameraRef.current.zoom.toFixed(1)}x
          {selectedField && <span> | selected: {selectedField.name}</span>}
          {agentConnected && <span className="text-accent"> | agent live</span>}
        </div>

        {/* Field legend */}
        <div className="absolute bottom-3 left-3 text-[10px] font-mono pointer-events-none">
          {Array.from(fields.values()).map(f => (
            <div key={f.id} className="flex items-center gap-1 mb-0.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{
                backgroundColor: `rgb(${Math.round(f.color[0]*255)},${Math.round(f.color[1]*255)},${Math.round(f.color[2]*255)})`
              }} />
              <span className="text-muted">{f.name}: {f.cells.size}</span>
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
