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
import type { BrushState, Camera, Field, FieldShape, FieldEffect, SelectionState, GenerationState } from './types'
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

/** Format shape info for display */
function shapeLabel(shape: FieldShape | undefined): string {
  if (!shape) return 'no shape'
  if (shape.type === 'circle') return `circle r=${shape.radius}`
  if (shape.type === 'polygon') return `polygon r=${shape.radius} sides=${shape.sides}`
  return `rect ${(shape as {w:number;h:number}).w}x${(shape as {w:number;h:number}).h}`
}

/** Parse shape from command params */
function parseShape(cmd: Record<string, unknown>): FieldShape {
  if (cmd.shape === 'rect' || cmd.shapeType === 'rect') {
    return { type: 'rect', w: (cmd.w as number) || 20, h: (cmd.h as number) || 20 }
  }
  if (cmd.shape === 'polygon' || cmd.shapeType === 'polygon') {
    return { type: 'polygon', radius: (cmd.radius as number) || 10, sides: (cmd.sides as number) || 6 }
  }
  return { type: 'circle', radius: (cmd.radius as number) || 10 }
}

export default function FieldEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
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

  // Update selection mask from field shape and upload to GPU
  const updateSelectionMask = useCallback((fieldId: string | null) => {
    const sim = simulationRef.current
    const renderer = rendererRef.current
    if (!sim || !renderer) return

    let mask: Uint8Array
    if (fieldId) {
      mask = sim.generateShapeMask(fieldId) || new Uint8Array(GRID_SIZE * GRID_SIZE)
    } else {
      mask = new Uint8Array(GRID_SIZE * GRID_SIZE)
    }

    renderer.uploadSelectionData(mask)
    setSelection({ selectedFieldId: fieldId, selectionMask: mask })
  }, [])

  /** Compile the default solid-color shader for a field */
  const compileDefaultEffect = useCallback((fieldId: string) => {
    const renderer = rendererRef.current
    if (!renderer) return

    const defaultEffectId = `${fieldId}_default`
    renderer.compileFieldEffect(defaultEffectId, DEFAULT_FIELD_EFFECT_GLSL)
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

    compileDefaultEffect(id)

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
      compileDefaultEffect(fieldId)
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
            renderer.compileFieldEffect(defaultKey, DEFAULT_FIELD_EFFECT_GLSL)

            // Restore custom effects
            for (const effect of field.effects) {
              const programKey = `${field.id}_${effect.id}`
              renderer.compileFieldEffect(programKey, effect.glsl)
            }
          }

          setBrush(prev => ({ ...prev, activeFieldId: firstId }))
        }
        // Restore field links
        if (data.fieldLinks?.length) {
          for (const link of data.fieldLinks) {
            sim.addLink(link)
          }
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

        // Generate shape mask analytically (updated each frame for moving fields)
        const mask = sim.generateShapeMask(field.id)

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


      // Pass primary field position to world effects (first field with consciousness > 0)
      let worldEffectParams: [number, number, number, number] = [256, 256, 0, 0]
      for (const field of sim.fields.values()) {
        const consciousness = field.properties.get('consciousness')
        if (consciousness && typeof consciousness === 'number' && consciousness > 0) {
          worldEffectParams = [field.transform.x, field.transform.y, consciousness, time]
          break
        }
      }
      renderer.setAllWorldEffectParams(worldEffectParams)

      renderer.render(camera, camera.zoom, time, fieldEffects)

      // --- Canvas2D overlay: draw links between fields ---
      const overlayCanvas = overlayCanvasRef.current
      if (overlayCanvas) {
        const dpr = window.devicePixelRatio || 1
        const cw = overlayCanvas.clientWidth
        const ch = overlayCanvas.clientHeight
        if (overlayCanvas.width !== Math.round(cw * dpr) || overlayCanvas.height !== Math.round(ch * dpr)) {
          overlayCanvas.width = Math.round(cw * dpr)
          overlayCanvas.height = Math.round(ch * dpr)
        }
        const ctx = overlayCanvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
          
          // Transform: grid coords -> screen coords (match WebGL camera)
          const aspect = overlayCanvas.width / overlayCanvas.height
          const gridRange = 512 / camera.zoom
          
          const ow = overlayCanvas.width
          const oh = overlayCanvas.height
          function gridToScreen(gx: number, gy: number): [number, number] {
            let sx: number, sy: number
            if (aspect > 1) {
              sx = ((gx - camera.x) / (gridRange * aspect) + 0.5) * ow
              sy = (0.5 - (gy - camera.y) / gridRange) * oh
            } else {
              sx = ((gx - camera.x) / gridRange + 0.5) * ow
              sy = (0.5 - (gy - camera.y) / (gridRange / aspect)) * oh
            }
            return [sx, sy]
          }
          
          // --- Trail system: fade-out position history ---
          if (!sim.worldData._trails) sim.worldData._trails = {}
          const trails = sim.worldData._trails as Record<string, Array<{x: number, y: number, t: number}>>
          const MAX_TRAIL = 30
          
          for (const field of sim.fields.values()) {
            if (field.name === 'particle') continue
            if (!trails[field.id]) trails[field.id] = []
            const trail = trails[field.id]
            
            // Add current position
            if (trail.length === 0 || 
                Math.abs(trail[trail.length-1].x - field.transform.x) > 1 ||
                Math.abs(trail[trail.length-1].y - field.transform.y) > 1) {
              trail.push({x: field.transform.x, y: field.transform.y, t: time})
            }
            
            // Trim old entries
            while (trail.length > MAX_TRAIL) trail.shift()
            
            // Draw trail
            if (trail.length > 2) {
              ctx.save()
              for (let ti = 1; ti < trail.length; ti++) {
                const alpha = (ti / trail.length) * 0.3 * (field.color[3] || 1)
                const [sx1, sy1] = gridToScreen(trail[ti-1].x, trail[ti-1].y)
                const [sx2, sy2] = gridToScreen(trail[ti].x, trail[ti].y)
                ctx.strokeStyle = `rgba(${Math.round(field.color[0]*255)}, ${Math.round(field.color[1]*255)}, ${Math.round(field.color[2]*255)}, ${alpha})`
                ctx.lineWidth = (ti / trail.length) * 2 * dpr
                ctx.beginPath()
                ctx.moveTo(sx1, sy1)
                ctx.lineTo(sx2, sy2)
                ctx.stroke()
              }
              ctx.restore()
            }
          }
          
          // Draw links from simulation
          const linkEndpoints = sim.getLinkEndpoints()
          for (const link of linkEndpoints) {
            const [x1, y1] = gridToScreen(link.fromX, link.fromY)
            const [x2, y2] = gridToScreen(link.toX, link.toY)
            
            ctx.save()
            ctx.strokeStyle = `rgba(${Math.round(link.color[0]*255)}, ${Math.round(link.color[1]*255)}, ${Math.round(link.color[2]*255)}, ${link.color[3] * link.intensity})`
            ctx.lineWidth = link.width * camera.zoom * dpr
            ctx.shadowColor = `rgba(${Math.round(link.color[0]*255)}, ${Math.round(link.color[1]*255)}, ${Math.round(link.color[2]*255)}, 0.5)`
            ctx.shadowBlur = 8 * dpr
            
            if (link.style === 'beam') {
              ctx.beginPath()
              ctx.moveTo(x1, y1)
              ctx.lineTo(x2, y2)
              ctx.stroke()
            } else if (link.style === 'lightning') {
              ctx.beginPath()
              ctx.moveTo(x1, y1)
              const segments = 8
              for (let s = 1; s < segments; s++) {
                const t2 = s / segments
                const mx = x1 + (x2 - x1) * t2 + (Math.random() - 0.5) * 6 * dpr
                const my = y1 + (y2 - y1) * t2 + (Math.random() - 0.5) * 6 * dpr
                ctx.lineTo(mx, my)
              }
              ctx.lineTo(x2, y2)
              ctx.stroke()
            } else if (link.style === 'pulse') {
              const pulsePos = (time * 2) % 1
              const px = x1 + (x2 - x1) * pulsePos
              const py = y1 + (y2 - y1) * pulsePos
              ctx.globalAlpha = 0.3 * link.intensity
              ctx.beginPath()
              ctx.moveTo(x1, y1)
              ctx.lineTo(x2, y2)
              ctx.stroke()
              ctx.globalAlpha = link.intensity
              ctx.beginPath()
              ctx.arc(px, py, 3 * dpr, 0, Math.PI * 2)
              ctx.fillStyle = ctx.strokeStyle
              ctx.fill()
            } else if (link.style === 'helix') {
              ctx.beginPath()
              const segs = 20
              for (let s = 0; s <= segs; s++) {
                const t2 = s / segs
                const bx = x1 + (x2 - x1) * t2
                const by = y1 + (y2 - y1) * t2
                const perpX = -(y2 - y1) / Math.sqrt((x2-x1)**2 + (y2-y1)**2) * 4 * dpr
                const perpY = (x2 - x1) / Math.sqrt((x2-x1)**2 + (y2-y1)**2) * 4 * dpr
                const wave = Math.sin(t2 * Math.PI * 4 + time * 3)
                const px2 = bx + perpX * wave
                const py2 = by + perpY * wave
                if (s === 0) ctx.moveTo(px2, py2)
                else ctx.lineTo(px2, py2)
              }
              ctx.stroke()
            }
            ctx.restore()
          }
        }
      }

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

          // Resolve field by name when fieldId is missing or invalid
          if (!cmd.fieldId && cmd.name && cmd.type !== 'create_field' && cmd.type !== 'set_world_data' && cmd.type !== 'set_world_params') {
            for (const [id, f] of sim.fields) {
              if (f.name === cmd.name) {
                cmd.fieldId = id
                break
              }
            }
          }

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
              if (!cmd.glsl || typeof cmd.glsl !== 'string') {
                pushTerminal('add_effect', targetId, 'ERROR: glsl string required')
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
                  renderer.compileFieldEffect(defaultKey, DEFAULT_FIELD_EFFECT_GLSL)
                }
                syncFields()
              } else {
                // Clear all effects from all fields
                for (const field of sim.fields.values()) {
                  renderer.removeAllFieldEffects(field.id)
                  field.effects = []
                  // Re-compile default shader
                  const defaultKey = `${field.id}_default`
                  renderer.compileFieldEffect(defaultKey, DEFAULT_FIELD_EFFECT_GLSL)
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
              const shape = parseShape(cmd)

              sim.createField(id, name, color, shape)

              // Set position if provided
              if (cmd.x !== undefined && cmd.y !== undefined) {
                sim.setPosition(id, cmd.x as number, cmd.y as number)
              }

              // Compile default shader — field is immediately visible
              const defaultKey = `${id}_default`
              renderer.compileFieldEffect(defaultKey, DEFAULT_FIELD_EFFECT_GLSL)

              setBrush(prev => ({ ...prev, activeFieldId: id }))
              syncFields()
              pushTerminal('create_field', id, `'${name}' (${shapeLabel(shape)})`)
              break
            }

            case 'set_shape': {
              const targetId = cmd.fieldId
              if (!targetId) {
                pushTerminal('set_shape', undefined, 'ERROR: fieldId required')
                break
              }
              const field = sim.fields.get(targetId)
              if (!field) {
                pushTerminal('set_shape', targetId, 'ERROR: field not found')
                break
              }
              const newShape = parseShape(cmd)
              sim.setShape(targetId, newShape)
              syncFields()
              pushTerminal('set_shape', targetId, shapeLabel(newShape))
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

            case 'set_velocity': {
              const field = sim.fields.get(cmd.fieldId)
              if (!field) break
              if (cmd.vx !== undefined) field.transform.vx = cmd.vx as number
              if (cmd.vy !== undefined) field.transform.vy = cmd.vy as number
              if (cmd.vr !== undefined) field.transform.vr = cmd.vr as number
              if (!sim.running) { sim.running = true; setRunning(true) }
              syncFields()
              pushTerminal('set_velocity', cmd.fieldId, `vx=${field.transform.vx.toFixed(1)} vy=${field.transform.vy.toFixed(1)} vr=${field.transform.vr.toFixed(2)}`)
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

            case 'set_rotation': {
              const field = sim.fields.get(cmd.fieldId)
              if (!field) break
              field.transform.rotation = (cmd.rotation as number) || 0
              syncFields()
              pushTerminal('set_rotation', cmd.fieldId, `rotation=${field.transform.rotation.toFixed(2)}`)
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
              const hookErr = sim.addStepHook(cmd.hookId, cmd.author || 'unknown', cmd.description || '', cmd.code)
              if (!hookErr) {
                if (!sim.running) { sim.running = true; setRunning(true) }
                pushTerminal('add_step_hook', cmd.author, `"${cmd.hookId}": ${cmd.description || 'step hook added'}`, cmd.code)
              } else {
                pushTerminal('add_step_hook', cmd.author, `COMPILE ERROR for "${cmd.hookId}": ${hookErr}`, cmd.code)
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

            case 'clone_field': {
              const sourceField = sim.fields.get(cmd.fieldId)
              if (!sourceField) {
                pushTerminal('clone_field', cmd.fieldId, 'ERROR: source field not found')
                break
              }
              const cloneId = genFieldId()
              const cloneName = (cmd.name as string) || `${sourceField.name} (clone)`
              const cloneColor = (cmd.color as [number, number, number, number]) || [...sourceField.color] as [number, number, number, number]
              const cloneShape = { ...sourceField.shape }
              
              sim.createField(cloneId, cloneName, cloneColor, cloneShape)
              
              // Copy position with optional offset
              const offsetX = (cmd.offsetX as number) || 30
              const offsetY = (cmd.offsetY as number) || 0
              sim.setPosition(cloneId, sourceField.transform.x + offsetX, sourceField.transform.y + offsetY)
              
              // Compile default shader
              const defaultKey = `${cloneId}_default`
              renderer.compileFieldEffect(defaultKey, DEFAULT_FIELD_EFFECT_GLSL)
              
              // Clone effects
              for (const effect of sourceField.effects) {
                const newEffectId = genEffectId()
                const programKey = `${cloneId}_${newEffectId}`
                const result = renderer.compileFieldEffect(programKey, effect.glsl)
                if (result.success) {
                  sim.addFieldEffect(cloneId, {
                    id: newEffectId,
                    author: effect.author,
                    glsl: effect.glsl,
                    description: effect.description,
                    blend: effect.blend,
                    order: effect.order,
                  })
                }
              }
              
              syncFields()
              pushTerminal('clone_field', cmd.fieldId, `cloned as '${cloneName}' (id: ${cloneId})`)
              break
            }

            case 'list_fields': {
              const fieldList = Array.from(sim.fields.values()).map(f => {
                const b = sim.getFieldBounds(f.id)
                return `${f.name} [${f.id}] at (${f.transform.x.toFixed(0)},${f.transform.y.toFixed(0)}) ${f.shape.type === 'circle' ? 'r=' + f.shape.radius : f.shape.type === 'polygon' ? 'p' + f.shape.radius + 'x' + f.shape.sides : (f.shape as {w:number;h:number}).w + 'x' + (f.shape as {w:number;h:number}).h} effects=${f.effects.length}`
              })
              pushTerminal('list_fields', undefined, `${sim.fields.size} fields`, fieldList.join('\n'))
              break
            }

            
            case 'link_fields': {
              const fromId = cmd.fromFieldId as string
              const toId = cmd.toFieldId as string
              const color = (cmd.color as [number, number, number, number]) || [0, 1, 1, 0.6]
              const width = (cmd.width as number) || 2
              const style = (cmd.style as string) || 'beam'
              const intensity = (cmd.intensity as number) || 0.8
              const bidirectional = (cmd.bidirectional as boolean) || false
              const author = (cmd.author as string) || 'unknown'
              const linkId = sim.addLink({
                id: '',
                fromFieldId: fromId,
                toFieldId: toId,
                color,
                width,
                style: style as 'beam' | 'lightning' | 'pulse' | 'helix',
                intensity,
                bidirectional,
                author,
              })
              syncFields()
              pushTerminal('link_fields', fromId, `linked to ${toId} (${style}, id: ${linkId})`)
              break
            }
            case 'unlink_fields': {
              const ulinkId = cmd.linkId as string
              if (ulinkId) {
                sim.removeLink(ulinkId)
                syncFields()
                pushTerminal('unlink_fields', undefined, `removed ${ulinkId}`)
              }
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
          body: JSON.stringify({ fields: sim.generateSnapshots(), worldParams: sim.getWorldParams(), stepHooks: sim.getStepHookSnapshots(), worldData: sim.worldData }),
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
          style={{ cursor: 'grab', zIndex: 0 }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={e => e.preventDefault()}
        />

        {/* Canvas2D overlay for links and trails */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 2 }}
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
              <span className="text-muted">{f.name}: {shapeLabel(f.shape)}{f.effects.length > 0 ? ` +${f.effects.length}fx` : ''}</span>
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
