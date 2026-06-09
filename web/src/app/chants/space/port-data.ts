// ── PORT DATA — dock targets in pixel space ──

export interface Port {
  id: string
  label: string
  worldX: number
  worldY: number
  baseSize: number  // base pixel dimensions for the star pattern
  color: [number, number, number]  // RGB
  objId: number     // unique object ID for shader hover/glow
  type: 'chant' | 'nav' | 'set' | 'create'
  phase?: string
  description?: string
}

export interface SetPort {
  id: string
  name: string       // 20 char max
  worldX: number
  worldY: number
  creator: string
  memberCount: number
}

// Object ID ranges
export const PORT_OBJ_BASE = 50
export const HISTORY_OBJ_BASE = 200

// Mock ports — positions spread around origin
export const MOCK_PORTS: Port[] = [
  // Chant ports (matching MOCK_CHANTS ids)
  { id: '1', label: 'INFRASTRUCTURE', worldX: 80, worldY: -60, baseSize: 12, color: [234, 179, 8], objId: PORT_OBJ_BASE, type: 'chant', phase: 'VOTING', description: '$50M bond' },
  { id: '2', label: 'ZONING', worldX: -120, worldY: 90, baseSize: 10, color: [34, 211, 238], objId: PORT_OBJ_BASE + 1, type: 'chant', phase: 'SUBMISSION', description: 'Housing reform' },
  { id: '4', label: 'PARKS', worldX: 200, worldY: 150, baseSize: 10, color: [52, 211, 153], objId: PORT_OBJ_BASE + 2, type: 'chant', phase: 'COMPLETED', description: 'Maintenance priority' },
  { id: '5', label: 'LUNCH', worldX: -200, worldY: -150, baseSize: 9, color: [167, 139, 250], objId: PORT_OBJ_BASE + 3, type: 'chant', phase: 'SUBMISSION', description: 'School lunch' },
  { id: '7', label: 'SUSTAINABILITY', worldX: 300, worldY: -200, baseSize: 10, color: [167, 139, 250], objId: PORT_OBJ_BASE + 4, type: 'chant', phase: 'ACCUMULATING', description: '$2M fund' },

  // Nav ports — further out
  { id: '__nav_podiums__', label: 'PODIUMS', worldX: -350, worldY: -300, baseSize: 11, color: [148, 163, 184], objId: PORT_OBJ_BASE + 5, type: 'nav' },
  { id: '__nav_groups__', label: 'GROUPS', worldX: -400, worldY: 200, baseSize: 11, color: [148, 163, 184], objId: PORT_OBJ_BASE + 6, type: 'nav' },
  { id: '__nav_how__', label: 'HOW', worldX: 400, worldY: 300, baseSize: 11, color: [148, 163, 184], objId: PORT_OBJ_BASE + 7, type: 'nav' },

  // Create port
  { id: '__create_chant__', label: 'CREATE', worldX: 0, worldY: 250, baseSize: 10, color: [34, 211, 238], objId: PORT_OBJ_BASE + 8, type: 'create' },
]

// Mock sets — named discussion spaces
export const MOCK_SETS: SetPort[] = [
  { id: 'set-1', name: 'transit riders', worldX: -80, worldY: -280, creator: 'citizen_pdx', memberCount: 23 },
  { id: 'set-2', name: 'east portland', worldX: 250, worldY: 50, creator: 'urbanplanner', memberCount: 41 },
  { id: 'set-3', name: 'school parents', worldX: -300, worldY: 100, creator: 'parent_of_3', memberCount: 17 },
  { id: 'set-4', name: 'climate action', worldX: 150, worldY: -300, creator: 'green_future', memberCount: 34 },
]

// Convert sets to ports
export function setsToPort(sets: SetPort[]): Port[] {
  return sets.map((s, i) => ({
    id: s.id,
    label: s.name.toUpperCase(),
    worldX: s.worldX,
    worldY: s.worldY,
    baseSize: 8,
    color: [96, 165, 250] as [number, number, number], // blue
    objId: PORT_OBJ_BASE + 20 + i,
    type: 'set' as const,
    description: `${s.memberCount} members`,
  }))
}

// Get all ports including sets
export function getAllPorts(sets: SetPort[] = MOCK_SETS): Port[] {
  return [...MOCK_PORTS, ...setsToPort(sets)]
}
