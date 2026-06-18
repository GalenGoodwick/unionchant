'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import type { UserspaceNode } from './useUserspace'

// Spatial bounds — players can't go beyond this
const BOUNDS = { minX: -600, maxX: 600, minY: -400, maxY: 400 }

// Frame positions in grid space
const FRAMES = [
  { id: '__nav_chants__', tab: 'chants' as const, label: 'Chants', color: '#22d3ee', x: -200, y: 0 },
  { id: '__nav_podiums__', tab: 'podiums' as const, label: 'Podiums', color: '#a78bfa', x: 200, y: -150 },
  { id: '__nav_groups__', tab: 'groups' as const, label: 'Groups', color: '#fbbf24', x: 200, y: 150 },
]

const FRAME_WIDTH = 160
const FRAME_HEIGHT = 280

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
  remotePlayers?: { id: string; name: string; color: string; rx: number; ry: number }[]
  onCameraMove?: (x: number, y: number) => void
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

export default function SpatialCanvas({
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
}: SpatialCanvasProps) {
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

  // Keep cameraRef in sync + broadcast position
  useEffect(() => {
    cameraRef.current = camera
    onCameraMoveRef.current?.(camera.x, camera.y)
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

    // Draw remote players as arrow cursors
    if (remotePlayers && remotePlayers.length > 0) {
      const boundsW = BOUNDS.maxX - BOUNDS.minX  // 1200
      const boundsH = BOUNDS.maxY - BOUNDS.minY  // 800
      remotePlayers.forEach(player => {
        // Convert ratio position back to camera coords in bounds space
        const playerCamX = BOUNDS.minX + player.rx * boundsW
        const playerCamY = BOUNDS.minY + player.ry * boundsH
        // Their screen position relative to ours: center + difference
        const screenX = rect.width / 2 + (playerCamX - camera.x)
        const screenY = rect.height / 2 + (playerCamY - camera.y)

        // Arrow cursor pointing up (triangle)
        ctx.save()
        ctx.translate(screenX, screenY)
        ctx.beginPath()
        ctx.moveTo(0, -12)
        ctx.lineTo(-7, 8)
        ctx.lineTo(0, 4)
        ctx.lineTo(7, 8)
        ctx.closePath()
        ctx.fillStyle = player.color
        ctx.fill()
        ctx.strokeStyle = '#020617'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.restore()

        // Name label
        ctx.fillStyle = player.color
        ctx.font = '9px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(player.name.slice(0, 12), screenX, screenY + 12)
      })
    }
  }, [visible, layoutNodes, camera, selfColor, selfName, remotePlayers])

  // Rotate arrow toward a screen offset (dx, dy from center), shortest path
  const rotateArrow = useCallback((dx: number, dy: number) => {
    const targetAngle = Math.atan2(dx, -dy) * (180 / Math.PI)
    const currentRot = rotationRef.current
    const rawDelta = targetAngle - (((currentRot % 360) + 360) % 360)
    const shortDelta = ((rawDelta + 540) % 360) - 180
    const newRotation = currentRot + shortDelta
    rotationRef.current = newRotation
    onRotate?.(newRotation)
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

      // Check remote players (multiplayer cursors)
      if (remotePlayers && remotePlayers.length > 0) {
        const boundsW = BOUNDS.maxX - BOUNDS.minX
        const boundsH = BOUNDS.maxY - BOUNDS.minY
        const cam = cameraRef.current
        for (const player of remotePlayers) {
          const playerCamX = BOUNDS.minX + player.rx * boundsW
          const playerCamY = BOUNDS.minY + player.ry * boundsH
          const screenX = centerX + (playerCamX - cam.x)
          const screenY = centerY + (playerCamY - cam.y)
          if (Math.hypot(tapX - screenX, tapY - screenY) <= 20) {
            if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
            onEnterSubspace(player.id, player.name, player.color)
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
  }, [layoutNodes, onEnterSubspace, startAnimation, remotePlayers])

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

      {/* Floating Tab Frames */}
      {FRAMES.map(frame => {
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
                    onDockFrame?.(frame.tab)
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

      {/* Labels */}
      <div className="absolute top-3 left-3 text-[10px] font-mono text-muted-light/40 pointer-events-none">
        SPATIAL VIEW — tap orb to return
      </div>
      <div className="absolute top-3 right-3 text-[10px] font-mono text-muted-light/40 pointer-events-none">
        {layoutNodes.length} active {layoutNodes.length === 1 ? 'host' : 'hosts'}
      </div>
    </div>
  )
}
