'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

export interface PresencePlayer {
  id: string
  name: string
  color: string
  rx?: number  // ratio x position (0-1) within instance
  ry?: number  // ratio y position (0-1) within instance
}

export interface PlayerTransition {
  playerId: string
  playerColor: string
  playerName: string
  from: string
  to: string
  timestamp: number
}

interface UsePresenceOptions {
  userId: string
  name: string
  color: string
  currentInstance: string
}

interface UsePresenceReturn {
  /** Players in each instance: instanceId -> PresencePlayer[] */
  players: Map<string, PresencePlayer[]>
  /** Whether connected to presence server */
  connected: boolean
  /** Recent transitions (for animation) */
  transitions: PlayerTransition[]
  /** Move self pixel to a ratio position within current instance */
  moveToPosition: (rx: number, ry: number) => void
}

const PRESENCE_URL = process.env.NEXT_PUBLIC_PRESENCE_URL || 'http://localhost:8080'

export function usePresence({ userId, name, color, currentInstance }: UsePresenceOptions): UsePresenceReturn {
  const [players, setPlayers] = useState<Map<string, PresencePlayer[]>>(new Map())
  const [connected, setConnected] = useState(false)
  const [transitions, setTransitions] = useState<PlayerTransition[]>([])
  const socketRef = useRef<Socket | null>(null)
  const instanceRef = useRef(currentInstance)

  // Connect once
  useEffect(() => {
    const socket = io(PRESENCE_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('auth', { userId, name, color })
      socket.emit('join-instance', { instance: instanceRef.current })
    })

    socket.on('disconnect', () => setConnected(false))

    // Full state for an instance
    socket.on('instance-state', ({ instance, players: roomPlayers }: { instance: string; players: PresencePlayer[] }) => {
      setPlayers(prev => {
        const next = new Map(prev)
        next.set(instance, roomPlayers)
        return next
      })
    })

    // Single player joined an instance
    socket.on('player-joined', ({ player, instance }: { player: PresencePlayer; instance: string }) => {
      setPlayers(prev => {
        const next = new Map(prev)
        const current = next.get(instance) || []
        if (!current.find(p => p.id === player.id)) {
          next.set(instance, [...current, player])
        }
        return next
      })
    })

    // Player left an instance
    socket.on('player-left', ({ playerId, instance }: { playerId: string; instance: string }) => {
      setPlayers(prev => {
        const next = new Map(prev)
        const current = next.get(instance) || []
        next.set(instance, current.filter(p => p.id !== playerId))
        return next
      })
    })

    // Player moved within an instance
    socket.on('player-moved', ({ playerId, instance, rx, ry }: { playerId: string; instance?: string; rx: number; ry: number }) => {
      setPlayers(prev => {
        const next = new Map(prev)
        if (instance) {
          // Direct update when instance is known
          const list = next.get(instance)
          if (list) {
            const idx = list.findIndex(p => p.id === playerId)
            if (idx !== -1) {
              const updated = [...list]
              updated[idx] = { ...updated[idx], rx, ry }
              next.set(instance, updated)
            }
          }
        } else {
          // Fallback: search all instances
          for (const [inst, list] of next.entries()) {
            const idx = list.findIndex(p => p.id === playerId)
            if (idx !== -1) {
              const updated = [...list]
              updated[idx] = { ...updated[idx], rx, ry }
              next.set(inst, updated)
              break
            }
          }
        }
        return next
      })
    })

    // Player transitioned between instances (for animation)
    socket.on('player-transition', (data: Omit<PlayerTransition, 'timestamp'>) => {
      const transition = { ...data, timestamp: Date.now() }
      setTransitions(prev => [...prev, transition])
      setTimeout(() => {
        setTransitions(prev => prev.filter(t => t !== transition))
      }, 500)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [userId, name, color])

  // Emit join-instance when currentInstance changes + clear stale self from old instance
  useEffect(() => {
    const prevInstance = instanceRef.current
    instanceRef.current = currentInstance
    const socket = socketRef.current
    if (socket?.connected) {
      socket.emit('join-instance', { instance: currentInstance })
    }
    // Clear self from previous instance in local state (server only broadcasts to others)
    if (prevInstance && prevInstance !== currentInstance) {
      setPlayers(prev => {
        const next = new Map(prev)
        const oldList = next.get(prevInstance)
        if (oldList) {
          next.set(prevInstance, oldList.filter(p => p.id !== userId))
        }
        return next
      })
    }
  }, [currentInstance, userId])

  // Move self pixel position — throttled to avoid flooding the socket
  const lastEmitRef = useRef(0)
  const pendingRef = useRef<{ rx: number; ry: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const moveToPosition = useCallback((rx: number, ry: number) => {
    const socket = socketRef.current
    if (!socket?.connected) return
    const now = Date.now()
    const emit = () => {
      lastEmitRef.current = Date.now()
      pendingRef.current = null
      socket.emit('position', { rx, ry })
    }
    if (now - lastEmitRef.current >= 50) {
      emit()
    } else {
      pendingRef.current = { rx, ry }
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null
          if (pendingRef.current) {
            const { rx: prx, ry: pry } = pendingRef.current
            lastEmitRef.current = Date.now()
            pendingRef.current = null
            socket.emit('position', { rx: prx, ry: pry })
          }
        }, 50 - (now - lastEmitRef.current))
      }
    }
  }, [])

  // Poll /instances for global presence (shows other users on feed DockPorts)
  const [globalPlayers, setGlobalPlayers] = useState<Map<string, PresencePlayer[]>>(new Map())

  useEffect(() => {
    let mounted = true
    const poll = () => {
      fetch(`${PRESENCE_URL}/instances`)
        .then(r => r.json())
        .then((data: Record<string, { id: string; name: string; color: string }[]>) => {
          if (!mounted) return
          const map = new Map<string, PresencePlayer[]>()
          for (const [instanceId, plist] of Object.entries(data)) {
            map.set(instanceId, plist.filter(p => p.id !== userId))
          }
          setGlobalPlayers(map)
        })
        .catch(() => {})
    }
    poll()
    const timer = setInterval(poll, 5_000) // poll every 5s
    return () => { mounted = false; clearInterval(timer) }
  }, [userId])

  // Merge socket-based players with global poll data
  const mergedPlayers = new Map(globalPlayers)
  for (const [inst, plist] of players.entries()) {
    mergedPlayers.set(inst, plist) // socket data is fresher, overrides poll
  }

  return { players: mergedPlayers, connected, transitions, moveToPosition }
}
