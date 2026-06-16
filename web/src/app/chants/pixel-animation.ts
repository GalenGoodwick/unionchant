// Shared fairy jitter animation for player pixels
// Used by InstancePixelCanvas (per-instance embedded canvas)
// Positions are ratio-based (0-1) so pixels map to any canvas dimension

export const PX = 4
export const SELF_PX = 6

// Fairy animation: block jitters within a frame
// Block visits all 4 quadrants in sequence
const FAIRY_OFFSETS = [
  { dx: 0, dy: 0 },     // bottom-left (home)
  { dx: PX, dy: 0 },    // bottom-right
  { dx: PX, dy: -PX },  // top-right
  { dx: 0, dy: -PX },   // top-left
]

export function getFairyOffset(frameCount: number, playerIndex: number) {
  const phase = (frameCount + playerIndex * 7) % FAIRY_OFFSETS.length
  return FAIRY_OFFSETS[phase]
}

export interface PixelPlayer {
  id: string
  name: string
  color: string
  isSelf?: boolean
  rx?: number  // explicit ratio position (0-1), overrides hash
  ry?: number
}

// Stable hash from player ID -> ratio position (0-1)
function hashToRatio(id: string): { rx: number; ry: number } {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0
  }
  // Two independent ratios from different bit ranges
  const rx = ((h & 0xFFFF) / 0xFFFF) * 0.8 + 0.1     // 0.1 to 0.9 (padded from edges)
  const ry = (((h >>> 16) & 0xFFFF) / 0xFFFF) * 0.6 + 0.2 // 0.2 to 0.8
  return { rx, ry }
}

export function renderPlayers(
  ctx: CanvasRenderingContext2D,
  players: PixelPlayer[],
  frameCount: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)
  ctx.imageSmoothingEnabled = false

  const maxVisible = 30
  const visible = players.slice(0, maxVisible)

  for (let i = 0; i < visible.length; i++) {
    const p = visible[i]
    const offset = getFairyOffset(frameCount, i)
    const size = p.isSelf ? SELF_PX : PX
    const { rx, ry } = (p.rx != null && p.ry != null) ? { rx: p.rx, ry: p.ry } : hashToRatio(p.id)
    const x = rx * canvasWidth - size / 2
    const y = ry * canvasHeight - size / 2

    ctx.fillStyle = p.color
    ctx.fillRect(
      Math.floor(x + offset.dx),
      Math.floor(y + offset.dy),
      size, size
    )
  }

  // Overflow indicator
  if (players.length > maxVisible) {
    ctx.fillStyle = '#64748b'
    ctx.font = '9px monospace'
    ctx.fillText(`+${players.length - maxVisible}`, canvasWidth - 24, canvasHeight / 2 + 3)
  }
}

// Get a player's ratio position (for transition overlay to compute screen coords)
export function getPlayerRatio(playerId: string): { rx: number; ry: number } {
  return hashToRatio(playerId)
}
