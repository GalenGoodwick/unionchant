'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface CameraState {
  x: number
  y: number
  heartRotation: number
}

interface UseCameraReturn {
  camera: CameraState
  isDragging: boolean
  moveDirection: { x: number; y: number } | null  // normalized unit vector of movement
  moveSpeed: number  // px/sec
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerMove: (e: React.PointerEvent) => void
    onPointerUp: (e: React.PointerEvent) => void
  }
  setCameraPosition: (x: number, y: number) => void
}

export function useCamera(initialX = 0, initialY = 0): UseCameraReturn {
  const [camera, setCamera] = useState<CameraState>({
    x: initialX,
    y: initialY,
    heartRotation: 0,
  })
  const [isDragging, setIsDragging] = useState(false)
  const [moveDirection, setMoveDirection] = useState<{ x: number; y: number } | null>(null)
  const [moveSpeed, setMoveSpeed] = useState(0)

  const stateRef = useRef({
    x: initialX,
    y: initialY,
    targetX: initialX,
    targetY: initialY,
    velX: 0,
    velY: 0,
    heartRotation: 0,
    isDragging: false,
    lastPointerX: 0,
    lastPointerY: 0,
    lastMoveTime: 0,
    smoothDirX: 0,
    smoothDirY: 0,
    rawSpeed: 0,
    animFrame: 0,
  })

  // Animation loop for momentum and interpolation
  useEffect(() => {
    let lastTime = performance.now()

    const animate = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05) // cap dt
      lastTime = now
      const s = stateRef.current

      if (!s.isDragging && (Math.abs(s.velX) > 0.1 || Math.abs(s.velY) > 0.1)) {
        // Apply momentum
        s.targetX += s.velX * dt * 60
        s.targetY += s.velY * dt * 60
        s.velX *= 0.94
        s.velY *= 0.94

        // Update heart rotation from momentum direction
        if (Math.abs(s.velX) > 0.5 || Math.abs(s.velY) > 0.5) {
          const angle = Math.atan2(-s.velY, -s.velX) * (180 / Math.PI)
          s.heartRotation += (angle - s.heartRotation) * 0.03
        }
      }

      // Decay direction when not dragging
      if (!s.isDragging) {
        s.smoothDirX *= 0.95
        s.smoothDirY *= 0.95
        s.rawSpeed *= 0.93
      }

      // Update direction/speed state (throttled)
      const dirLen = Math.hypot(s.smoothDirX, s.smoothDirY)
      if (dirLen > 0.05) {
        setMoveDirection({ x: s.smoothDirX / dirLen, y: s.smoothDirY / dirLen })
        setMoveSpeed(s.rawSpeed)
      } else {
        setMoveDirection(null)
        setMoveSpeed(0)
      }

      // Smooth interpolation toward target
      const lerpFactor = Math.min(1, 12 * dt)
      s.x += (s.targetX - s.x) * lerpFactor
      s.y += (s.targetY - s.y) * lerpFactor

      // Update React state (throttled — only when values change meaningfully)
      const dx = Math.abs(s.x - camera.x)
      const dy = Math.abs(s.y - camera.y)
      const dr = Math.abs(s.heartRotation - camera.heartRotation)
      if (dx > 0.1 || dy > 0.1 || dr > 0.1) {
        setCamera({
          x: s.x,
          y: s.y,
          heartRotation: s.heartRotation,
        })
      }

      s.animFrame = requestAnimationFrame(animate)
    }

    stateRef.current.animFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(stateRef.current.animFrame)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Don't capture if the event target is interactive content
    const target = e.target as HTMLElement
    if (target.closest('button, a, input, [data-interactive]')) return

    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    const s = stateRef.current
    s.isDragging = true
    s.lastPointerX = e.clientX
    s.lastPointerY = e.clientY
    s.velX = 0
    s.velY = 0
    setIsDragging(true)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current
    if (!s.isDragging) return
    e.preventDefault()

    const dx = e.clientX - s.lastPointerX
    const dy = e.clientY - s.lastPointerY

    // Move camera opposite to drag direction (drag world)
    s.targetX -= dx
    s.targetY -= dy

    // Track velocity for momentum
    s.velX = -dx * 0.8
    s.velY = -dy * 0.8

    // Track movement direction (camera direction = opposite of drag)
    const moveDx = -dx
    const moveDy = -dy
    const moveLen = Math.hypot(moveDx, moveDy)
    if (moveLen > 1) {
      const rawDirX = moveDx / moveLen
      const rawDirY = moveDy / moveLen
      // Exponential moving average for smoothing
      s.smoothDirX = s.smoothDirX * 0.7 + rawDirX * 0.3
      s.smoothDirY = s.smoothDirY * 0.7 + rawDirY * 0.3
      // Speed in px/sec
      const now = performance.now()
      const timeDelta = now - s.lastMoveTime
      if (timeDelta > 0) {
        s.rawSpeed = (moveLen / timeDelta) * 1000
      }
      s.lastMoveTime = now
    }

    // Counter-rotate heart against movement direction
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      const angle = Math.atan2(dy, dx) * (180 / Math.PI) // direction of drag
      s.heartRotation += (angle - s.heartRotation) * 0.08
    }

    s.lastPointerX = e.clientX
    s.lastPointerY = e.clientY
  }, [])

  const onPointerUp = useCallback(() => {
    stateRef.current.isDragging = false
    setIsDragging(false)
  }, [])

  const setCameraPosition = useCallback((x: number, y: number) => {
    const s = stateRef.current
    s.targetX = x
    s.targetY = y
    s.velX = 0
    s.velY = 0
  }, [])

  return {
    camera,
    isDragging,
    moveDirection,
    moveSpeed,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
    setCameraPosition,
  }
}
