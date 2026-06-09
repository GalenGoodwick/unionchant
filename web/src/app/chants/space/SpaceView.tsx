'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import PixelEngine, { SECTION_BOUNDS, SECTION_OBJ_BASE } from './PixelEngine'
import type { PixelEngineHandle } from './PixelEngine'
import type { SectionId } from './world-data'
import { useCamera } from './useCamera'

interface SpaceViewProps {
  initialCameraX?: number
  initialCameraY?: number
  onDock: (sectionId: SectionId) => void
  dockstarDragPos: { x: number; y: number } | null // screen coords during drag
}

export default function SpaceView({
  initialCameraX = 0,
  initialCameraY = 0,
  onDock,
  dockstarDragPos,
}: SpaceViewProps) {
  const { camera, handlers } = useCamera(initialCameraX, initialCameraY)
  const engineRef = useRef<PixelEngineHandle>(null)
  const [hoveredObjId, setHoveredObjId] = useState(0)

  // When dockstar is being dragged, find the nearest section in world space
  useEffect(() => {
    if (!dockstarDragPos || !engineRef.current) {
      setHoveredObjId(0)
      return
    }

    const world = engineRef.current.screenToWorld(dockstarDragPos.x, dockstarDragPos.y)

    // Check which section is nearest
    let nearest: { objId: number; dist: number } | null = null
    for (const sb of SECTION_BOUNDS) {
      const cx = sb.x + sb.w / 2
      const cy = sb.y + sb.h / 2
      const dist = Math.hypot(world.x - cx, world.y - cy)
      if (dist < 120 && (!nearest || dist < nearest.dist)) {
        nearest = { objId: sb.objId, dist }
      }
    }

    setHoveredObjId(nearest?.objId || 0)
  }, [dockstarDragPos])

  // Handle click on canvas to dock to a section
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!engineRef.current) return
    const world = engineRef.current.screenToWorld(e.clientX, e.clientY)
    const sectionId = engineRef.current.getSectionAtWorld(world.x, world.y)
    if (sectionId) {
      onDock(sectionId)
    }
  }, [onDock])

  // Handle dockstar drop
  useEffect(() => {
    // This is handled by the parent — when dockstar is released and hoveredObjId > 0,
    // the parent checks which section and calls onDock
  }, [])

  return (
    <div
      className="fixed inset-0 z-0 overflow-hidden select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onClick={handleClick}
    >
      <PixelEngine
        ref={engineRef}
        cameraX={camera.x}
        cameraY={camera.y}
        hoveredObjId={hoveredObjId}
      />
    </div>
  )
}

export { SECTION_BOUNDS, SECTION_OBJ_BASE }
