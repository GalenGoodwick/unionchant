// ── CONE OF SIGHT — logarithmic magnification of ports in movement direction ──

import { useMemo } from 'react'
import type { Port } from './port-data'

export interface PortMagnification {
  portId: string
  magnification: number   // 1.0 = base size, up to ~3.0
  glowIntensity: number   // 0.0 to 1.0 (proximity-based)
  distance: number        // world-space distance to player
}

interface ConeParams {
  halfAngle?: number      // radians, default π/4 (45°)
  maxMag?: number         // maximum magnification, default 3.0
  k?: number              // log curve steepness, default 4.0
  maxGlowDist?: number    // distance at which glow starts, default 300
  snapDist?: number       // distance for dock snap, default 20
  minSpeed?: number       // minimum speed to activate cone, default 20 px/sec
  maxSpeed?: number       // speed at which cone is fully active, default 200 px/sec
}

const DEFAULTS: Required<ConeParams> = {
  halfAngle: Math.PI / 4,
  maxMag: 3.0,
  k: 4.0,
  maxGlowDist: 300,
  snapDist: 20,
  minSpeed: 20,
  maxSpeed: 200,
}

// Compute magnification and glow for all ports
export function computePortMagnifications(
  ports: Port[],
  playerX: number,
  playerY: number,
  moveDirection: { x: number; y: number } | null,
  moveSpeed: number,
  params: ConeParams = {},
): PortMagnification[] {
  const p = { ...DEFAULTS, ...params }

  return ports.map(port => {
    const dx = port.worldX - playerX
    const dy = port.worldY - playerY
    const distance = Math.hypot(dx, dy)

    // Proximity glow: 0 at maxGlowDist, 1 at overlap
    const glowIntensity = Math.max(0, 1 - distance / p.maxGlowDist)

    // No movement direction or too slow → no magnification
    if (!moveDirection || moveSpeed < p.minSpeed || distance < 1) {
      return { portId: port.id, magnification: 1.0, glowIntensity, distance }
    }

    // Normalize direction to port
    const toPortX = dx / distance
    const toPortY = dy / distance

    // Dot product = cos(angle between movement and port direction)
    const dot = moveDirection.x * toPortX + moveDirection.y * toPortY

    // Port is behind movement direction
    if (dot <= 0) {
      return { portId: port.id, magnification: 1.0, glowIntensity, distance }
    }

    // Compute angle
    const angle = Math.acos(Math.min(1, Math.max(-1, dot)))

    // Outside cone
    if (angle > p.halfAngle) {
      return { portId: port.id, magnification: 1.0, glowIntensity, distance }
    }

    // Alignment factor: 1.0 at dead center, 0.0 at cone edge
    const alignmentFactor = 1.0 - (angle / p.halfAngle)

    // Logarithmic magnification curve
    // log(1 + alignment * k) / log(1 + k) maps [0,1] → [0,1] through log curve
    const logFactor = Math.log(1 + alignmentFactor * p.k) / Math.log(1 + p.k)
    const rawMag = 1.0 + logFactor * (p.maxMag - 1.0)

    // Scale by movement speed (faster = stronger effect)
    const speedFactor = Math.min(1, moveSpeed / p.maxSpeed)
    const magnification = 1.0 + (rawMag - 1.0) * speedFactor

    return { portId: port.id, magnification, glowIntensity, distance }
  })
}

// Hook wrapper — memoizes result when inputs haven't changed significantly
export function useConeOfSight(
  ports: Port[],
  playerX: number,
  playerY: number,
  moveDirection: { x: number; y: number } | null,
  moveSpeed: number,
  params?: ConeParams,
): PortMagnification[] {
  return useMemo(
    () => computePortMagnifications(ports, playerX, playerY, moveDirection, moveSpeed, params),
    [ports, playerX, playerY, moveDirection?.x, moveDirection?.y, moveSpeed, params]
  )
}

// Check if any port is close enough to snap-dock
export function findSnapPort(
  magnifications: PortMagnification[],
  snapDist: number = DEFAULTS.snapDist,
): string | null {
  for (const m of magnifications) {
    if (m.distance <= snapDist) return m.portId
  }
  return null
}
