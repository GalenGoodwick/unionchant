'use client'

import { useState, useRef, useCallback, useEffect, createContext, useContext } from 'react'

interface DockstarProps {
  userInitial: string
  dockedPostId: string | null
  dropZoneRefs: React.MutableRefObject<Map<string, HTMLElement>>
  onDock: (postId: string) => void
  onUndock: () => void
  onUndockIdea?: () => void
  onDragStateChange?: (isDragging: boolean, nearestDrop: string | null) => void
  // Flash gold on miss-tap
  flashDocks?: boolean
  // External drag trigger — sidebar sets this to initiate drag from its position
  externalDragStart?: { x: number; y: number } | null
  onExternalDragHandled?: () => void
}

export default function Dockstar({
  userInitial,
  dockedPostId,
  dropZoneRefs,
  onDock,
  onUndock,
  onUndockIdea,
  onDragStateChange,
  flashDocks,
  externalDragStart,
  onExternalDragHandled,
}: DockstarProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const [nearestDrop, setNearestDrop] = useState<string | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const hasDraggedRef = useRef(false)

  // Notify parent of drag state
  useEffect(() => {
    onDragStateChange?.(isDragging, nearestDrop)
  }, [isDragging, nearestDrop, onDragStateChange])

  // Find nearest drop zone
  const findNearestDropZone = useCallback(
    (x: number, y: number): { id: string; distance: number } | null => {
      let nearest: { id: string; distance: number } | null = null
      dropZoneRefs.current.forEach((el, id) => {
        const rect = el.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const dist = Math.hypot(x - cx, y - cy)
        if (dist < 80 && (!nearest || dist < nearest.distance)) {
          nearest = { id, distance: dist }
        }
      })
      return nearest
    },
    [dropZoneRefs]
  )

  // External drag trigger — sidebar initiates drag from its position
  useEffect(() => {
    if (!externalDragStart) return
    setIsDragging(true)
    setDragPos(externalDragStart)
    onExternalDragHandled?.()

    const onMove = (e: PointerEvent) => {
      e.preventDefault()
      setDragPos({ x: e.clientX, y: e.clientY })
      const nearest = findNearestDropZone(e.clientX, e.clientY)
      setNearestDrop(nearest?.id || null)
    }
    const onUp = (e: PointerEvent) => {
      const nearest = findNearestDropZone(e.clientX, e.clientY)
      if (nearest) {
        onDock(nearest.id)
      } else if (dockedPostId?.startsWith('idea:') && onUndockIdea) {
        onUndockIdea()
      } else {
        onUndock()
      }
      setIsDragging(false)
      setDragPos(null)
      setNearestDrop(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [externalDragStart, onExternalDragHandled, findNearestDropZone, onDock, onUndock, onUndockIdea, dockedPostId])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)
      dragStartRef.current = { x: e.clientX, y: e.clientY }
      hasDraggedRef.current = false
      setDragPos({ x: e.clientX, y: e.clientY })
    },
    []
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current) return
      e.preventDefault()
      // Check drag threshold (5px) before entering drag mode
      if (!hasDraggedRef.current) {
        const dx = e.clientX - dragStartRef.current.x
        const dy = e.clientY - dragStartRef.current.y
        if (Math.hypot(dx, dy) < 5) return
        hasDraggedRef.current = true
        setIsDragging(true)
      }
      setDragPos({ x: e.clientX, y: e.clientY })
      const nearest = findNearestDropZone(e.clientX, e.clientY)
      setNearestDrop(nearest?.id || null)
    },
    [findNearestDropZone]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current) return
      dragStartRef.current = null

      if (!hasDraggedRef.current) {
        // Click without drag — step back one dock level, or flash if at home
        if (dockedPostId?.startsWith('idea:') && onUndockIdea) {
          onUndockIdea()
        } else {
          onUndock() // undocks if docked, flashes docks if at home
        }
        setDragPos(null)
        return
      }

      const nearest = findNearestDropZone(e.clientX, e.clientY)
      if (nearest) {
        onDock(nearest.id)
      } else if (dockedPostId?.startsWith('idea:') && onUndockIdea) {
        onUndockIdea()
      } else if (dockedPostId) {
        onUndock()
      }
      setIsDragging(false)
      setDragPos(null)
      setNearestDrop(null)
    },
    [findNearestDropZone, onDock, onUndock, onUndockIdea, dockedPostId]
  )

  // Determine orb position — one orb, three states: home, dragging, sidebar
  const isAtHome = !isDragging && !dockedPostId
  const isDockedToIdea = dockedPostId?.startsWith('idea:') ?? false
  let orbStyle: React.CSSProperties

  if (isDragging && dragPos) {
    orbStyle = { left: dragPos.x - 20, top: dragPos.y - 20, right: 'auto', transition: 'none' }
  } else if (dockedPostId) {
    // Docked — orb sits in sidebar position (centered in w-12 bar, top)
    orbStyle = { top: 8, right: 4, left: 'auto', transition: 'all 0.3s ease-out' }
  } else {
    // Home — top right
    orbStyle = { top: 12, right: 12, left: 'auto', transition: 'all 0.3s ease-out' }
  }

  return (
    <>
      {/* The single orb — moves between home (top-right) and sidebar */}
      <div
        data-dockstar
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`fixed z-[9999] select-none touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ ...orbStyle, opacity: isDockedToIdea && !isDragging ? 0.4 : 1, pointerEvents: 'auto' }}
      >
        <div className={`flex items-center justify-center rounded-full border-2 select-none transition-all duration-150 w-10 h-10 ${isDragging ? 'bg-accent text-header border-accent shadow-[0_0_24px_rgba(34,211,238,0.6)]' : dockedPostId ? 'bg-accent text-header border-accent shadow-[0_0_12px_rgba(34,211,238,0.4)]' : 'bg-header text-accent border-accent/60 hover:border-accent hover:shadow-[0_0_12px_rgba(34,211,238,0.3)]'} ${isAtHome ? 'animate-pulse-slow' : ''} ${flashDocks ? 'animate-flash-gold' : ''}`}>
          <svg className={`w-6 h-6 ${isDragging || dockedPostId ? 'fill-header' : 'fill-accent'}`} viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" /></svg>
        </div>
        {isDragging && (
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] text-muted whitespace-nowrap font-mono">
            drop to dock
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes pulse-slow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.3); }
          50% { box-shadow: 0 0 0 8px rgba(34, 211, 238, 0); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }
        @keyframes flash-gold {
          0% { box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.7), 0 0 16px rgba(245, 158, 11, 0.4); border-color: #f59e0b; }
          100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0), 0 0 0 rgba(245, 158, 11, 0); }
        }
        .animate-flash-gold {
          animation: flash-gold 0.6s ease-out forwards;
        }
        @keyframes dock-pulse {
          0%, 85%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); border-color: inherit; }
          90% { box-shadow: 0 0 6px 1px rgba(245, 158, 11, 0.3); border-color: rgba(245, 158, 11, 0.5); }
        }
        .animate-dock-pulse {
          animation: dock-pulse 4s ease-in-out infinite;
        }
      `}</style>
    </>
  )
}

