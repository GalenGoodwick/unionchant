// ── PIXEL UNIVERSE WORLD DATA ──
// Hardcoded mock data for the spatial UI mockup

export interface WorldPosition {
  x: number
  y: number
}

export type SectionId = 'chants' | 'podiums' | 'groups' | 'how'

export interface Section {
  id: SectionId
  label: string
  description: string
  position: WorldPosition
  count: number
}

export interface MockPlayer {
  id: string
  name: string
  position: WorldPosition
  color: string
}

// Section positions in world space (CSS pixels from origin)
export const SECTIONS: Section[] = [
  {
    id: 'chants',
    label: 'CHANTS',
    description: 'Collective decisions',
    position: { x: 0, y: 0 },
    count: 8,
  },
  {
    id: 'podiums',
    label: 'PODIUMS',
    description: 'Long-form writing',
    position: { x: 600, y: -300 },
    count: 3,
  },
  {
    id: 'groups',
    label: 'GROUPS',
    description: 'Communities',
    position: { x: -500, y: -200 },
    count: 5,
  },
  {
    id: 'how',
    label: 'HOW IT WORKS',
    description: 'Learn the system',
    position: { x: 400, y: 400 },
    count: 0,
  },
]

// Mock other players visible in the universe
export const MOCK_PLAYERS: MockPlayer[] = [
  { id: 'p1', name: 'citizen_pdx', position: { x: 120, y: -80 }, color: '#34d399' },
  { id: 'p2', name: 'urbanplanner', position: { x: -200, y: 180 }, color: '#a78bfa' },
  { id: 'p3', name: 'safety_first', position: { x: 350, y: 120 }, color: '#f97316' },
  { id: 'p4', name: 'garden_collective', position: { x: -100, y: -350 }, color: '#fbbf24' },
  { id: 'p5', name: 'transit_fan', position: { x: 500, y: -100 }, color: '#f472b6' },
]

// Pixel grid config
export const GRID_SIZE = 64
export const CELL_PX = 4
export const TILE_SIZE = GRID_SIZE * CELL_PX // 256px per tile

// Generate pixel grid colors (adapted from pixel-animation-model)
export function generatePixelColors(): number[][] {
  const colors: number[][] = []

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      let r: number, g: number, b: number

      // Sky gradient (top 40%) — dark blues matching app theme
      if (y < GRID_SIZE * 0.4) {
        const t = y / (GRID_SIZE * 0.4)
        r = Math.floor(2 + t * 10)   // #020617 → darker
        g = Math.floor(6 + t * 15)
        b = Math.floor(23 + t * 30)
      }
      // Ground (bottom 60%) — dark surface tones
      else {
        const t = (y - GRID_SIZE * 0.4) / (GRID_SIZE * 0.6)
        r = Math.floor(15 + t * 15 + Math.sin(x * 0.3) * 8)
        g = Math.floor(20 + t * 20 + Math.cos(x * 0.5 + y * 0.2) * 10)
        b = Math.floor(30 + t * 15)
      }

      // Noise overlay
      const noise = (Math.sin(x * 7.3 + y * 13.7) * 0.5 + 0.5) * 12 - 6
      r = Math.max(0, Math.min(255, r + noise))
      g = Math.max(0, Math.min(255, g + noise))
      b = Math.max(0, Math.min(255, b + noise))

      // Sparse accent pixels (~1% chance)
      if (Math.sin(x * 17.1 + y * 23.3) > 0.97) {
        r = 34; g = 211; b = 238 // accent cyan #22d3ee
      }

      colors.push([r, g, b])
    }
  }

  return colors
}
