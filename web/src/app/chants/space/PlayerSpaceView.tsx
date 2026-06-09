'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import PixelEngine, { WORLD_W, WORLD_H } from './PixelEngine'
import type { PixelEngineHandle } from './PixelEngine'
import { useCamera } from './useCamera'
import { computePortMagnifications, findSnapPort } from './useConeOfSight'
import { getAllPorts, MOCK_SETS, PORT_OBJ_BASE } from './port-data'
import type { Port, SetPort } from './port-data'
import { stampScaledPattern, stampText, getStarPattern, getPatternSize } from './stamp-helpers'

interface DockHistoryEntry {
  id: string
  dockPointId: string
  label: string
  timestamp: number
}

interface PlayerSpaceViewProps {
  onDock: (dockPointId: string) => void
  dockHistory: DockHistoryEntry[]
  initialCameraX?: number
  initialCameraY?: number
}

export default function PlayerSpaceView({
  onDock,
  dockHistory,
  initialCameraX = 0,
  initialCameraY = 0,
}: PlayerSpaceViewProps) {
  const engineRef = useRef<PixelEngineHandle>(null)
  const { camera, isDragging, moveDirection, moveSpeed, handlers, setCameraPosition } = useCamera(initialCameraX, initialCameraY)
  const [hoveredObjId, setHoveredObjId] = useState(0)
  const [sets, setSets] = useState<SetPort[]>(MOCK_SETS)
  const [showCreateSet, setShowCreateSet] = useState(false)
  const [setName, setSetName] = useState('')
  const prevMagRef = useRef<number[]>([])
  const portTexColorRef = useRef<Uint8Array | null>(null)
  const portTexObjRef = useRef<Uint8Array | null>(null)
  const frameCountRef = useRef(0)

  // All ports including dynamic sets
  const ports = getAllPorts(sets)

  // Initialize port texture buffers
  useEffect(() => {
    portTexColorRef.current = new Uint8Array(WORLD_W * WORLD_H * 4)
    portTexObjRef.current = new Uint8Array(WORLD_W * WORLD_H * 4)
  }, [])

  // Stamp ports to overlay texture — called when magnification changes
  const stampPorts = useCallback((magnifications: { portId: string; magnification: number }[]) => {
    const colorData = portTexColorRef.current
    const objData = portTexObjRef.current
    if (!colorData || !objData) return

    // Clear entire port layer
    colorData.fill(0)
    objData.fill(0)

    const cx = WORLD_W / 2
    const cy = WORLD_H / 2

    ports.forEach(port => {
      const mag = magnifications.find(m => m.portId === port.id)
      const scale = Math.max(1, Math.round(mag?.magnification || 1))
      const pattern = getStarPattern(port.baseSize * scale)
      const patSize = getPatternSize(pattern, scale)

      const worldX = cx + port.worldX - patSize.w / 2
      const worldY = cy + port.worldY - patSize.h / 2

      // Stamp the star pattern
      stampScaledPattern(
        new Float32Array(colorData.buffer),
        new Float32Array(objData.buffer),
        pattern,
        worldX, worldY,
        port.color[0], port.color[1], port.color[2],
        port.objId,
        scale,
        WORLD_W, WORLD_H,
      )

      // Stamp label below star
      const fontSize = Math.max(9, Math.min(14, 11 * scale))
      stampText(
        new Float32Array(colorData.buffer),
        new Float32Array(objData.buffer),
        port.label,
        worldX - 5, worldY + patSize.h + 2,
        port.color[0], port.color[1], port.color[2],
        port.objId,
        WORLD_W, WORLD_H,
        fontSize,
      )
    })

    // Upload to GPU
    engineRef.current?.updatePortTextures(colorData, objData)
  }, [ports])

  // Animation loop — runs cone-of-sight and updates textures
  useEffect(() => {
    let animId: number

    const loop = () => {
      frameCountRef.current++
      const engine = engineRef.current
      if (!engine) { animId = requestAnimationFrame(loop); return }

      // Compute magnifications
      const magnifications = computePortMagnifications(
        ports,
        camera.x, camera.y,
        moveDirection,
        moveSpeed,
      )

      // Check if magnification changed enough to re-stamp (throttle to every 3 frames)
      const currentMags = magnifications.map(m => m.magnification)
      const isDirty = currentMags.some((m, i) =>
        Math.abs(m - (prevMagRef.current[i] || 1)) > 0.08
      )

      if (isDirty && frameCountRef.current % 3 === 0) {
        stampPorts(magnifications)
        prevMagRef.current = currentMags
      }

      // Update glow uniforms
      const glows = new Array(16).fill(0)
      magnifications.forEach(m => {
        const port = ports.find(p => p.id === m.portId)
        if (port) {
          const glowIdx = port.objId - PORT_OBJ_BASE
          if (glowIdx >= 0 && glowIdx < 16) {
            glows[glowIdx] = m.glowIntensity
          }
        }
      })
      engine.setPortGlows(glows)

      // Player star pulse
      const pulse = Math.sin(performance.now() / 500) * 0.5 + 0.5
      engine.setPlayerStarPulse(pulse)

      // Facing angle from movement direction
      if (moveDirection) {
        const angle = Math.atan2(moveDirection.y, moveDirection.x)
        engine.setFacingAngle(angle)
      }

      // Check for dock snap
      const snapId = findSnapPort(magnifications, 25)
      if (snapId) {
        onDock(snapId)
        return // stop loop — transitioning out
      }

      // Hover detection from dockstar drag proximity
      if (isDragging) {
        const worldPos = engine.screenToWorld(window.innerWidth / 2, window.innerHeight / 2)
        const objId = engine.getObjectAtWorld(worldPos.x, worldPos.y)
        setHoveredObjId(objId)
      }

      animId = requestAnimationFrame(loop)
    }

    animId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animId)
  }, [camera, moveDirection, moveSpeed, isDragging, ports, stampPorts, onDock])

  // Initial port stamp
  useEffect(() => {
    const magnifications = ports.map(p => ({ portId: p.id, magnification: 1 }))
    stampPorts(magnifications)
    prevMagRef.current = magnifications.map(m => m.magnification)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle click on a port (in addition to snap)
  const handleClick = useCallback((e: React.MouseEvent) => {
    const engine = engineRef.current
    if (!engine) return
    const worldPos = engine.screenToWorld(e.clientX, e.clientY)
    const section = engine.getSectionAtWorld(worldPos.x, worldPos.y)
    if (section) {
      onDock(`__nav_${section}__`)
      return
    }
    // Check port bounds
    const cx = WORLD_W / 2
    const cy = WORLD_H / 2
    for (const port of ports) {
      const px = cx + port.worldX
      const py = cy + port.worldY
      const dist = Math.hypot(worldPos.x - px, worldPos.y - py)
      if (dist < 30) {
        onDock(port.id)
        return
      }
    }
  }, [onDock, ports])

  // Create set handler
  const handleCreateSet = useCallback(() => {
    const name = setName.trim()
    if (!name || name.length > 20) return
    const newSet: SetPort = {
      id: `set-${Date.now()}`,
      name,
      worldX: camera.x + (Math.random() - 0.5) * 40,
      worldY: camera.y + (Math.random() - 0.5) * 40,
      creator: 'You',
      memberCount: 1,
    }
    setSets(prev => [...prev, newSet])
    setSetName('')
    setShowCreateSet(false)
  }, [setName, camera.x, camera.y])

  return (
    <div
      className="fixed inset-0 z-[50] touch-none cursor-none"
      {...handlers}
      onClick={handleClick}
    >
      <PixelEngine
        ref={engineRef}
        cameraX={camera.x}
        cameraY={camera.y}
        hoveredObjId={hoveredObjId}
      />

      {/* Dock history trail — small star dots */}
      {dockHistory.length > 0 && (
        <div className="fixed top-4 left-4 z-[55] flex flex-col gap-1 max-h-[50vh] overflow-hidden">
          <div className="text-[9px] font-mono text-muted-light/40 uppercase tracking-wider">History</div>
          {dockHistory.slice(-8).reverse().map((entry, i) => (
            <button
              key={entry.id}
              onClick={(e) => { e.stopPropagation(); onDock(entry.dockPointId) }}
              className="flex items-center gap-1.5 text-left group"
              style={{ opacity: 1 - i * 0.1 }}
            >
              <svg className="w-3 h-3 fill-accent/40 group-hover:fill-accent shrink-0" viewBox="0 0 24 24">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
              </svg>
              <span className="text-[10px] font-mono text-muted-light/50 group-hover:text-accent truncate max-w-[120px]">
                {entry.label}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Create Set button */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowCreateSet(true) }}
        className="fixed bottom-6 right-6 z-[55] w-12 h-12 rounded-full border-2 border-accent/40 bg-header/80 flex items-center justify-center hover:border-accent hover:bg-accent/10 transition-all"
      >
        <svg className="w-6 h-6 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      {/* Create Set overlay */}
      {showCreateSet && (
        <div className="fixed bottom-20 right-6 z-[56] bg-surface border border-border rounded-lg p-3 shadow-xl" onClick={e => e.stopPropagation()}>
          <div className="text-[10px] font-mono text-muted-light uppercase tracking-wider mb-2">New Set</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={setName}
              onChange={e => setSetName(e.target.value.slice(0, 20))}
              placeholder="Name (20 chars)"
              autoFocus
              className="bg-header border border-border/50 rounded px-2 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-light/40 outline-none focus:border-accent w-40"
              onKeyDown={e => { if (e.key === 'Enter') handleCreateSet(); if (e.key === 'Escape') setShowCreateSet(false) }}
            />
            <button
              onClick={handleCreateSet}
              disabled={!setName.trim()}
              className="px-3 py-1.5 bg-accent/20 border border-accent/40 rounded text-sm font-mono text-accent hover:bg-accent/30 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              OK
            </button>
          </div>
          <div className="text-[9px] font-mono text-muted-light/30 mt-1">{setName.length}/20</div>
        </div>
      )}
    </div>
  )
}

export type { DockHistoryEntry }
