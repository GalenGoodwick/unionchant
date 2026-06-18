'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import type { UserspaceNode } from './useUserspace'

interface SpatialCanvasProps {
  visible: boolean
  nodes: UserspaceNode[]
  selfUserId: string
  selfName: string
  selfColor: string
  followingIds: string[]
  onEnterSubspace: (userId: string, name: string, color: string) => void
  dropZoneRefs: React.MutableRefObject<Map<string, HTMLElement>>
}

interface LayoutNode extends UserspaceNode {
  x: number
  y: number
  radius: number
  ring: 'self' | 'following' | 'other'
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
}: SpatialCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([])
  const [camera, setCamera] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; camX: number; camY: number } | null>(null)

  // Layout nodes in radial pattern
  useEffect(() => {
    if (!visible) return

    const followingSet = new Set(followingIds)
    const followingNodes = nodes.filter(n => followingSet.has(n.userId))
    const otherNodes = nodes.filter(n => !followingSet.has(n.userId))

    const laid: LayoutNode[] = []

    // Inner ring: followed users
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

    // Outer ring: other active hosts
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

    // Draw ring guides
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 0.5
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.arc(cx, cy, 120, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, 240, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // Draw self node at center
    ctx.beginPath()
    ctx.arc(cx, cy, 14, 0, Math.PI * 2)
    ctx.fillStyle = selfColor + '40'
    ctx.fill()
    ctx.strokeStyle = selfColor
    ctx.lineWidth = 2
    ctx.stroke()
    // Self initial
    ctx.fillStyle = selfColor
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(selfName[0]?.toUpperCase() || '?', cx, cy)
    // Self label
    ctx.fillStyle = '#94a3b8'
    ctx.font = '9px monospace'
    ctx.fillText('you', cx, cy + 22)

    // Draw other nodes
    layoutNodes.forEach(node => {
      const nx = cx + node.x
      const ny = cy + node.y
      const isFollowing = node.ring === 'following'
      const alpha = isFollowing ? '60' : '30'
      const strokeAlpha = isFollowing ? 'cc' : '80'

      // Glow for active (has visitors)
      if (node.occupancy > 0) {
        ctx.beginPath()
        ctx.arc(nx, ny, node.radius + 6, 0, Math.PI * 2)
        ctx.fillStyle = node.hostColor + '15'
        ctx.fill()
      }

      // Circle
      ctx.beginPath()
      ctx.arc(nx, ny, node.radius, 0, Math.PI * 2)
      ctx.fillStyle = node.hostColor + alpha
      ctx.fill()
      ctx.strokeStyle = node.hostColor + strokeAlpha
      ctx.lineWidth = isFollowing ? 2 : 1
      ctx.stroke()

      // Initial
      ctx.fillStyle = node.hostColor
      ctx.font = `${isFollowing ? 11 : 9}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(node.hostName[0]?.toUpperCase() || '?', nx, ny)

      // Name below
      ctx.fillStyle = isFollowing ? '#e2e8f0' : '#64748b'
      ctx.font = '9px monospace'
      ctx.fillText(node.hostName.slice(0, 12), nx, ny + node.radius + 12)

      // Occupancy badge (top-right)
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
  }, [visible, layoutNodes, camera, selfColor, selfName])

  // Pan camera
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, camX: camera.x, camY: camera.y }
  }, [camera])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setCamera({ x: dragRef.current.camX + dx, y: dragRef.current.camY + dy })
  }, [])

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  // Register DOM overlay drop zones for dockstar snapping
  useEffect(() => {
    if (!visible || !containerRef.current) return
    const container = containerRef.current
    const rect = container.getBoundingClientRect()
    const cx = rect.width / 2 + camera.x
    const cy = rect.height / 2 + camera.y

    // Create/update invisible drop zone divs for each node
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
      // Cleanup drop zones when spatial view hides
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

  // Tap a node directly (in addition to dockstar drag)
  const handleCanvasTap = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) return // ignore if panning
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const tapX = e.clientX - rect.left
    const tapY = e.clientY - rect.top
    const cx = rect.width / 2 + camera.x
    const cy = rect.height / 2 + camera.y

    for (const node of layoutNodes) {
      const nx = cx + node.x
      const ny = cy + node.y
      const dist = Math.hypot(tapX - nx, tapY - ny)
      if (dist <= node.radius) {
        onEnterSubspace(node.userId, node.hostName, node.hostColor)
        return
      }
    }
  }, [layoutNodes, camera, onEnterSubspace])

  if (!visible) return null

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-30"
      style={{ touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onPointerDown={(e) => {
          handlePointerDown(e)
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => {
          handlePointerUp()
          // Detect tap (no drag) — enter subspace on tap
          if (dragRef.current === null) {
            handleCanvasTap(e)
          }
        }}
      />
      {/* State label */}
      <div className="absolute top-3 left-3 text-[10px] font-mono text-muted-light/40">
        SPATIAL VIEW — double-tap orb to return
      </div>
      {/* Node count */}
      <div className="absolute top-3 right-3 text-[10px] font-mono text-muted-light/40">
        {layoutNodes.length} active {layoutNodes.length === 1 ? 'host' : 'hosts'}
      </div>
    </div>
  )
}