// Context for glow state
interface GlowState {
  nearestDrop: string | null
  isDragging: boolean
}

export const DockstarGlowContext = createContext<GlowState>({
  nearestDrop: null,
  isDragging: false,
})

export function useDropZoneGlow(id: string) {
  const { nearestDrop, isDragging } = useContext(DockstarGlowContext)
  return isDragging && nearestDrop === id
}

// Drop circle for posts
interface DropCircleProps {
  id: string
  isActive: boolean
  isDocked: boolean
  userInitial?: string
  registerRef: (id: string, el: HTMLElement | null) => void
  onClick?: () => void
  onDragUndock?: (x: number, y: number) => void
  flashDocks?: boolean
  faded?: boolean
  glowDrag?: boolean
  dockedPlayers?: { id: string; color: string }[]
}

export function DropCircle({ id, isActive, isDocked, userInitial, registerRef, onClick, onDragUndock, flashDocks, faded, glowDrag, dockedPlayers }: DropCircleProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    registerRef(id, ref.current)
    return () => registerRef(id, null)
  }, [id, registerRef])

  return (
    <div className="relative shrink-0">
      <div
        ref={ref}
        data-dockpoint
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); (document.activeElement as HTMLElement)?.blur(); if (onClick) onClick() }}
        onPointerDown={isDocked && onDragUndock ? (e) => {
          e.preventDefault()
          e.stopPropagation()
          ;(document.activeElement as HTMLElement)?.blur()
          onDragUndock(e.clientX, e.clientY)
        } : undefined}
        className={`rounded-full border-2 flex items-center justify-center select-none touch-none transition-all duration-200 ${isDocked ? (faded ? 'w-10 h-10 bg-accent/30 border-accent/40 text-header/50 cursor-pointer' : 'w-10 h-10 bg-accent border-accent text-header shadow-[0_0_12px_rgba(34,211,238,0.4)] cursor-pointer') : isActive ? 'w-7 h-7 border-accent bg-accent/20 scale-110 shadow-[0_0_12px_rgba(34,211,238,0.4)] cursor-none' : glowDrag ? 'w-7 h-7 border-[#f59e0b]/60 bg-[#f59e0b]/10 shadow-[0_0_8px_rgba(245,158,11,0.3)] cursor-none' : 'w-7 h-7 border-accent/50 bg-accent/5 hover:border-accent hover:bg-accent/10 cursor-none'} ${flashDocks ? 'animate-flash-gold' : ''}`}
      >
        {isDocked ? (
          <svg className={`w-5 h-5 ${faded ? 'fill-header/50' : 'fill-header'}`} viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" /></svg>
        ) : (
          <svg className={`w-3.5 h-3.5 transition-colors ${flashDocks || glowDrag ? 'fill-[#f59e0b]' : isActive ? 'fill-accent' : 'fill-accent/40'}`} viewBox="0 0 24 24">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
          </svg>
        )}
      </div>
      {/* Player presence dots */}
      {dockedPlayers && dockedPlayers.length > 0 && (
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-px">
          {dockedPlayers.slice(0, 5).map(p => (
            <div key={p.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
          ))}
        </div>
      )}
    </div>
  )
}

