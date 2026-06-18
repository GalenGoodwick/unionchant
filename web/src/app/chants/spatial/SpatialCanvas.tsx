'use client'

import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import type { UserspaceNode } from './useUserspace'

// Spatial bounds — players can't go beyond this
const BOUNDS = { minX: -600, maxX: 600, minY: -400, maxY: 400 }

// Frame positions in grid space
const FRAMES = [
  { id: '__nav_chants__', tab: 'chants' as const, label: 'Chants', color: '#22d3ee', x: -180, y: 0 },
  { id: '__nav_podiums__', tab: 'podiums' as const, label: 'Podiums', color: '#a78bfa', x: 0, y: 0 },
  { id: '__nav_groups__', tab: 'groups' as const, label: 'Groups', color: '#fbbf24', x: 180, y: 0 },
]

const FRAME_WIDTH = 140
const FRAME_HEIGHT = 260

// List mode layout
const LIST_COLS = 2
const LIST_CARD_W = 150
const LIST_CARD_H = 100
const LIST_GAP = 20

// Ring expansion constants
const RING_ATTRACT_RADIUS = 100
const RING_MAX_EXPAND = 30

interface SpatialCanvasProps {
  visible: boolean
  nodes: UserspaceNode[]
  selfUserId: string
  selfName: string
  selfColor: string
  followingIds: string[]
  onEnterSubspace: (userId: string, name: string, color: string) => void
  dropZoneRefs: React.MutableRefObject<Map<string, HTMLElement>>
  onRotate?: (degrees: number) => void
  framePreviews?: {
    chants: string[]
    podiums: string[]
    groups: string[]
  }
  onDockFrame?: (tab: 'chants' | 'podiums' | 'groups') => void
  remotePlayers?: { id: string; name: string; color: string; rx: number; ry: number; rotation: number }[]
  onCameraMove?: (x: number, y: number, rotation?: number) => void
  // List mode
  listItems?: { id: string; title: string; phase?: string; tier?: number }[]
  onDockItem?: (itemId: string) => void
  // Drag-to-dock ring expansion
  isDraggingDockstar?: boolean
  dragPosition?: { x: number; y: number } | null
  // Player mode
  onDockPlayer?: (id: string, name: string, color: string) => void
  hostNavState?: { dockedPostId: string | null; activeTab: string } | null
  onFollowHost?: () => void
  onBackFromSpatial?: () => void
  onSpatialStateChange?: (state: { mode: 'lobby' | 'list' | 'player'; listTab?: string | null; playerName?: string | null; canGoBack: boolean }) => void
}

interface LayoutNode extends UserspaceNode {
  x: number
  y: number
  radius: number
  ring: 'self' | 'following' | 'other'
}

function clampCamera(pos: { x: number; y: number }) {
  return {
    x: Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, pos.x)),
    y: Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY, pos.y)),
  }
}

export interface SpatialCanvasHandle {
  back: () => void
  enterPlayerMode: (id: string, name: string, color: string) => void
  resetToLobby: () => void
  dockFrame: (tab: 'chants' | 'podiums' | 'groups') => void
}

