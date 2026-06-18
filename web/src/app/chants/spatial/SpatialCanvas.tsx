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
  onRotate?: (degrees: number) => void
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
  onRotate,
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

  // Keep cameraRef in sync
  useEffect(() => { cameraRef.current = camera }, [camera])

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
        // Hold mode: speed proportional to distance from center (farther = faster)
        const dist = Math.hypot(hold.dx, hold.dy)
        if (dist > 1) {
          const speed = dist * 0.02
          const cur = cameraRef.current
          setCamera({ x: cur.x - (hold.dx / dist) * speed, y: cur.y - (hold.dy / dist) * speed })
        }
        animRef.current = requestAnimationFrame(animate)
      } else if (glide) {
        // Glide mode: ease toward target point
        const cur = cameraRef.current
        const dx = glide.x - cur.x
        const dy = glide.y - cur.y
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
          setCamera({ x: glide.x, y: glide.y })
          glideTargetRef.current = null
          animRef.current = null
          return
        }
        setCamera({ x: cur.x + dx * 0.08, y: cur.y + dy * 0.08 })
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

    // Draw other nodes
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
  }, [visible, layoutNodes, camera, selfColor, selfName])

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
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dx = e.clientX - rect.left - rect.width / 2
    const dy = e.clientY - rect.top - rect.height / 2
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return

    // Stop any glide animation
    glideTargetRef.current = null

    // Rotate arrow toward click
    rotateArrow(dx, dy)

    // Start continuous hold movement
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

    // Update direction and rotation to follow cursor
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

    // Check if tapped on a node (short tap, small movement)
    const isTap = Date.now() - hold.startTime < 300 &&
      Math.abs(e.clientX - hold.startX) < 10 &&
      Math.abs(e.clientY - hold.startY) < 10
    if (isTap) {
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
    }

    // Glide: animate canvas so click point arrives at center
    const dx = tapX - centerX
    const dy = tapY - centerY
    glideTargetRef.current = {
      x: cameraRef.current.x - dx,
      y: cameraRef.current.y - dy,
    }
    startAnimation()
  }, [layoutNodes, onEnterSubspace, startAnimation])

  // Register DOM overlay drop zones
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

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-30"
      style={{ touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      <div className="absolute top-3 left-3 text-[10px] font-mono text-muted-light/40">
        SPATIAL VIEW — tap orb to return
      </div>
      <div className="absolute top-3 right-3 text-[10px] font-mono text-muted-light/40">
        {layoutNodes.length} active {layoutNodes.length === 1 ? 'host' : 'hosts'}
      </div>
    </div>
  )
}