// Nav drop circle for bottom bar
interface NavDropCircleProps {
  id: string
  label: string
  icon: React.ReactNode
  isActive: boolean
  registerRef: (id: string, el: HTMLElement | null) => void
  onClick?: () => void
  glowDrag?: boolean
}

export function NavDropCircle({ id, label, icon, isActive, registerRef, onClick, glowDrag }: NavDropCircleProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    registerRef(id, ref.current)
    return () => registerRef(id, null)
  }, [id, registerRef])

  return (
    <div ref={ref} onClick={onClick} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all duration-200 ${onClick ? 'cursor-pointer' : ''} ${isActive ? 'bg-accent/15 scale-105 shadow-[0_0_16px_rgba(34,211,238,0.3)]' : glowDrag ? 'bg-[#f59e0b]/10 shadow-[0_0_8px_rgba(245,158,11,0.3)]' : 'bg-surface/50'}`}>
      <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${isActive ? 'border-accent bg-accent/20 text-accent' : glowDrag ? 'border-[#f59e0b]/60 bg-[#f59e0b]/10 text-[#f59e0b]' : 'border-border text-muted-light'}`}>
        {icon}
      </div>
      <span className={`text-[10px] font-mono ${isActive ? 'text-accent' : glowDrag ? 'text-[#f59e0b]' : 'text-muted-light'}`}>
        {label}
      </span>
    </div>
  )
}