const SpatialCanvas = forwardRef<SpatialCanvasHandle, SpatialCanvasProps>(function SpatialCanvas({
  visible,
  nodes,
  selfUserId,
  selfName,
  selfColor,
  followingIds,
  onEnterSubspace,
  dropZoneRefs,
  onRotate,
  framePreviews,
  onDockFrame,
  remotePlayers,
  onCameraMove,
  listItems,
  onDockItem,
  isDraggingDockstar,
  dragPosition,
  onDockPlayer,
  hostNavState,
  onFollowHost,
  onBackFromSpatial,
  onSpatialStateChange,
}: SpatialCanvasProps, ref: React.Ref<SpatialCanvasHandle>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([])
  const [camera, setCamera] = useState({ x: 0, y: 0 })
  const animRef = useRef<number | null>(null)
  const cameraRef = useRef({ x: 0, y: 0 })
  const rotationRef = useRef(0)
  const holdRef = useRef<{ dx: number; dy: number; startTime: number; startX: number; startY: number } | null>(null)
  const glideTargetRef = useRef<{ x: number; y: number } | null>(null)
  const onRotateRef = useRef(onRotate)
  useEffect(() => { onRotateRef.current = onRotate }, [onRotate])
  const onCameraMoveRef = useRef(onCameraMove)
  useEffect(() => { onCameraMoveRef.current = onCameraMove }, [onCameraMove])

  // Spatial sub-mode state machine
  type NavEntry =
    | { mode: 'lobby' }
    | { mode: 'list'; tab: 'chants' | 'podiums' | 'groups' }
    | { mode: 'player'; player: { id: string; name: string; color: string } }
  const [spatialMode, setSpatialMode] = useState<'lobby' | 'list' | 'player'>('lobby')
  const [listTab, setListTab] = useState<'chants' | 'podiums' | 'groups' | null>(null)
  const [dockedPlayer, setDockedPlayer] = useState<{ id: string; name: string; color: string } | null>(null)
  const [navStack, setNavStack] = useState<NavEntry[]>([])

  // Track whether dockstar has been dragged away from center (prevents accidental self-dock)
  const hasDraggedAwayRef = useRef(false)

  // Player drop zone hidden elements
  const playerDropEls = useRef<Map<string, HTMLDivElement>>(new Map())

  // Reset state when spatial view is hidden
  useEffect(() => {
    if (!visible) {
      setSpatialMode('lobby')
      setListTab(null)
      setDockedPlayer(null)
      setNavStack([])
    }
  }, [visible])

  // Track drag-away for self-dock: only allow self-dock after dragging 80px+ from center
  useEffect(() => {
    if (!isDraggingDockstar) {
      hasDraggedAwayRef.current = false
      return
    }
    if (dragPosition && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const cx = rect.width / 2
      const cy = rect.height / 2
      const dist = Math.hypot(dragPosition.x - cx, dragPosition.y - cy)
      if (dist > 80) {
        hasDraggedAwayRef.current = true
      }
    }
  }, [isDraggingDockstar, dragPosition])

  // Broadcast spatial state changes to parent for header display
  useEffect(() => {
    if (!visible) return
    onSpatialStateChange?.({
      mode: spatialMode,
      listTab,
      playerName: dockedPlayer?.name || null,
      canGoBack: navStack.length > 0,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, spatialMode, listTab, dockedPlayer, navStack.length, onSpatialStateChange])

  // Handle back navigation — restores full context from nav stack
  const handleBack = useCallback(() => {
    if (navStack.length > 0) {
      const prev = navStack[navStack.length - 1]
      setNavStack(s => s.slice(0, -1))
      setSpatialMode(prev.mode)
      if (prev.mode === 'lobby') {
        setListTab(null)
        setDockedPlayer(null)
      } else if (prev.mode === 'list') {
        setListTab(prev.tab)
        setDockedPlayer(null)
      } else if (prev.mode === 'player') {
        setDockedPlayer(prev.player)
      }
      // Reset camera on mode transition
      setCamera({ x: 0, y: 0 })
      cameraRef.current = { x: 0, y: 0 }
    } else {
      // Empty stack → exit spatial entirely
      onBackFromSpatial?.()
    }
  }, [navStack, onBackFromSpatial])

  // Build current NavEntry for pushing to stack
  const currentNavEntry = useCallback((): NavEntry => {
    if (spatialMode === 'list' && listTab) return { mode: 'list', tab: listTab }
    if (spatialMode === 'player' && dockedPlayer) return { mode: 'player', player: dockedPlayer }
    return { mode: 'lobby' }
  }, [spatialMode, listTab, dockedPlayer])

  // Handle frame dock → transition to list mode
  const handleFrameDock = useCallback((tab: 'chants' | 'podiums' | 'groups') => {
    setNavStack(s => [...s, currentNavEntry()])
    setSpatialMode('list')
    setListTab(tab)
    setCamera({ x: 0, y: 0 })
    cameraRef.current = { x: 0, y: 0 }
    onDockFrame?.(tab)
  }, [currentNavEntry, onDockFrame])

  // Handle entering player mode — supports nesting up to 5 deep
  const MAX_NEST_DEPTH = 5
  const [nestTooDeep, setNestTooDeep] = useState(false)
  const handlePlayerDock = useCallback((id: string, name: string, color: string) => {
    // Count how many player entries are in the stack
    const playerDepth = navStack.filter(e => e.mode === 'player').length + (spatialMode === 'player' ? 1 : 0)
    if (playerDepth >= MAX_NEST_DEPTH) {
      setNestTooDeep(true)
      setTimeout(() => setNestTooDeep(false), 3000)
      return
    }
    setNavStack(s => [...s, currentNavEntry()])
    setSpatialMode('player')
    setDockedPlayer({ id, name, color })
    setCamera({ x: 0, y: 0 })
    cameraRef.current = { x: 0, y: 0 }
  }, [currentNavEntry, navStack, spatialMode])

  // Reset all the way to lobby — used when host disconnects, content deleted, etc.
  const resetToLobby = useCallback(() => {
    setNavStack([])
    setSpatialMode('lobby')
    setListTab(null)
    setDockedPlayer(null)
    setCamera({ x: 0, y: 0 })
    cameraRef.current = { x: 0, y: 0 }
  }, [])

  // Expose handlers to parent via ref
  useImperativeHandle(ref, () => ({
    back: handleBack,
    enterPlayerMode: handlePlayerDock,
    resetToLobby,
    dockFrame: handleFrameDock,
  }), [handleBack, handlePlayerDock, resetToLobby, handleFrameDock])

  // Auto-reset to lobby if host disconnects while in player mode
  const prevHostNavRef = useRef(hostNavState)
  useEffect(() => {
    // When hostNavState goes from non-null to null while in player mode, reset fully to lobby
    if (spatialMode === 'player' && prevHostNavRef.current !== null && hostNavState === null) {
      resetToLobby()
    }
    prevHostNavRef.current = hostNavState
  }, [hostNavState, spatialMode, resetToLobby])

  // Auto-back to lobby if list items are deleted while in list mode
  const prevListItemsLen = useRef((listItems || []).length)
  useEffect(() => {
    const len = (listItems || []).length
    if (spatialMode === 'list' && prevListItemsLen.current > 0 && len === 0) {
      resetToLobby()
    }
    prevListItemsLen.current = len
  }, [listItems, spatialMode, resetToLobby])

  // Smoothed remote player positions (lerp toward target)
  const smoothPlayersRef = useRef<Map<string, { rx: number; ry: number; rotation: number }>>(new Map())

  // Keep cameraRef in sync + broadcast position with rotation
  useEffect(() => {
    cameraRef.current = camera
    onCameraMoveRef.current?.(camera.x, camera.y, rotationRef.current)
  }, [camera])

  // Layout nodes in radial pattern
  useEffect(() => {
    if (!visible) return

    const followingSet = new Set(followingIds)
    const followingNodes = nodes.filter(n => followingSet.has(n.userId))
    const otherNodes = nodes.filter(n => !followingSet.has(n.userId))

    const laid: LayoutNode[] = []

    const innerRadius = 120
    followingNodes.forEach((node, i) => {
      const angle = (i / Math.max(followingNodes.length, 1)) * Math.PI * 2 - Math.PI / 2
      laid.push({
        ...node,
        x: Math.cos(angle) * innerRadius,
        y: Math.sin(angle) * innerRadius,
        radius: 20 + Math.min(node.occupancy * 3, 20),
        ring: 'following',
      })
    })

    const outerRadius = 240
    otherNodes.forEach((node, i) => {
      const angle = (i / Math.max(otherNodes.length, 1)) * Math.PI * 2 - Math.PI / 2
      laid.push({
        ...node,
        x: Math.cos(angle) * outerRadius,
        y: Math.sin(angle) * outerRadius,
        radius: 16 + Math.min(node.occupancy * 2, 16),
        ring: 'other',
      })
    })

    setLayoutNodes(laid)
  }, [visible, nodes, followingIds])

  // Unified animation loop — hold mode (continuous) or glide mode (tap target)
  const startAnimation = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)

    const animate = () => {
      const hold = holdRef.current
      const glide = glideTargetRef.current

      if (hold) {
        const dist = Math.hypot(hold.dx, hold.dy)
        if (dist > 1) {
          const speed = dist * 0.02
          const cur = cameraRef.current
          const next = clampCamera({ x: cur.x - (hold.dx / dist) * speed, y: cur.y - (hold.dy / dist) * speed })
          setCamera(next)
        }
        animRef.current = requestAnimationFrame(animate)
      } else if (glide) {
        const cur = cameraRef.current
        const dx = glide.x - cur.x
        const dy = glide.y - cur.y
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
          setCamera(clampCamera({ x: glide.x, y: glide.y }))
          glideTargetRef.current = null
          animRef.current = null
          return
        }
        setCamera(clampCamera({ x: cur.x + dx * 0.08, y: cur.y + dy * 0.08 }))
        animRef.current = requestAnimationFrame(animate)
      } else {
        animRef.current = null
      }
    }

    animRef.current = requestAnimationFrame(animate)
  }, [])

  // Cleanup animation on unmount
  useEffect(() => {
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  // Interpolation loop for smooth remote player movement
  const interpRef = useRef<number | null>(null)
  const [renderTick, setRenderTick] = useState(0)

  useEffect(() => {
    if (!visible || !remotePlayers || remotePlayers.length === 0) {
      if (interpRef.current) { cancelAnimationFrame(interpRef.current); interpRef.current = null }
      return
    }

    const tick = () => {
      let needsMore = false
      for (const player of remotePlayers) {
        const smooth = smoothPlayersRef.current.get(player.id)
        if (!smooth) continue
        if (Math.abs(player.rx - smooth.rx) > 0.001 ||
            Math.abs(player.ry - smooth.ry) > 0.001 ||
            Math.abs(((player.rotation - smooth.rotation + 540) % 360) - 180) > 0.5) {
          needsMore = true
          break
        }
      }
      if (needsMore) {
        setRenderTick(t => t + 1)
        interpRef.current = requestAnimationFrame(tick)
      } else {
        interpRef.current = null
      }
    }

    interpRef.current = requestAnimationFrame(tick)
    return () => { if (interpRef.current) { cancelAnimationFrame(interpRef.current); interpRef.current = null } }
  }, [visible, remotePlayers])

  // Draw canvas
  useEffect(() => {
    if (!visible) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const cx = rect.width / 2 + camera.x
    const cy = rect.height / 2 + camera.y

    // Clear
    ctx.fillStyle = '#020617'
    ctx.fillRect(0, 0, rect.width, rect.height)

    // Draw subtle grid
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 0.5
    const gridSize = 40
    for (let x = (cx % gridSize); x < rect.width; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, rect.height)
      ctx.stroke()
    }
    for (let y = (cy % gridSize); y < rect.height; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(rect.width, y)
      ctx.stroke()
    }

    // Draw boundary indicators
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 1
    ctx.setLineDash([8, 8])
    const bLeft = cx + BOUNDS.minX
    const bRight = cx + BOUNDS.maxX
    const bTop = cy + BOUNDS.minY
    const bBottom = cy + BOUNDS.maxY
    ctx.beginPath()
    ctx.rect(bLeft, bTop, bRight - bLeft, bBottom - bTop)
    ctx.stroke()
    ctx.setLineDash([])

    // Draw other nodes (user subspaces)
    layoutNodes.forEach(node => {
      const nx = cx + node.x
      const ny = cy + node.y
      const isFollowing = node.ring === 'following'
      const alpha = isFollowing ? '60' : '30'
      const strokeAlpha = isFollowing ? 'cc' : '80'

      if (node.occupancy > 0) {
        ctx.beginPath()
        ctx.arc(nx, ny, node.radius + 6, 0, Math.PI * 2)
        ctx.fillStyle = node.hostColor + '15'
        ctx.fill()
      }

      ctx.beginPath()
      ctx.arc(nx, ny, node.radius, 0, Math.PI * 2)
      ctx.fillStyle = node.hostColor + alpha
      ctx.fill()
      ctx.strokeStyle = node.hostColor + strokeAlpha
      ctx.lineWidth = isFollowing ? 2 : 1
      ctx.stroke()

      ctx.fillStyle = node.hostColor
      ctx.font = `${isFollowing ? 11 : 9}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(node.hostName[0]?.toUpperCase() || '?', nx, ny)

      ctx.fillStyle = isFollowing ? '#e2e8f0' : '#64748b'
      ctx.font = '9px monospace'
      ctx.fillText(node.hostName.slice(0, 12), nx, ny + node.radius + 12)

      if (node.occupancy > 0) {
        const bx = nx + node.radius * 0.7
        const by = ny - node.radius * 0.7
        ctx.beginPath()
        ctx.arc(bx, by, 8, 0, Math.PI * 2)
        ctx.fillStyle = '#0891b2'
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 8px monospace'
        ctx.fillText(String(node.occupancy), bx, by)
      }
    })

    // Draw remote players — same orb style as local dockstar, with lerp smoothing
    if (remotePlayers && remotePlayers.length > 0) {
      const boundsW = BOUNDS.maxX - BOUNDS.minX  // 1200
      const boundsH = BOUNDS.maxY - BOUNDS.minY  // 800
      const lerpFactor = 0.18  // smoothing at 60fps interpolation
      remotePlayers.forEach(player => {
        // Lerp toward target position
        const smooth = smoothPlayersRef.current.get(player.id) || { rx: player.rx, ry: player.ry, rotation: player.rotation }
        smooth.rx += (player.rx - smooth.rx) * lerpFactor
        smooth.ry += (player.ry - smooth.ry) * lerpFactor
        // Shortest-path rotation lerp
        let rotDelta = ((player.rotation - smooth.rotation + 540) % 360) - 180
        smooth.rotation += rotDelta * lerpFactor
        smoothPlayersRef.current.set(player.id, smooth)

        const playerCamX = BOUNDS.minX + smooth.rx * boundsW
        const playerCamY = BOUNDS.minY + smooth.ry * boundsH
        const screenX = rect.width / 2 + camera.x - playerCamX
        const screenY = rect.height / 2 + camera.y - playerCamY
        const rot = smooth.rotation * Math.PI / 180
        const orbR = 16  // slightly smaller than the 20px (w-10) local dockstar

        // Glow
        ctx.shadowColor = player.color + '66'
        ctx.shadowBlur = 10

        // Filled circle (like the dockstar orb)
        ctx.beginPath()
        ctx.arc(screenX, screenY, orbR, 0, Math.PI * 2)
        ctx.fillStyle = player.color
        ctx.fill()
        ctx.strokeStyle = player.color
        ctx.lineWidth = 2
        ctx.stroke()

        ctx.shadowBlur = 0

        // Arrow inside the orb, rotated to their facing direction
        // Matches dockstar SVG path "M12 2l4.5 11h-3.5v9h-2v-9H7.5z" scaled to orb
        ctx.save()
        ctx.translate(screenX, screenY)
        ctx.rotate(rot)
        const s = orbR / 12  // scale factor (SVG is 24x24, center at 12,12)
        ctx.beginPath()
        ctx.moveTo(0, -10 * s)           // tip
        ctx.lineTo(4.5 * s, 1 * s)      // right wing
        ctx.lineTo(1 * s, 1 * s)        // right notch
        ctx.lineTo(1 * s, 9 * s)        // right tail
        ctx.lineTo(-1 * s, 9 * s)       // left tail
        ctx.lineTo(-1 * s, 1 * s)       // left notch
        ctx.lineTo(-4.5 * s, 1 * s)     // left wing
        ctx.closePath()
        ctx.fillStyle = '#020617'
        ctx.fill()
        ctx.restore()

        // Name label below
        ctx.fillStyle = player.color
        ctx.font = '9px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(player.name.slice(0, 12), screenX, screenY + orbR + 4)

        // Ring expansion when dockstar is being dragged near this player
        if (isDraggingDockstar && dragPosition) {
          const dist = Math.hypot(dragPosition.x - screenX, dragPosition.y - screenY)
          if (dist < RING_ATTRACT_RADIUS) {
            const proximity = 1 - (dist / RING_ATTRACT_RADIUS)
            const ringRadius = orbR + 4 + proximity * RING_MAX_EXPAND
            ctx.beginPath()
            ctx.arc(screenX, screenY, ringRadius, 0, Math.PI * 2)
            ctx.strokeStyle = player.color + Math.round(proximity * 200).toString(16).padStart(2, '0')
            ctx.lineWidth = 2 + proximity * 2
            ctx.stroke()
          }
        }
      })
    }

    // Self-dock ring — appears at center when dockstar is dragged away, inviting return
    if (isDraggingDockstar && dragPosition && hasDraggedAwayRef.current) {
      const selfX = rect.width / 2
      const selfY = rect.height / 2
      const dist = Math.hypot(dragPosition.x - selfX, dragPosition.y - selfY)
      // Ring visible when player is outside it — grows with distance, shrinks as they return
      const ringAlpha = Math.min(dist / RING_ATTRACT_RADIUS, 1)
      const ringRadius = 20 + 4 + ringAlpha * RING_MAX_EXPAND
      ctx.beginPath()
      ctx.arc(selfX, selfY, ringRadius, 0, Math.PI * 2)
      ctx.strokeStyle = selfColor + Math.round(ringAlpha * 150).toString(16).padStart(2, '0')
      ctx.lineWidth = 1.5 + ringAlpha * 1.5
      ctx.stroke()
    }
  }, [visible, layoutNodes, camera, selfColor, selfName, remotePlayers, renderTick, isDraggingDockstar, dragPosition])

  // Rotate arrow toward a screen offset (dx, dy from center), shortest path
  const rotateArrow = useCallback((dx: number, dy: number) => {
    const targetAngle = Math.atan2(dx, -dy) * (180 / Math.PI)
    const currentRot = rotationRef.current
    const rawDelta = targetAngle - (((currentRot % 360) + 360) % 360)
    const shortDelta = ((rawDelta + 540) % 360) - 180
    const newRotation = currentRot + shortDelta
    rotationRef.current = newRotation
    onRotate?.(newRotation)
    // Broadcast rotation update
    onCameraMoveRef.current?.(cameraRef.current.x, cameraRef.current.y, newRotation)
  }, [onRotate])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Ignore if clicking on a frame element
    if ((e.target as HTMLElement).closest('[data-spatial-frame]')) return

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dx = e.clientX - rect.left - rect.width / 2
    const dy = e.clientY - rect.top - rect.height / 2
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return

    glideTargetRef.current = null
    rotateArrow(dx, dy)
    holdRef.current = { dx, dy, startTime: Date.now(), startX: e.clientX, startY: e.clientY }
    startAnimation()
  }, [rotateArrow, startAnimation])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!holdRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dx = e.clientX - rect.left - rect.width / 2
    const dy = e.clientY - rect.top - rect.height / 2
    holdRef.current.dx = dx
    holdRef.current.dy = dy
    rotateArrow(dx, dy)
  }, [rotateArrow])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const hold = holdRef.current
    holdRef.current = null

    if (!hold) return

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const tapX = e.clientX - rect.left
    const tapY = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    const isTap = Date.now() - hold.startTime < 300 &&
      Math.abs(e.clientX - hold.startX) < 10 &&
      Math.abs(e.clientY - hold.startY) < 10

    if (isTap) {
      // Check nodes (userspace hosts)
      const cx = centerX + cameraRef.current.x
      const cy = centerY + cameraRef.current.y
      for (const node of layoutNodes) {
        const nx = cx + node.x
        const ny = cy + node.y
        if (Math.hypot(tapX - nx, tapY - ny) <= node.radius) {
          if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
          onEnterSubspace(node.userId, node.hostName, node.hostColor)
          return
        }
      }

      // Check remote players (multiplayer cursors) → enter player mode
      if (remotePlayers && remotePlayers.length > 0) {
        const boundsW = BOUNDS.maxX - BOUNDS.minX
        const boundsH = BOUNDS.maxY - BOUNDS.minY
        const cam = cameraRef.current
        for (const player of remotePlayers) {
          const playerCamX = BOUNDS.minX + player.rx * boundsW
          const playerCamY = BOUNDS.minY + player.ry * boundsH
          const screenX = centerX + cam.x - playerCamX
          const screenY = centerY + cam.y - playerCamY
          if (Math.hypot(tapX - screenX, tapY - screenY) <= 20) {
            if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
            // Only call onDockPlayer — parent will call enterPlayerMode via ref
            // to avoid double nav stack push
            onDockPlayer?.(player.id, player.name, player.color)
            return
          }
        }
      }

      // Glide toward tap point
      const dx = tapX - centerX
      const dy = tapY - centerY
      glideTargetRef.current = clampCamera({
        x: cameraRef.current.x - dx,
        y: cameraRef.current.y - dy,
      })
      startAnimation()
    } else {
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
    }
  }, [layoutNodes, onEnterSubspace, startAnimation, remotePlayers, onDockPlayer])

  // Register DOM overlay drop zones for userspace nodes
  useEffect(() => {
    if (!visible || !containerRef.current) return
    const container = containerRef.current
    const rect = container.getBoundingClientRect()
    const cx = rect.width / 2 + camera.x
    const cy = rect.height / 2 + camera.y

    layoutNodes.forEach(node => {
      const dropId = `userspace:${node.userId}`
      let el = dropZoneRefs.current.get(dropId) as HTMLElement | undefined
      if (!el) {
        el = document.createElement('div')
        el.style.position = 'absolute'
        el.style.width = `${node.radius * 2}px`
        el.style.height = `${node.radius * 2}px`
        el.style.pointerEvents = 'none'
        container.appendChild(el)
        dropZoneRefs.current.set(dropId, el)
      }
      el.style.left = `${cx + node.x - node.radius}px`
      el.style.top = `${cy + node.y - node.radius}px`
    })

    return () => {
      layoutNodes.forEach(node => {
        const dropId = `userspace:${node.userId}`
        const el = dropZoneRefs.current.get(dropId)
        if (el && el.parentNode === container) {
          container.removeChild(el)
        }
        dropZoneRefs.current.delete(dropId)
      })
    }
  }, [visible, layoutNodes, camera, dropZoneRefs])

  // Register remote player positions + self as dynamic drop zones when dragging
  const selfDropEl = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!visible || !containerRef.current || !isDraggingDockstar) {
      // Clean up player drop zones
      playerDropEls.current.forEach((el, id) => {
        if (el.parentNode) el.parentNode.removeChild(el)
        dropZoneRefs.current.delete(`player:${id}`)
      })
      playerDropEls.current.clear()
      // Clean up self drop zone
      if (selfDropEl.current?.parentNode) {
        selfDropEl.current.parentNode.removeChild(selfDropEl.current)
        selfDropEl.current = null
      }
      dropZoneRefs.current.delete(`player:${selfUserId}`)
      return
    }

    const container = containerRef.current
    const rect = container.getBoundingClientRect()

    // Register self drop zone at center — only after dockstar has been dragged away
    if (hasDraggedAwayRef.current) {
      if (!selfDropEl.current) {
        selfDropEl.current = document.createElement('div')
        selfDropEl.current.style.position = 'absolute'
        selfDropEl.current.style.width = '40px'
        selfDropEl.current.style.height = '40px'
        selfDropEl.current.style.pointerEvents = 'none'
        container.appendChild(selfDropEl.current)
      }
      selfDropEl.current.style.left = `${rect.width / 2 - 20}px`
      selfDropEl.current.style.top = `${rect.height / 2 - 20}px`
      dropZoneRefs.current.set(`player:${selfUserId}`, selfDropEl.current)
    }

    // Register remote player drop zones
    if (remotePlayers && remotePlayers.length > 0) {
      const boundsW = BOUNDS.maxX - BOUNDS.minX
      const boundsH = BOUNDS.maxY - BOUNDS.minY

      remotePlayers.forEach(player => {
        const playerCamX = BOUNDS.minX + player.rx * boundsW
        const playerCamY = BOUNDS.minY + player.ry * boundsH
        const screenX = rect.width / 2 + camera.x - playerCamX
        const screenY = rect.height / 2 + camera.y - playerCamY

        let el = playerDropEls.current.get(player.id)
        if (!el) {
          el = document.createElement('div')
          el.style.position = 'absolute'
          el.style.width = '40px'
          el.style.height = '40px'
          el.style.pointerEvents = 'none'
          container.appendChild(el)
          playerDropEls.current.set(player.id, el)
        }
        el.style.left = `${screenX - 20}px`
        el.style.top = `${screenY - 20}px`
        dropZoneRefs.current.set(`player:${player.id}`, el)
      })
    }

    return () => {
      playerDropEls.current.forEach((el, id) => {
        if (el.parentNode === container) container.removeChild(el)
        dropZoneRefs.current.delete(`player:${id}`)
      })
      playerDropEls.current.clear()
      if (selfDropEl.current?.parentNode === container) {
        container.removeChild(selfDropEl.current)
        selfDropEl.current = null
      }
      dropZoneRefs.current.delete(`player:${selfUserId}`)
    }
  }, [visible, isDraggingDockstar, remotePlayers, camera, dropZoneRefs, selfUserId])

  if (!visible) return null

  // Calculate screen positions for frames
  const screenCx = (typeof window !== 'undefined' ? window.innerWidth : 375) / 2 + camera.x
  const screenCy = (typeof window !== 'undefined' ? window.innerHeight : 812) / 2 + camera.y

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-30"
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
      />

      {/* ── LOBBY MODE: Floating Tab Frames ── */}
      {spatialMode === 'lobby' && FRAMES.map(frame => {
        const frameLeft = screenCx + frame.x - FRAME_WIDTH / 2
        const frameTop = screenCy + frame.y - FRAME_HEIGHT / 2
        const previews = framePreviews?.[frame.tab] || []

        return (
          <div
            key={frame.id}
            data-spatial-frame
            className="absolute pointer-events-auto"
            style={{
              left: frameLeft,
              top: frameTop,
              width: FRAME_WIDTH,
              height: FRAME_HEIGHT,
            }}
          >
            <div
              className="w-full h-full rounded-xl overflow-hidden flex flex-col"
              style={{
                backgroundColor: '#0f172a',
                border: `1.5px solid ${frame.color}40`,
                boxShadow: `0 0 20px ${frame.color}15`,
              }}
            >
              {/* Frame header */}
              <div
                className="px-3 py-2 flex items-center gap-2 shrink-0"
                style={{ borderBottom: `1px solid ${frame.color}30` }}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: frame.color }}
                />
                <span
                  className="text-[11px] font-mono uppercase tracking-wider"
                  style={{ color: frame.color }}
                >
                  {frame.label}
                </span>
              </div>

              {/* Preview cards */}
              <div className="flex-1 px-2 py-2 space-y-1.5 overflow-hidden">
                {previews.length > 0 ? previews.slice(0, 4).map((title, i) => (
                  <div
                    key={i}
                    className="px-2 py-1.5 rounded text-[9px] font-serif leading-tight truncate"
                    style={{
                      backgroundColor: `${frame.color}08`,
                      color: '#94a3b8',
                      borderLeft: `2px solid ${frame.color}40`,
                    }}
                  >
                    {title}
                  </div>
                )) : (
                  <div className="text-[9px] font-mono text-muted-light/30 text-center pt-4">
                    No items
                  </div>
                )}
              </div>

              {/* Dockport */}
              <div className="shrink-0 px-3 py-2 flex justify-center" style={{ borderTop: `1px solid ${frame.color}20` }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleFrameDock(frame.tab)
                  }}
                  className="w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110"
                  style={{
                    borderColor: `${frame.color}80`,
                    backgroundColor: `${frame.color}20`,
                  }}
                >
                  <svg className="w-4 h-4" style={{ fill: frame.color }} viewBox="0 0 24 24">
                    <path d="M12 2l3 9h-2v11h-2V11H9z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {/* ── LIST MODE: Floating cards from tab ── */}
      {spatialMode === 'list' && listTab && (() => {
        const items = listItems || []
        const tabColor = FRAMES.find(f => f.tab === listTab)?.color || '#22d3ee'
        const tabLabel = FRAMES.find(f => f.tab === listTab)?.label || listTab

        if (items.length === 0) {
          return (
            <div
              data-spatial-frame
              className="absolute pointer-events-auto"
              style={{
                left: screenCx - 80,
                top: screenCy - 30,
                width: 160,
              }}
            >
              <div className="text-center text-[11px] font-mono text-muted-light/50 py-4">
                No {tabLabel.toLowerCase()} yet
              </div>
            </div>
          )
        }

        return items.map((item, i) => {
          const col = i % LIST_COLS
          const row = Math.floor(i / LIST_COLS)
          const totalW = LIST_COLS * LIST_CARD_W + (LIST_COLS - 1) * LIST_GAP
          const cardX = screenCx + col * (LIST_CARD_W + LIST_GAP) - totalW / 2
          const cardY = screenCy + row * (LIST_CARD_H + LIST_GAP) - 120

          return (
            <div
              key={item.id}
              data-spatial-frame
              className="absolute pointer-events-auto"
              style={{
                left: cardX,
                top: cardY,
                width: LIST_CARD_W,
                height: LIST_CARD_H,
              }}
            >
              <div
                className="w-full h-full rounded-lg overflow-hidden flex flex-col"
                style={{
                  backgroundColor: '#0f172a',
                  border: `1px solid ${tabColor}30`,
                  boxShadow: `0 0 12px ${tabColor}10`,
                }}
              >
                <div className="flex-1 px-2.5 py-2 min-w-0">
                  <div
                    className="text-[10px] font-serif leading-snug line-clamp-3"
                    style={{ color: '#cbd5e1' }}
                  >
                    {item.title}
                  </div>
                  {item.phase && (
                    <div
                      className="mt-1 text-[8px] font-mono uppercase tracking-wide"
                      style={{ color: `${tabColor}99` }}
                    >
                      {item.phase}{item.tier ? ` T${item.tier}` : ''}
                    </div>
                  )}
                </div>
                <div className="shrink-0 px-2 py-1.5 flex justify-end" style={{ borderTop: `1px solid ${tabColor}15` }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDockItem?.(item.id)
                    }}
                    className="w-6 h-6 rounded-full border flex items-center justify-center transition-all hover:scale-110"
                    style={{
                      borderColor: `${tabColor}60`,
                      backgroundColor: `${tabColor}15`,
                    }}
                  >
                    <svg className="w-3 h-3" style={{ fill: tabColor }} viewBox="0 0 24 24">
                      <path d="M12 2l3 9h-2v11h-2V11H9z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )
        })
      })()}

      {/* ── PLAYER MODE: Leader-follow panel (only shown when host has active nav state) ── */}
      {spatialMode === 'player' && dockedPlayer && (hostNavState?.dockedPostId || hostNavState?.activeTab) && (
        <div
          data-spatial-frame
          className="absolute pointer-events-auto"
          style={{
            left: screenCx - 140,
            top: 60,
            width: 280,
          }}
        >
          <div
            className="rounded-xl overflow-hidden"
            style={{
              backgroundColor: '#0f172aee',
              border: `1.5px solid ${dockedPlayer.color}40`,
              boxShadow: `0 0 20px ${dockedPlayer.color}15`,
            }}
          >
            {/* Host nav state — header already shows "Following [name]" */}
            <div className="px-3 py-2.5">
              {hostNavState?.dockedPostId ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[9px] font-mono text-muted-light/50 uppercase tracking-wider mb-0.5">Viewing</div>
                    <div className="text-[11px] font-serif text-foreground/80 truncate">
                      {hostNavState.dockedPostId}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onFollowHost?.()
                    }}
                    className="shrink-0 px-2.5 py-1 rounded-md text-[10px] font-mono transition-all hover:scale-105"
                    style={{
                      backgroundColor: `${dockedPlayer.color}20`,
                      color: dockedPlayer.color,
                      border: `1px solid ${dockedPlayer.color}40`,
                    }}
                  >
                    Follow
                  </button>
                </div>
              ) : hostNavState?.activeTab ? (
                <div>
                  <div className="text-[9px] font-mono text-muted-light/50 uppercase tracking-wider mb-0.5">Browsing</div>
                  <div className="text-[11px] font-mono capitalize" style={{ color: dockedPlayer.color }}>
                    {hostNavState.activeTab}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Nest too deep toast */}
      {nestTooDeep && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="px-4 py-2 rounded-lg bg-error/90 text-white text-xs font-mono backdrop-blur-sm">
            Nesting too deep (max {MAX_NEST_DEPTH})
          </div>
        </div>
      )}

      {/* Subtle count label — bottom right */}
      <div className="absolute bottom-3 right-3 text-[10px] font-mono text-muted-light/30 pointer-events-none">
        {spatialMode === 'lobby' && `${layoutNodes.length} ${layoutNodes.length === 1 ? 'host' : 'hosts'}`}
        {spatialMode === 'list' && `${(listItems || []).length} ${listTab || 'items'}`}
      </div>
    </div>
  )
})

export default SpatialCanvas
