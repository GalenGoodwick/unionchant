// ── IDEA SUBSPACE — persistent community data per idea ──

export interface SubspaceMember {
  id: string
  name: string
  color: string
  joinedAt: string       // "Tier 1", "Tier 3"
  role: 'founder' | 'early' | 'member'
}

export interface SubspaceMessage {
  id: string
  author: string
  authorColor: string
  text: string
  time: string
  isPortal?: string      // target idea ID if this message is a portal link
}

export interface SubspacePortal {
  targetIdeaId: string
  targetIdeaText: string
  createdBy: string
}

export interface IdeaSubspace {
  ideaId: string
  ideaText: string
  ideaAuthor: string
  chantQuestion: string
  currentTier: number
  highestTier: number
  xpAccumulated: number
  members: SubspaceMember[]
  messages: SubspaceMessage[]
  portals: SubspacePortal[]
}

// ── MOCK SUBSPACES ──

export const MOCK_SUBSPACES: Record<string, IdeaSubspace> = {
  // ── VOTING chant ideas (Tier 3, growing communities) ──

  i1: {
    ideaId: 'i1',
    ideaText: 'Seismic retrofit of public schools and emergency shelters',
    ideaAuthor: 'safety_first',
    chantQuestion: 'What should Portland allocate its $50M infrastructure bond to?',
    currentTier: 3,
    highestTier: 3,
    xpAccumulated: 284,
    members: [
      { id: 'u1', name: 'safety_first', color: '#f97316', joinedAt: 'Tier 1', role: 'founder' },
      { id: 'u2', name: 'citizen_pdx', color: '#34d399', joinedAt: 'Tier 1', role: 'early' },
      { id: 'u3', name: 'parent_of_3', color: '#a78bfa', joinedAt: 'Tier 2', role: 'member' },
      { id: 'u4', name: 'engineer42', color: '#38bdf8', joinedAt: 'Tier 2', role: 'member' },
      { id: 'u5', name: 'ne_resident', color: '#fbbf24', joinedAt: 'Tier 3', role: 'member' },
    ],
    messages: [
      { id: 'm1', author: 'safety_first', authorColor: '#f97316', text: 'I work in structural engineering. The 1925-era schools have unreinforced masonry walls that will collapse in a Cascadia event. This isnt hypothetical.', time: '8d ago' },
      { id: 'm2', author: 'citizen_pdx', authorColor: '#34d399', text: 'Schools built before 1970 are the biggest risk. This directly saves lives.', time: '8d ago' },
      { id: 'm3', author: 'parent_of_3', authorColor: '#a78bfa', text: 'My kids go to Buckman Elementary. The building is from 1925. I lose sleep over this.', time: '6d ago' },
      { id: 'm4', author: 'engineer42', authorColor: '#38bdf8', text: 'The cost-benefit analysis strongly favors this. Every $1 in seismic retrofit saves $4 in expected losses.', time: '5d ago' },
      { id: 'm5', author: 'ne_resident', authorColor: '#fbbf24', text: 'What about the emergency shelters? Some of those are in worse shape than the schools.', time: '3d ago' },
      { id: 'm6', author: 'safety_first', authorColor: '#f97316', text: 'Good point. The Red Cross assessed 8 shelters as non-functional after a 6.0+ quake. Adding them to scope.', time: '3d ago' },
      { id: 'm7', author: 'citizen_pdx', authorColor: '#34d399', text: 'Has anyone looked at the water main issue too? Related infrastructure.', time: '2d ago', isPortal: 'i4' },
    ],
    portals: [
      { targetIdeaId: 'i4', targetIdeaText: 'Upgrade aging water mains to prevent lead contamination', createdBy: 'citizen_pdx' },
    ],
  },

  i2: {
    ideaId: 'i2',
    ideaText: 'Repair and expand the stormwater drainage system in East Portland',
    ideaAuthor: 'waterworks_pdx',
    chantQuestion: 'What should Portland allocate its $50M infrastructure bond to?',
    currentTier: 3,
    highestTier: 3,
    xpAccumulated: 201,
    members: [
      { id: 'u6', name: 'waterworks_pdx', color: '#6366f1', joinedAt: 'Tier 1', role: 'founder' },
      { id: 'u7', name: 'flood_victim', color: '#ef4444', joinedAt: 'Tier 1', role: 'early' },
      { id: 'u8', name: 'engineer42', color: '#38bdf8', joinedAt: 'Tier 2', role: 'member' },
    ],
    messages: [
      { id: 'm10', author: 'waterworks_pdx', authorColor: '#6366f1', text: 'Division St floods every single winter. The drainage system was designed for half the current runoff volume.', time: '8d ago' },
      { id: 'm11', author: 'flood_victim', authorColor: '#ef4444', text: 'My basement flooded twice last year. Insurance wont cover it anymore.', time: '7d ago' },
      { id: 'm12', author: 'engineer42', authorColor: '#38bdf8', text: 'The current system is 60 years old. Patching it costs more than replacing.', time: '5d ago' },
      { id: 'm13', author: 'waterworks_pdx', authorColor: '#6366f1', text: 'Bioswales + pipe upsizing would handle 100-year storms. $18M covers East Portland.', time: '3d ago' },
    ],
    portals: [],
  },

  i3: {
    ideaId: 'i3',
    ideaText: 'Build protected bike lane network connecting all neighborhoods',
    ideaAuthor: 'bike_commuter',
    chantQuestion: 'What should Portland allocate its $50M infrastructure bond to?',
    currentTier: 3,
    highestTier: 3,
    xpAccumulated: 156,
    members: [
      { id: 'u9', name: 'bike_commuter', color: '#38bdf8', joinedAt: 'Tier 1', role: 'founder' },
      { id: 'u10', name: 'daily_rider', color: '#22d3ee', joinedAt: 'Tier 1', role: 'early' },
    ],
    messages: [
      { id: 'm20', author: 'bike_commuter', authorColor: '#38bdf8', text: 'Hawthorne to downtown is terrifying. Protected lanes save lives.', time: '7d ago' },
      { id: 'm21', author: 'daily_rider', authorColor: '#22d3ee', text: 'Amsterdam built their network in 10 years. We can do key corridors in 2.', time: '5d ago' },
      { id: 'm22', author: 'bike_commuter', authorColor: '#38bdf8', text: 'Priority routes: Hawthorne, Division, Williams, Sandy. 4 corridors = $12M.', time: '3d ago' },
    ],
    portals: [],
  },

  i4: {
    ideaId: 'i4',
    ideaText: 'Upgrade aging water mains to prevent lead contamination',
    ideaAuthor: 'clean_water',
    chantQuestion: 'What should Portland allocate its $50M infrastructure bond to?',
    currentTier: 3,
    highestTier: 3,
    xpAccumulated: 237,
    members: [
      { id: 'u11', name: 'clean_water', color: '#0ea5e9', joinedAt: 'Tier 1', role: 'founder' },
      { id: 'u12', name: 'health_dept', color: '#10b981', joinedAt: 'Tier 1', role: 'early' },
      { id: 'u13', name: 'parent_of_3', color: '#a78bfa', joinedAt: 'Tier 2', role: 'member' },
      { id: 'u14', name: 'ne_resident', color: '#fbbf24', joinedAt: 'Tier 3', role: 'member' },
    ],
    messages: [
      { id: 'm30', author: 'clean_water', authorColor: '#0ea5e9', text: 'Lead pipe inventory shows 12,000 service lines need replacement. Kids are being poisoned.', time: '8d ago' },
      { id: 'm31', author: 'health_dept', authorColor: '#10b981', text: 'Blood lead levels in East Portland children are 2x the city average. This is a health emergency.', time: '7d ago' },
      { id: 'm32', author: 'parent_of_3', authorColor: '#a78bfa', text: 'We had lead in our water last year. My daughter was tested. This is urgent.', time: '5d ago' },
      { id: 'm33', author: 'clean_water', authorColor: '#0ea5e9', text: 'Federal Infrastructure Act covers 40% of lead pipe replacement. We need to match.', time: '4d ago' },
      { id: 'm34', author: 'ne_resident', authorColor: '#fbbf24', text: 'The seismic retrofit people have overlapping concerns — broken mains during earthquakes.', time: '2d ago', isPortal: 'i1' },
    ],
    portals: [
      { targetIdeaId: 'i1', targetIdeaText: 'Seismic retrofit of public schools and emergency shelters', createdBy: 'ne_resident' },
    ],
  },

  i5: {
    ideaId: 'i5',
    ideaText: 'Install solar panels on all city-owned buildings',
    ideaAuthor: 'green_future',
    chantQuestion: 'What should Portland allocate its $50M infrastructure bond to?',
    currentTier: 3,
    highestTier: 3,
    xpAccumulated: 98,
    members: [
      { id: 'u15', name: 'green_future', color: '#22c55e', joinedAt: 'Tier 1', role: 'founder' },
      { id: 'u16', name: 'budget_guy', color: '#94a3b8', joinedAt: 'Tier 2', role: 'member' },
    ],
    messages: [
      { id: 'm40', author: 'green_future', authorColor: '#22c55e', text: 'City Hall, community centers, fire stations — 47 buildings total. 12MW capacity.', time: '7d ago' },
      { id: 'm41', author: 'budget_guy', authorColor: '#94a3b8', text: 'ROI on municipal solar is 7-10 years. Long-term savings are real.', time: '5d ago' },
      { id: 'm42', author: 'green_future', authorColor: '#22c55e', text: 'Oregon has a 35% state tax credit for municipal solar installations.', time: '3d ago' },
    ],
    portals: [],
  },

  // ── COMPLETED chant ideas (richer data — mature communities) ──

  p1: {
    ideaId: 'p1',
    ideaText: 'Restore community gardens and convert unused lots to green space',
    ideaAuthor: 'garden_collective',
    chantQuestion: 'How should we prioritize park maintenance with the reduced budget?',
    currentTier: 4,
    highestTier: 4,
    xpAccumulated: 847,
    members: [
      { id: 'u20', name: 'garden_collective', color: '#fbbf24', joinedAt: 'Tier 1', role: 'founder' },
      { id: 'u21', name: 'parks_volunteer', color: '#34d399', joinedAt: 'Tier 1', role: 'early' },
      { id: 'u22', name: 'urban_farmer', color: '#22c55e', joinedAt: 'Tier 1', role: 'early' },
      { id: 'u23', name: 'ne_gardener', color: '#a78bfa', joinedAt: 'Tier 2', role: 'member' },
      { id: 'u24', name: 'soil_science', color: '#94a3b8', joinedAt: 'Tier 2', role: 'member' },
      { id: 'u25', name: 'neighborhood_assoc', color: '#f472b6', joinedAt: 'Tier 2', role: 'member' },
      { id: 'u26', name: 'food_bank_pdx', color: '#ef4444', joinedAt: 'Tier 3', role: 'member' },
      { id: 'u27', name: 'kids_garden_club', color: '#38bdf8', joinedAt: 'Tier 3', role: 'member' },
      { id: 'u28', name: 'water_district', color: '#6366f1', joinedAt: 'Tier 3', role: 'member' },
      { id: 'u29', name: 'compost_queen', color: '#f97316', joinedAt: 'Tier 4', role: 'member' },
      { id: 'u30', name: 'master_gardener', color: '#0ea5e9', joinedAt: 'Tier 4', role: 'member' },
      { id: 'u31', name: 'city_planner', color: '#fbbf24', joinedAt: 'Tier 4', role: 'member' },
    ],
    messages: [
      { id: 'g1', author: 'garden_collective', authorColor: '#fbbf24', text: 'The city identified 23 vacant lots in East Portland alone. Lets coordinate which ones to target first.', time: '18d ago' },
      { id: 'g2', author: 'parks_volunteer', authorColor: '#34d399', text: 'Lents Park community garden has a waitlist of 40 families. We need more plots.', time: '17d ago' },
      { id: 'g3', author: 'urban_farmer', authorColor: '#22c55e', text: 'Has anyone connected with the Bureau of Environmental Services? They have composting grants.', time: '16d ago' },
      { id: 'g4', author: 'ne_gardener', authorColor: '#a78bfa', text: 'Im organizing a seed swap at Woodstock Park next Saturday. All welcome.', time: '14d ago' },
      { id: 'g5', author: 'soil_science', authorColor: '#94a3b8', text: 'Soil testing on the Foster Rd lots came back clean. No contamination concerns.', time: '12d ago' },
      { id: 'g6', author: 'food_bank_pdx', authorColor: '#ef4444', text: 'We can distribute surplus produce through our network. 6 locations in East Portland.', time: '10d ago' },
      { id: 'g7', author: 'garden_collective', authorColor: '#fbbf24', text: 'The playground equipment people have similar goals — green infrastructure for families.', time: '9d ago', isPortal: 'p2' },
      { id: 'g8', author: 'kids_garden_club', authorColor: '#38bdf8', text: 'Our school garden program can partner. 12 schools already have raised beds.', time: '8d ago' },
      { id: 'g9', author: 'water_district', authorColor: '#6366f1', text: 'Rain gardens count as stormwater management. Double benefit = easier funding.', time: '7d ago' },
      { id: 'g10', author: 'compost_queen', authorColor: '#f97316', text: 'Portland Composts is donating 20 cubic yards for the first 3 lot conversions.', time: '5d ago' },
      { id: 'g11', author: 'master_gardener', authorColor: '#0ea5e9', text: 'I can lead volunteer training sessions. OSU Extension has the curriculum ready.', time: '4d ago' },
      { id: 'g12', author: 'city_planner', authorColor: '#fbbf24', text: 'Council approved the first 5 lots. Construction starts in March.', time: '2d ago' },
      { id: 'g13', author: 'neighborhood_assoc', authorColor: '#f472b6', text: 'We got 200 signatures for the Foster Rd lot. Community support is overwhelming.', time: '1d ago' },
      { id: 'g14', author: 'urban_farmer', authorColor: '#22c55e', text: 'The tree planting initiative has overlapping goals too.', time: '12h ago', isPortal: 'p3' },
      { id: 'g15', author: 'garden_collective', authorColor: '#fbbf24', text: 'Next community meeting is Thursday 6pm at the Woodstock library. Agenda posted.', time: '3h ago' },
    ],
    portals: [
      { targetIdeaId: 'p2', targetIdeaText: 'Fix playground equipment in underserved neighborhoods first', createdBy: 'garden_collective' },
      { targetIdeaId: 'p3', targetIdeaText: 'Plant 10,000 native trees for urban canopy', createdBy: 'urban_farmer' },
    ],
  },

  p2: {
    ideaId: 'p2',
    ideaText: 'Fix playground equipment in underserved neighborhoods first',
    ideaAuthor: 'equity_parks',
    chantQuestion: 'How should we prioritize park maintenance with the reduced budget?',
    currentTier: 4,
    highestTier: 4,
    xpAccumulated: 623,
    members: [
      { id: 'u32', name: 'equity_parks', color: '#f472b6', joinedAt: 'Tier 1', role: 'founder' },
      { id: 'u33', name: 'parent_coalition', color: '#a78bfa', joinedAt: 'Tier 1', role: 'early' },
      { id: 'u34', name: 'parks_board', color: '#94a3b8', joinedAt: 'Tier 2', role: 'member' },
      { id: 'u35', name: 'safety_inspector', color: '#ef4444', joinedAt: 'Tier 2', role: 'member' },
      { id: 'u36', name: 'ne_families', color: '#fbbf24', joinedAt: 'Tier 3', role: 'member' },
      { id: 'u37', name: 'ada_advocate', color: '#22c55e', joinedAt: 'Tier 3', role: 'member' },
      { id: 'u38', name: 'city_budget', color: '#6366f1', joinedAt: 'Tier 4', role: 'member' },
      { id: 'u39', name: 'volunteer_crew', color: '#38bdf8', joinedAt: 'Tier 4', role: 'member' },
    ],
    messages: [
      { id: 'h1', author: 'equity_parks', authorColor: '#f472b6', text: 'Mapped all playgrounds with safety violations — 14 in East Portland, 3 in St Johns.', time: '15d ago' },
      { id: 'h2', author: 'parent_coalition', authorColor: '#a78bfa', text: 'Lents Park swingset has been broken since September. Kids deserve better.', time: '14d ago' },
      { id: 'h3', author: 'safety_inspector', authorColor: '#ef4444', text: 'Some of these have exposed bolts and cracked platforms. Genuine injury risk.', time: '12d ago' },
      { id: 'h4', author: 'parks_board', authorColor: '#94a3b8', text: 'Budget memo going to council next Tuesday. Speak at public comment if you can.', time: '10d ago' },
      { id: 'h5', author: 'ne_families', authorColor: '#fbbf24', text: '47 families signed our petition. East Portland pays taxes too.', time: '8d ago' },
      { id: 'h6', author: 'ada_advocate', authorColor: '#22c55e', text: 'None of the East Portland playgrounds are ADA compliant. Zero wheelchair access.', time: '6d ago' },
      { id: 'h7', author: 'equity_parks', authorColor: '#f472b6', text: 'The community garden folks are aligned — green spaces for families.', time: '5d ago', isPortal: 'p1' },
      { id: 'h8', author: 'city_budget', authorColor: '#6366f1', text: '$2.1M covers all 17 sites. Thats 4.2% of the parks budget.', time: '4d ago' },
      { id: 'h9', author: 'volunteer_crew', authorColor: '#38bdf8', text: 'We can do basic repairs ourselves. Paint, minor hardware. Just need materials.', time: '2d ago' },
      { id: 'h10', author: 'parks_board', authorColor: '#94a3b8', text: 'Council approved emergency funds for the 5 worst sites. Work starts next week.', time: '1d ago' },
    ],
    portals: [
      { targetIdeaId: 'p1', targetIdeaText: 'Restore community gardens and convert unused lots to green space', createdBy: 'equity_parks' },
    ],
  },

  p3: {
    ideaId: 'p3',
    ideaText: 'Plant 10,000 native trees for urban canopy',
    ideaAuthor: 'tree_hugger',
    chantQuestion: 'How should we prioritize park maintenance with the reduced budget?',
    currentTier: 3,
    highestTier: 3,
    xpAccumulated: 412,
    members: [
      { id: 'u40', name: 'tree_hugger', color: '#22c55e', joinedAt: 'Tier 1', role: 'founder' },
      { id: 'u41', name: 'urban_forestry', color: '#34d399', joinedAt: 'Tier 1', role: 'early' },
      { id: 'u42', name: 'climate_action', color: '#0ea5e9', joinedAt: 'Tier 2', role: 'member' },
      { id: 'u43', name: 'arborist_jane', color: '#a78bfa', joinedAt: 'Tier 2', role: 'member' },
      { id: 'u44', name: 'heat_island', color: '#ef4444', joinedAt: 'Tier 3', role: 'member' },
    ],
    messages: [
      { id: 't1', author: 'tree_hugger', authorColor: '#22c55e', text: 'Friends of Trees has capacity for 3,000 plantings this season. Who else can help scale?', time: '12d ago' },
      { id: 't2', author: 'urban_forestry', authorColor: '#34d399', text: 'Priority zones: areas with less than 15% canopy coverage. See the city heat map.', time: '10d ago' },
      { id: 't3', author: 'climate_action', authorColor: '#0ea5e9', text: 'Native species only. Douglas fir, Oregon white oak, Pacific dogwood. No ornamentals.', time: '8d ago' },
      { id: 't4', author: 'arborist_jane', authorColor: '#a78bfa', text: 'Root zone planning matters. Half the street trees die from compacted soil.', time: '6d ago' },
      { id: 't5', author: 'heat_island', authorColor: '#ef4444', text: 'East Portland surface temps hit 128F during the 2021 heat dome. Trees save lives.', time: '4d ago' },
      { id: 't6', author: 'tree_hugger', authorColor: '#22c55e', text: 'The community garden folks want trees too — fruit and nut trees for food forests.', time: '3d ago', isPortal: 'p1' },
      { id: 't7', author: 'urban_forestry', authorColor: '#34d399', text: 'Grant application submitted to USDA Urban & Community Forestry. $400K match.', time: '1d ago' },
    ],
    portals: [
      { targetIdeaId: 'p1', targetIdeaText: 'Restore community gardens and convert unused lots to green space', createdBy: 'tree_hugger' },
    ],
  },
}

// Helper to get a subspace by idea ID
export function getSubspace(ideaId: string): IdeaSubspace | null {
  return MOCK_SUBSPACES[ideaId] || null
}

// Get all subspace IDs
export function getAllSubspaceIds(): string[] {
  return Object.keys(MOCK_SUBSPACES)
}
