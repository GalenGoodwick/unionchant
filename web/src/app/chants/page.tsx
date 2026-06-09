'use client'

import { useState, useRef, useCallback, useEffect, Suspense } from 'react'
import Dockstar, { DropCircle, NavDropCircle, DockstarGlowContext } from './Dockstar'
import PlayerOverlay from './PlayerOverlay'
import type { PlayerPixel } from './PlayerOverlay'
import IdeaSubspace from './IdeaSubspace'
import BookmarkSidebar from './BookmarkSidebar'
import { getSubspace } from './subspace-data'

// ── MOCK PLAYERS — each has an instance + optional dockedTo for dock point presence ──
const MOCK_PLAYERS: PlayerPixel[] = [
  // Players browsing the list
  { id: 'p1', name: 'citizen_pdx', color: '#34d399', x: 280, y: 320, instance: 'list' },
  { id: 'p2', name: 'urbanplanner', color: '#a78bfa', x: 350, y: 580, instance: 'list', dockedTo: '2' },
  { id: 'p4', name: 'fiscal_hawk', color: '#f472b6', x: 200, y: 720, instance: 'list', dockedTo: '1' },
  // Players docked into specific posts (inside detail view)
  { id: 'p3', name: 'safety_first', color: '#f97316', x: 310, y: 450, instance: '1', dockedTo: 'idea:i1' },
  { id: 'p5', name: 'bike_commuter', color: '#38bdf8', x: 340, y: 500, instance: '1', dockedTo: 'idea:i4' },
]

// ── MOCK DATA ──

interface MockComment {
  id: string
  author: string
  text: string
  time: string
  upvotes: number
  isUpPollinated?: boolean
}

interface MockIdea {
  id: string
  text: string
  author: string
  xp: number
  votes: number
  comments: MockComment[]
}

interface MockCell {
  id: string
  number: number
  tier: number
  ideas: MockIdea[]
}

interface MockGroupMessage {
  id: string
  author: string
  text: string
  time: string
}

interface MockChant {
  id: string
  question: string
  phase: 'SUBMISSION' | 'VOTING' | 'COMPLETED' | 'ACCUMULATING'
  tier: number
  participants: number
  ideas: number
  cells: number
  upvotes: number
  community: string
  creator: string
  createdAt: string
  duration?: string
  champion?: { text: string; author: string }
  topIdeas?: { id: string; text: string; author: string; tier: number; xp: number; groupChat?: MockGroupMessage[] }[]
  mockCell?: MockCell
  isCreator?: boolean
}

const MOCK_COMMUNITIES = ['All', 'Portland Gov', 'Austin TX', 'Workers Union 503', 'UC Berkeley']

const MOCK_COMMENTS: MockComment[] = [
  { id: 'c1', author: 'citizen_pdx', text: 'Schools built before 1970 are the biggest risk. This directly saves lives.', time: '2h ago', upvotes: 47 },
  { id: 'c2', author: 'urbanplanner', text: 'The cost-benefit analysis strongly favors this. Every $1 in seismic retrofit saves $4 in expected losses.', time: '4h ago', upvotes: 31, isUpPollinated: true },
  { id: 'c3', author: 'parent_of_3', text: 'My kids go to Buckman Elementary. The building is from 1925. I lose sleep over this.', time: '6h ago', upvotes: 28 },
  { id: 'c4', author: 'fiscal_hawk', text: 'Where is the detailed cost breakdown? $50M may not cover all schools.', time: '3h ago', upvotes: 19 },
  { id: 'c5', author: 'ne_resident', text: 'What about the emergency shelters? Some of those are in worse shape than the schools.', time: '5h ago', upvotes: 14 },
]

const MOCK_CELL: MockCell = {
  id: 'cell-847',
  number: 847,
  tier: 3,
  ideas: [
    { id: 'i1', text: 'Seismic retrofit of public schools and emergency shelters', author: 'safety_first', xp: 0, votes: 0, comments: [MOCK_COMMENTS[0], MOCK_COMMENTS[1], MOCK_COMMENTS[2]] },
    { id: 'i2', text: 'Repair and expand the stormwater drainage system in East Portland', author: 'waterworks_pdx', xp: 0, votes: 0, comments: [
      { id: 'c6', author: 'flood_victim', text: 'Division St floods every winter. This would actually fix it.', time: '1h ago', upvotes: 12 },
      { id: 'c7', author: 'engineer42', text: 'The current system is 60 years old. Patching it costs more than replacing.', time: '3h ago', upvotes: 8 },
    ]},
    { id: 'i3', text: 'Build protected bike lane network connecting all neighborhoods', author: 'bike_commuter', xp: 0, votes: 0, comments: [
      { id: 'c8', author: 'daily_rider', text: 'Hawthorne to downtown is terrifying. Protected lanes save lives.', time: '2h ago', upvotes: 9 },
    ]},
    { id: 'i4', text: 'Upgrade aging water mains to prevent lead contamination', author: 'clean_water', xp: 0, votes: 0, comments: [
      { id: 'c9', author: 'health_dept', text: 'Lead pipe inventory shows 12,000 service lines need replacement.', time: '4h ago', upvotes: 15 },
      { id: 'c10', author: 'parent_of_3', text: 'We had lead in our water last year. My daughter was tested. This is urgent.', time: '5h ago', upvotes: 22 },
    ]},
    { id: 'i5', text: 'Install solar panels on all city-owned buildings', author: 'green_future', xp: 0, votes: 0, comments: [
      { id: 'c11', author: 'budget_guy', text: 'ROI on municipal solar is 7-10 years. Long-term savings are real.', time: '3h ago', upvotes: 6 },
    ]},
  ],
}

const MOCK_CHANTS: MockChant[] = [
  // VOTING — active cell with XP allocation
  { id: '1', question: 'What should Portland allocate its $50M infrastructure bond to?', phase: 'VOTING', tier: 3, participants: 2847, ideas: 11203, cells: 569, upvotes: 342, community: 'Portland Gov', creator: 'Mayor Wheeler', createdAt: '9d', mockCell: MOCK_CELL },
  // SUBMISSION — collecting ideas
  { id: '2', question: 'How should we reform the residential zoning code to address housing affordability?', phase: 'SUBMISSION', tier: 0, participants: 1203, ideas: 890, cells: 0, upvotes: 218, community: 'Portland Gov', creator: 'Planning Bureau', createdAt: '3d', topIdeas: [
    { id: 's1', text: 'Allow fourplexes in all residential zones', author: 'housing_advocate', tier: 0, xp: 0 },
    { id: 's2', text: 'Require 20% affordable units in new developments', author: 'equity_first', tier: 0, xp: 0 },
    { id: 's3', text: 'Tax vacant lots to incentivize building', author: 'land_use_nerd', tier: 0, xp: 0 },
    { id: 's4', text: 'Streamline permitting for ADUs', author: 'backyard_builder', tier: 0, xp: 0 },
  ]},
  // COMPLETED — decided with champion + group chats
  { id: '4', question: 'How should we prioritize park maintenance with the reduced budget?', phase: 'COMPLETED', tier: 4, participants: 3200, ideas: 2100, cells: 640, upvotes: 567, community: 'Portland Gov', creator: 'Parks Dept', createdAt: '21d', duration: '11 days', champion: { text: 'Restore community gardens and convert unused lots to green space', author: 'garden_collective' }, topIdeas: [
    { id: 'p1', text: 'Restore community gardens and convert unused lots to green space', author: 'garden_collective', tier: 4, xp: 847, groupChat: [
      { id: 'g1', author: 'garden_collective', text: 'The city identified 23 vacant lots in East Portland alone. Lets coordinate which ones to target first.', time: '2h ago' },
      { id: 'g2', author: 'parks_volunteer', text: 'Lents Park community garden has a waitlist of 40 families. We need more plots.', time: '1h ago' },
      { id: 'g3', author: 'urban_farmer', text: 'Has anyone connected with the Bureau of Environmental Services? They have composting grants.', time: '45m ago' },
      { id: 'g4', author: 'ne_gardener', text: 'Im organizing a seed swap at Woodstock Park next Saturday. All welcome.', time: '20m ago' },
    ]},
    { id: 'p2', text: 'Fix playground equipment in underserved neighborhoods first', author: 'equity_parks', tier: 4, xp: 623, groupChat: [
      { id: 'g5', author: 'equity_parks', text: 'Mapped all playgrounds with safety violations — 14 in East Portland, 3 in St Johns.', time: '5h ago' },
      { id: 'g6', author: 'parent_coalition', text: 'Lents Park swingset has been broken since September. Kids deserve better.', time: '3h ago' },
      { id: 'g7', author: 'parks_board', text: 'Budget memo going to council next Tuesday. Speak at public comment if you can.', time: '1h ago' },
    ]},
    { id: 'p3', text: 'Plant 10,000 native trees for urban canopy', author: 'tree_hugger', tier: 3, xp: 412, groupChat: [
      { id: 'g8', author: 'tree_hugger', text: 'Friends of Trees has capacity for 3,000 plantings this season. Who else can help scale?', time: '8h ago' },
      { id: 'g9', author: 'urban_forestry', text: 'Priority zones: areas with less than 15% canopy coverage. See the city heat map.', time: '4h ago' },
    ]},
  ]},
  // MANAGE — creator's own chant in submission phase
  { id: '5', question: 'What improvements should we make to the school lunch program?', phase: 'SUBMISSION', tier: 0, participants: 87, ideas: 42, cells: 0, upvotes: 31, community: 'Portland Gov', creator: 'You', createdAt: '1d', isCreator: true, topIdeas: [
    { id: 'm1', text: 'Source ingredients from local farms within 50 miles', author: 'farm_to_school', tier: 0, xp: 0 },
    { id: 'm2', text: 'Eliminate all processed foods and added sugars', author: 'health_parent', tier: 0, xp: 0 },
    { id: 'm3', text: 'Free lunch for all students regardless of income', author: 'equity_now', tier: 0, xp: 0 },
  ]},
  // ACCUMULATING — challenging the champion
  { id: '7', question: 'How should the university invest its $2M sustainability fund?', phase: 'ACCUMULATING', tier: 5, participants: 560, ideas: 430, cells: 112, upvotes: 203, community: 'UC Berkeley', creator: 'Student Senate', createdAt: '14d', champion: { text: 'Campus-wide composting program with student employment', author: 'zero_waste_cal' } },
]

// ── NAV ITEMS (bottom bar drop spots) ──

const NAV_ITEMS = [
  { id: '__nav_chants__', label: 'Chants', href: '/chants', icon: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  )},
  { id: '__nav_podiums__', label: 'Podiums', href: '/podiums', icon: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
    </svg>
  )},
  { id: '__nav_groups__', label: 'Groups', href: '/groups', icon: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  )},
  { id: '__nav_how__', label: 'How', href: '/how', icon: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
    </svg>
  )},
  { id: '__nav_search__', label: 'Search', href: '#search', icon: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  )},
]

// ── HELPERS ──

function phaseBadge(phase: string, tier: number) {
  switch (phase) {
    case 'VOTING': return { label: 'VOTING', sublabel: tier > 0 ? `T${tier}` : '', color: 'bg-warning/15 text-warning border-warning/30' }
    case 'SUBMISSION': return { label: 'IDEAS', sublabel: '', color: 'bg-accent/15 text-accent border-accent/30' }
    case 'COMPLETED': return { label: 'DECIDED', sublabel: '', color: 'bg-success/15 text-success border-success/30' }
    case 'ACCUMULATING': return { label: 'CHALLENGING', sublabel: '', color: 'bg-purple/15 text-purple border-purple/30' }
    default: return { label: phase, sublabel: '', color: 'bg-surface text-muted border-border' }
  }
}

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return n.toString()
}

// ── CREATE DROP ZONE — orb-sized circle, drop target + tappable ──

function CreateDropZone({ id, isActive, isDocked, userInitial, registerRef, onClick, glowDrag }: { id: string; isActive: boolean; isDocked?: boolean; userInitial?: string; registerRef: (id: string, el: HTMLElement | null) => void; onClick: () => void; glowDrag: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    registerRef(id, ref.current)
    return () => registerRef(id, null)
  }, [id, registerRef])
  return (
    <div
      ref={ref}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); (document.activeElement as HTMLElement)?.blur(); onClick() }}
      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer select-none transition-all duration-200 ${isDocked ? 'bg-accent border-accent text-header shadow-[0_0_12px_rgba(34,211,238,0.4)]' : isActive ? 'border-accent bg-accent/20 text-accent scale-110 shadow-[0_0_12px_rgba(34,211,238,0.4)]' : glowDrag ? 'border-[#f59e0b]/60 bg-[#f59e0b]/10 text-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.3)]' : 'border-accent/50 bg-transparent text-accent hover:border-accent hover:bg-accent/10'}`}
    >
      {isDocked ? (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      ) : (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
      )}
    </div>
  )
}

// ── MAIN PAGE ──

function ChantsPageContent() {
  // ── Feed state ──
  const [dockedPostId, setDockedPostId] = useState<string | null>(null)
  const [dockedIdeaId, setDockedIdeaId] = useState<string | null>(null)
  const [selectedCommunity, setSelectedCommunity] = useState('All')
  const [sortBy, setSortBy] = useState<'hot' | 'new' | 'top'>('hot')
  const [showCommunityViewer, setShowCommunityViewer] = useState(false)
  const [xpAllocations, setXpAllocations] = useState<Record<string, Record<string, number>>>({})
  const [nearestDrop, setNearestDrop] = useState<string | null>(null)
  const [isDraggingDockstar, setIsDraggingDockstar] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [linkCopied, setLinkCopied] = useState<string | null>(null)
  const [dockedPostVisible, setDockedPostVisible] = useState(true)
  const [selfPixelPos, setSelfPixelPos] = useState<{ x: number; y: number } | null>(null)
  const [flashDocks, setFlashDocks] = useState(false)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [tetherPoints, setTetherPoints] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [externalDragStart] = useState<{ x: number; y: number } | null>(null)
  const [undockingAnim, setUndockingAnim] = useState(false)
  // pendingDock removed — drag-and-drop auto-confirms
  const [pendingInput, setPendingInput] = useState<string>('')
  const [pendingInputType, setPendingInputType] = useState<'comment' | 'idea' | 'chat' | 'challenge' | null>(null)
  const [pendingDockContext, setPendingDockContext] = useState<{ postId: string; ideaId: string | null } | null>(null)
  const [pendingInputTargetId, setPendingInputTargetId] = useState<string | null>(null)
  // Footer pinned (toggled by clicking dockstar at home)
  const [footerPinned, setFooterPinned] = useState(false)
  // Create mode
  const [createMode, setCreateMode] = useState(false)
  const [createQuestion, setCreateQuestion] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  // Subspace state
  const [activeSubspaceId, setActiveSubspaceId] = useState<string | null>(null)
  const [bookmarks, setBookmarks] = useState<string[]>([])

  const dropZoneRefs = useRef<Map<string, HTMLElement>>(new Map())

  // Active dock target — idea DropCircle if docked to idea, else chant DropCircle
  // Hide dockstar orb when docked to create (CreateDropZone shows X instead)
  const activeDockTarget = dockedPostId === '__create_chant__' ? '__create_chant__' : dockedIdeaId ? `idea:${dockedIdeaId}` : dockedPostId

  // Track scroll — updates player pixel position (scrolling moves pixel down)
  // + docked target visibility
  useEffect(() => {
    const onScroll = () => {
      const sy = window.scrollY
      setScrollY(sy)
      // Check if the active dock target's DropCircle is on screen
      const target = dockedIdeaId ? `idea:${dockedIdeaId}` : dockedPostId
      if (target) {
        const el = dropZoneRefs.current.get(target)
        if (el) {
          const rect = el.getBoundingClientRect()
          const visible = rect.top > -20 && rect.bottom < window.innerHeight + 20
          setDockedPostVisible(visible)
        }
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [dockedPostId, dockedIdeaId])

  // Initialize self pixel at center of viewport
  useEffect(() => {
    setSelfPixelPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 + window.scrollY })
  }, [])

  // Track tether line from sidebar orb to docked idea's DropCircle
  useEffect(() => {
    if (!dockedIdeaId) { setTetherPoints(null); return }
    const el = dropZoneRefs.current.get(`idea:${dockedIdeaId}`)
    if (el) {
      const rect = el.getBoundingClientRect()
      setTetherPoints({
        x1: window.innerWidth - 20,
        y1: 26,
        x2: rect.left + rect.width / 2,
        y2: rect.top + rect.height / 2,
      })
    } else {
      setTetherPoints(null)
    }
  }, [dockedIdeaId, scrollY])

  // Page tap — place pixel + flash docks on miss
  const handlePageClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const isForm = target.closest('input, textarea, select')
    if (isForm) return

    // Place self pixel at tap location only when NOT docked (dockstar stays pinned when docked)
    if (!dockedPostId) {
      setSelfPixelPos({ x: e.clientX, y: e.clientY + window.scrollY })
    }

    // Flash docks gold if tap missed dockpoint/dockstar/interactive
    const isDockTarget = target.closest('[data-dockstar], [data-dockpoint]')
    const isInteractive = target.closest('button, a, [data-interactive]')
    if (!isDockTarget && !isInteractive) {
      setFlashDocks(true)
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
      flashTimeoutRef.current = setTimeout(() => setFlashDocks(false), 600)
    }
  }, [dockedPostId])

  // Share link for docked chant — slug-style URL from chant title
  const handleShareLink = useCallback((chant: MockChant) => {
    const slug = chant.question
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60)
      .replace(/-$/, '')
    const url = `${window.location.origin}/chants/${slug}`
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(chant.id)
      setTimeout(() => setLinkCopied(null), 2000)
    })
  }, [])

  // ── Feed handlers ──
  const registerDropZone = useCallback((id: string, el: HTMLElement | null) => {
    if (el) dropZoneRefs.current.set(id, el)
    else dropZoneRefs.current.delete(id)
  }, [])

  const handleDock = useCallback((id: string) => {
    setFooterPinned(false)
    // Warn if leaving unsaved work for a different dock target
    if (dockedPostId && id !== dockedPostId && !id.startsWith('idea:')) {
      const hasUnsavedText = pendingInput.trim().length > 0
      const hasUnsavedCreate = createMode && createQuestion.trim().length > 0
      const hasUnsavedVotes = dockedPostId !== '__create_chant__' && Object.values(xpAllocations[dockedPostId] || {}).some(v => v > 0)
      if ((hasUnsavedText || hasUnsavedCreate || hasUnsavedVotes) && !window.confirm('You have unsubmitted work. Leave and discard?')) return
    }
    if (id === '__create_chant__') {
      setDockedPostId('__create_chant__')
      setDockedIdeaId(null)
      setCreateMode(true)
      setCreateQuestion('')
      setCreateDescription('')
      setCreateError('')
      return
    }
    if (id.startsWith('__nav_')) {
      // Undock from current position before navigating
      setDockedPostId(null)
      setDockedIdeaId(null)
      setXpAllocations({})
      setPendingInput('')
      setPendingInputType(null)
      const nav = NAV_ITEMS.find(n => n.id === id)
      if (nav) {
        if (nav.href === '#search') {
          setShowCommunityViewer(true)
        } else if (nav.href !== '/chants') {
          window.location.href = nav.href
        }
      }
      return
    }
    // Bookmark dock — bookmark + enter subspace
    if (id.startsWith('bookmark:')) {
      const ideaId = id.slice(9)
      setBookmarks(prev => prev.includes(ideaId) ? prev : [...prev, ideaId])
      enterSubspace(ideaId)
      return
    }
    // Idea-level dock (drag-dropped onto an idea DropCircle)
    if (id.startsWith('idea:')) {
      setDockedIdeaId(id.slice(5))
      setDockedPostVisible(true)
      // Prevent comment input from auto-focusing
      requestAnimationFrame(() => (document.activeElement as HTMLElement)?.blur())
      return
    }
    // Chant-level dock — scroll to top
    setCreateMode(false)
    setDockedPostId(id)
    setDockedIdeaId(null)
    setDockedPostVisible(true)
    requestAnimationFrame(() => {
      const el = document.getElementById(`chant-${id}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const handleUndock = useCallback(() => {
    if (dockedPostId) {
      // Warn if unsaved work
      const hasUnsavedText = pendingInput.trim().length > 0
      const hasUnsavedCreate = createMode && createQuestion.trim().length > 0
      const hasUnsavedVotes = dockedPostId !== '__create_chant__' && Object.values(xpAllocations[dockedPostId] || {}).some(v => v > 0)
      if (hasUnsavedText || hasUnsavedCreate || hasUnsavedVotes) {
        if (!window.confirm('You have unsubmitted work. Leave and discard?')) return
      }
      setUndockingAnim(true)
      setActiveSubspaceId(null)
      setTimeout(() => {
        setDockedPostId(null)
        setDockedIdeaId(null)
        setXpAllocations({})
        setPendingInput('')
        setPendingInputType(null)
        setCreateMode(false)
        setUndockingAnim(false)
      }, 200)
    } else {
      // Not docked — toggle footer
      setFooterPinned(prev => !prev)
    }
  }, [dockedPostId, pendingInput, createMode, createQuestion, xpAllocations])

  const handleCreateSubmit = useCallback(async () => {
    const q = createQuestion.trim()
    if (!q || q.length < 2) { setCreateError('Question must be at least 2 characters'); return }
    setCreating(true)
    setCreateError('')
    try {
      const res = await fetch('/api/deliberations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, description: createDescription.trim() || undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setCreateError(data.error || 'Failed to create chant')
        return
      }
      const delib = await res.json()
      setCreateMode(false)
      setCreateQuestion('')
      setCreateDescription('')
      // Dock into the newly created chant — for now navigate to it
      window.location.href = `/chants/${delib.id}`
    } catch {
      setCreateError('Network error')
    } finally {
      setCreating(false)
    }
  }, [createQuestion, createDescription])

  const handleDragState = useCallback((dragging: boolean, nearest: string | null) => {
    setIsDraggingDockstar(dragging)
    setNearestDrop(nearest)
  }, [])


  const handleXpChange = useCallback((chantId: string, ideaId: string, value: number) => {
    setXpAllocations(prev => {
      const current = prev[chantId] || {}
      const othersTotal = Object.entries(current).filter(([k]) => k !== ideaId).reduce((s, [, v]) => s + v, 0)
      const capped = Math.min(value, 10 - othersTotal)
      return { ...prev, [chantId]: { ...current, [ideaId]: Math.max(0, capped) } }
    })
  }, [])

  const handleTextInput = useCallback((value: string, type: 'comment' | 'idea' | 'chat' | 'challenge', targetId: string) => {
    setPendingInput(value)
    setPendingInputType(type)
    setPendingInputTargetId(targetId)
    if (value.trim().length > 0) {
      setPendingDockContext(prev => prev || { postId: dockedPostId!, ideaId: dockedIdeaId })
    }
  }, [dockedPostId, dockedIdeaId])

  // ── SUBSPACE ──
  const enterSubspace = useCallback((ideaId: string) => {
    setActiveSubspaceId(ideaId)
    setBookmarks(prev => prev.includes(ideaId) ? prev : [...prev, ideaId])
  }, [])

  const exitSubspace = useCallback(() => {
    setActiveSubspaceId(null)
  }, [])

  const filteredChants = MOCK_CHANTS
    .filter(c => selectedCommunity === 'All' || c.community === selectedCommunity)
    .sort((a, b) => {
      if (sortBy === 'top') return b.upvotes - a.upvotes
      if (sortBy === 'new') return 0
      return (b.upvotes + b.participants) - (a.upvotes + a.participants)
    })

  const getXpTotal = (chantId: string) => {
    const alloc = xpAllocations[chantId] || {}
    return Object.values(alloc).reduce((s, v) => s + v, 0)
  }

  return (
    <DockstarGlowContext.Provider value={{ nearestDrop, isDragging: isDraggingDockstar }}>
      {/* ═══ BOOKMARK SIDEBAR — left edge ═══ */}
      <BookmarkSidebar
        bookmarks={bookmarks}
        activeSubspaceId={activeSubspaceId}
        onNavigate={enterSubspace}
        onRemove={(id) => setBookmarks(prev => prev.filter(b => b !== id))}
      />

      <div
        className="min-h-screen bg-background text-foreground cursor-none"
        style={{ marginLeft: bookmarks.length > 0 ? '36px' : undefined }}
        onClick={handlePageClick}
        onPointerMove={(e) => setSelfPixelPos({ x: e.clientX, y: e.clientY + window.scrollY })}
      >
        {/* ═══ DOCKSTAR ORB ═══ */}
        <Dockstar
          userInitial="G"
          dockedPostId={activeDockTarget}
          dropZoneRefs={dropZoneRefs}
          onDock={handleDock}
          onUndock={handleUndock}
          onUndockIdea={() => setDockedIdeaId(null)}
          onDragStateChange={handleDragState}
          flashDocks={flashDocks}
          externalDragStart={externalDragStart}
          onExternalDragHandled={() => {}}
        />

        {/* ═══ PLAYER OVERLAY — filtered to current instance ═══ */}
        <PlayerOverlay
          players={[
            ...MOCK_PLAYERS.filter(p => p.instance === (dockedPostId || 'list')),
            ...(selfPixelPos ? [{ id: 'self', name: 'You', color: '#22d3ee', x: selfPixelPos.x, y: selfPixelPos.y }] : []),
          ]}
          scrollY={scrollY}
        />

        {/* ═══ TOP BAR — always visible, masks list ═══ */}
        <div className={`fixed top-0 left-0 z-[60] bg-header/95 backdrop-blur-sm border-b border-border/30 transition-all duration-300 ${dockedPostId && dockedPostId !== '__create_chant__' ? 'right-12' : 'right-0'}`}>
          <div className="px-3 py-3 flex items-center gap-2">
            {(!dockedPostId || dockedPostId === '__create_chant__') && (
              <CreateDropZone
                id="__create_chant__"
                isActive={isDraggingDockstar && nearestDrop === '__create_chant__'}
                isDocked={createMode}
                userInitial="G"
                registerRef={registerDropZone}
                onClick={() => createMode ? handleUndock() : handleDock('__create_chant__')}
                glowDrag={isDraggingDockstar && nearestDrop !== '__create_chant__'}
              />
            )}
            {dockedPostId && dockedPostId !== '__create_chant__' ? (
              <h2 className={`flex-1 text-xs font-serif text-foreground/80 truncate transition-all duration-300 ${undockingAnim ? '-translate-x-full opacity-0' : ''}`}>
                {MOCK_CHANTS.find(c => c.id === dockedPostId)?.question}
              </h2>
            ) : (
              <h2 className="flex-1 text-xs font-serif text-foreground/80">{createMode ? 'New Chant' : 'Create'}</h2>
            )}
          </div>
          {/* ── INLINE CREATE FORM ── */}
          <div className={`overflow-hidden transition-all duration-300 ease-out ${createMode ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="px-3 pb-3 space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={createQuestion}
                  onChange={e => { setCreateQuestion(e.target.value); setCreateError('') }}
                  placeholder="What should we deliberate?"
                  className="w-full bg-surface border-2 border-border/30 rounded px-3 py-3 pr-10 text-sm text-foreground placeholder:text-muted-light outline-none focus:border-accent focus:shadow-[0_0_16px_rgba(8,145,178,0.2)] transition-all"
                  disabled={creating}
                  autoFocus={createMode}
                />
                <div className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 pointer-events-none ${createQuestion.trim().length > 0 ? 'border-accent bg-accent/20 shadow-[0_0_8px_rgba(34,211,238,0.4)]' : 'border-border/40'}`}>
                  <svg className={`w-3 h-3 transition-colors ${createQuestion.trim().length > 0 ? 'fill-accent' : 'fill-muted-light/30'}`} viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" /></svg>
                </div>
              </div>
              <textarea
                value={createDescription}
                onChange={e => setCreateDescription(e.target.value)}
                placeholder="Add context (optional)"
                rows={2}
                className="w-full bg-surface border-2 border-border/30 rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-light outline-none focus:border-accent focus:shadow-[0_0_16px_rgba(8,145,178,0.2)] transition-all resize-none"
                disabled={creating}
              />
              {createError && (
                <p className="text-xs text-error font-mono">{createError}</p>
              )}
            </div>
          </div>
        </div>

        {/* ═══ DOCKED RIGHT BAR — permanent sidebar (orb is in Dockstar component) ═══ */}
        {dockedPostId && (() => {
          const docked = MOCK_CHANTS.find(c => c.id === dockedPostId)
          if (!docked) return null
          const badge = phaseBadge(docked.phase, docked.tier)
          return (
            <div className="fixed top-0 right-0 bottom-0 z-[70] w-12 bg-header border-l border-border/30 flex flex-col items-center py-2 gap-3 pointer-events-none">
              {/* Spacer for Dockstar orb (rendered by Dockstar component at z-[9999]) */}
              <div className="w-10 h-10 shrink-0" />

              {/* Phase badge — vertical */}
              <span className={`inline-flex items-center px-1 py-0.5 rounded border text-[8px] font-mono pointer-events-auto ${badge.color}`} style={{ writingMode: 'vertical-lr', textOrientation: 'mixed' }}>
                {badge.label}
              </span>

              {/* Undock button (X) */}
              <button
                onClick={handleUndock}
                data-interactive
                className="w-6 h-6 rounded flex items-center justify-center text-muted-light hover:text-error hover:bg-white/10 transition-colors pointer-events-auto"
                title="Deselect"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )
        })()}

        {/* ═══ TETHER LINE — sidebar orb to docked idea ═══ */}
        {tetherPoints && (
          <svg className="fixed inset-0 z-[65] pointer-events-none" style={{ width: '100vw', height: '100vh' }}>
            <line
              x1={tetherPoints.x1} y1={tetherPoints.y1}
              x2={tetherPoints.x2} y2={tetherPoints.y2}
              stroke="rgba(34,211,238,0.2)"
              strokeWidth={1.5}
              strokeDasharray="6 3"
            />
          </svg>
        )}

        {/* ── Top spacer for header ── */}
        <div className="h-16" />

        {/* ── CHANTS FEED ── */}
        <div className={`${activeSubspaceId ? 'max-w-xl ml-4' : 'max-w-2xl mx-auto'} ${dockedPostId ? 'pr-14' : ''}`}>
          <div className="divide-y divide-border/30">
            {filteredChants.map(chant => {
              const isDocked = dockedPostId === chant.id
              const badge = phaseBadge(chant.phase, chant.tier)
              const isNearDrop = isDraggingDockstar && nearestDrop === chant.id

              return (
                <div
                  key={chant.id}
                  id={`chant-${chant.id}`}
                  className={`transition-colors duration-200 ${isDocked ? 'bg-surface/40' : ''}`}
                >
                  {/* Card header */}
                  <div className="flex items-start gap-2.5 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-serif text-foreground leading-snug mb-1">
                        {chant.question}
                      </h3>
                      <div className="flex items-center gap-1.5 mb-1.5 text-xs">
                        <span className="font-mono text-accent">{chant.community}</span>
                        <span className="text-muted-light/50">/</span>
                        <span className="text-muted-light">{chant.creator}</span>
                        <span className="text-muted-light/50">/</span>
                        <span className="text-muted-light">{chant.createdAt}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-px rounded border ${badge.color}`}>
                          {badge.label}{badge.sublabel && <span className="opacity-60"> {badge.sublabel}</span>}
                        </span>
                        {chant.isCreator && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded border bg-accent/10 text-accent border-accent/30 text-[10px]">
                            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            YOURS
                          </span>
                        )}
                        <span className="text-muted">{fmt(chant.participants)}</span>
                        <span className="text-muted-light/40">&middot;</span>
                        <span className="text-muted">{fmt(chant.ideas)} ideas</span>
                        <span className="ml-auto text-muted flex items-center gap-0.5">
                          <span className="text-accent/70">&uarr;</span>{fmt(chant.upvotes)}
                        </span>
                      </div>
                      {chant.phase === 'COMPLETED' && chant.champion && !isDocked && (
                        <div className="mt-1.5 px-2 py-1.5 bg-gold/6 border-l-2 border-gold/30 text-sm text-gold/80">
                          {chant.champion.text}
                        </div>
                      )}
                    </div>
                    <div className="pt-1 self-center">
                      <DropCircle
                        id={chant.id}
                        isActive={isNearDrop}
                        isDocked={isDocked}
                        userInitial="G"
                        registerRef={registerDropZone}
                        onClick={() => isDocked ? handleUndock() : handleDock(chant.id)}
                        onDragUndock={undefined}
                        flashDocks={flashDocks}
                        glowDrag={isDraggingDockstar && !isDocked}
                        dockedPlayers={MOCK_PLAYERS.filter(p => p.dockedTo === chant.id).map(p => ({ id: p.id, color: p.color }))}
                      />
                    </div>
                  </div>

                  {/* ── EXPANDED (docked) ── */}
                  {isDocked && (
                    <div
                      className="px-3 pb-3 pl-12 animate-slideDown"
                      onPointerMove={(e) => setSelfPixelPos({ x: e.clientX, y: e.clientY + window.scrollY })}
                      onPointerLeave={() => setSelfPixelPos(null)}
                    >
                      <div className="border-t border-border/30 pt-2.5">
                        {/* SUBMISSION */}
                        {chant.phase === 'SUBMISSION' && !activeSubspaceId && (
                          <div>
                            <div className="mb-2.5 relative">
                              <input id="idea-input" type="text" placeholder="Your idea..." value={pendingInputType === 'idea' && pendingInputTargetId === chant.id ? pendingInput : ''} onChange={e => handleTextInput(e.target.value, 'idea', chant.id)} className="w-full bg-surface border-2 border-border/30 rounded px-3 py-3 pr-10 text-sm text-foreground placeholder:text-muted-light outline-none focus:border-[#f59e0b] focus:shadow-[0_0_16px_rgba(245,158,11,0.3)] focus:placeholder:text-[#f59e0b]/40 transition-all" />
                              <div className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 pointer-events-none ${pendingInputType === 'idea' && pendingInputTargetId === chant.id && pendingInput.trim().length > 0 ? 'border-accent bg-accent/20 shadow-[0_0_8px_rgba(34,211,238,0.4)]' : 'border-border/40'}`}>
                                <svg className={`w-3 h-3 transition-colors ${pendingInputType === 'idea' && pendingInputTargetId === chant.id && pendingInput.trim().length > 0 ? 'fill-accent' : 'fill-muted-light/30'}`} viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" /></svg>
                              </div>
                            </div>
                            {chant.topIdeas?.map((idea, i) => (
                              <div key={i} className="bg-purple/12 border border-purple/30 rounded px-2.5 py-1.5 mb-1">
                                <div className="text-sm font-serif text-purple/70 leading-snug">{idea.text}</div>
                                <div className="text-xs text-purple/40 mt-0.5">{idea.author}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* VOTING */}
                        {chant.phase === 'VOTING' && chant.mockCell && !activeSubspaceId && (
                          <div>
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[10px] font-mono text-muted-light">Cell #{chant.mockCell.number} / Tier {chant.mockCell.tier}</span>
                                  <span className={`text-xl font-mono font-bold ${getXpTotal(chant.id) === 10 ? 'text-success' : 'text-accent'}`}>
                                    {getXpTotal(chant.id)}<span className="text-sm text-muted-light/60">/10 XP</span>
                                  </span>
                                </div>
                                <div className="space-y-px">
                                  {chant.mockCell.ideas.map(idea => {
                                    const xp = (xpAllocations[chant.id] || {})[idea.id] || 0
                                    const isIdeaDocked = dockedIdeaId === idea.id
                                    return (
                                      <div key={idea.id} id={`idea-${idea.id}`} className={`rounded border transition-colors ${isIdeaDocked ? 'bg-purple/10 border-purple/50' : 'bg-purple/6 border-purple/25'}`}>
                                        <div className="px-2.5 py-2">
                                          <div className="flex items-start gap-2 mb-1.5">
                                            <div className="flex-1 min-w-0">
                                              <div className={`text-sm font-serif leading-snug ${isIdeaDocked ? 'text-purple' : 'text-purple/70'}`}>{idea.text}</div>
                                              <div className="text-xs text-purple/40 mt-0.5">{idea.author}</div>
                                            </div>
                                            <span className={`text-2xl font-mono font-bold ${xp > 0 ? 'text-accent' : 'text-muted-light/20'}`}>{xp}</span>
                                          </div>
                                          {/* Slider + dock port */}
                                          <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                                              {Array.from({ length: 10 }, (_, i) => (
                                                <div key={i} onClick={() => handleXpChange(chant.id, idea.id, xp === i + 1 ? 0 : i + 1)} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all duration-200 ${flashDocks ? 'animate-flash-gold' : ''} ${i < xp ? 'border-accent bg-accent/20 shadow-[0_0_8px_rgba(34,211,238,0.4)]' : isIdeaDocked ? 'border-accent/40 bg-accent/5 shadow-[0_0_4px_rgba(34,211,238,0.15)]' : 'border-border/40 bg-transparent hover:border-muted-light/60'}`}>
                                                  <svg className={`w-2.5 h-2.5 transition-colors ${i < xp ? 'fill-accent' : isIdeaDocked ? 'fill-accent/30' : 'fill-muted-light/30'}`} viewBox="0 0 24 24">
                                                    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
                                                  </svg>
                                                </div>
                                              ))}
                                            </div>
                                            <DropCircle
                                              id={`idea:${idea.id}`}
                                              isActive={isDraggingDockstar && nearestDrop === `idea:${idea.id}`}
                                              isDocked={isIdeaDocked}
                                              userInitial="G"
                                              registerRef={registerDropZone}
                                              onClick={() => { if (isIdeaDocked) { setDockedIdeaId(null); exitSubspace() } else { setDockedIdeaId(idea.id); enterSubspace(idea.id); setTimeout(() => { const el = document.getElementById(`idea-${idea.id}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 50) } }}
                                              onDragUndock={undefined}
                                              flashDocks={flashDocks}
                                              faded={isIdeaDocked}
                                              glowDrag={isDraggingDockstar && !isIdeaDocked}
                                              dockedPlayers={MOCK_PLAYERS.filter(p => p.dockedTo === `idea:${idea.id}`).map(p => ({ id: p.id, color: p.color }))}
                                            />
                                          </div>
                                        </div>
                                        {/* Subspace viewport — last messages + dockstar chat box */}
                                        {(() => {
                                          const sub = getSubspace(idea.id)
                                          const recentMsgs = sub?.messages.slice(-3) || []
                                          return recentMsgs.length > 0 ? (
                                            <div
                                              className={`border-t border-border/20 px-2.5 py-1.5 bg-header/20 cursor-pointer hover:bg-header/30 transition-colors ${isIdeaDocked ? 'animate-slideDown' : ''}`}
                                              onClick={(e) => { e.stopPropagation(); enterSubspace(idea.id); if (!isIdeaDocked) setDockedIdeaId(idea.id) }}
                                              data-interactive
                                            >
                                              <div className="space-y-1">
                                                {recentMsgs.map(msg => (
                                                  <div key={msg.id} className="text-[10px]">
                                                    <span className="font-mono text-xs" style={{ color: msg.authorColor }}>{msg.author}</span>
                                                    <span className="text-muted-light text-xs"> &middot; {msg.time}</span>
                                                    <p className="text-muted/80 mt-0.5 leading-snug text-sm">{msg.text}</p>
                                                  </div>
                                                ))}
                                              </div>
                                              <div className="flex items-center gap-1.5 mt-1.5 pt-1 border-t border-border/10">
                                                <div className="flex -space-x-1">
                                                  {(sub?.members.slice(0, 4) || []).map(m => (
                                                    <div key={m.id} className="w-2 h-2 rounded-full border border-header" style={{ backgroundColor: m.color }} />
                                                  ))}
                                                </div>
                                                <span className="text-[9px] font-mono text-muted-light/50">{sub?.members.length} in subspace</span>
                                                <div className="ml-auto">
                                                  <DropCircle
                                                    id={`bookmark:${idea.id}`}
                                                    isActive={isDraggingDockstar && nearestDrop === `bookmark:${idea.id}`}
                                                    isDocked={bookmarks.includes(idea.id)}
                                                    userInitial=""
                                                    registerRef={registerDropZone}
                                                    onClick={() => { setBookmarks(prev => prev.includes(idea.id) ? prev : [...prev, idea.id]); enterSubspace(idea.id); setDockedIdeaId(idea.id) }}
                                                    flashDocks={flashDocks}
                                                    faded={false}
                                                    glowDrag={isDraggingDockstar}
                                                    dockedPlayers={[]}
                                                  />
                                                </div>
                                              </div>
                                            </div>
                                          ) : null
                                        })()}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                          </div>
                        )}

                        {/* COMPLETED — top ideas with group chat dock points */}
                        {chant.phase === 'COMPLETED' && chant.champion && chant.topIdeas && !activeSubspaceId && (
                          <div>
                            <div className="flex gap-4 text-center text-xs font-mono mb-2.5">
                              <div><span className="text-foreground">{fmt(chant.participants)}</span> <span className="text-muted-light">people</span></div>
                              <div><span className="text-foreground">{chant.tier}</span> <span className="text-muted-light">tiers</span></div>
                              <div><span className="text-foreground">{chant.duration}</span> <span className="text-muted-light">duration</span></div>
                            </div>
                            {chant.topIdeas.map((idea, i) => {
                              const isChampion = i === 0
                              const isIdeaDocked = dockedIdeaId === idea.id
                              return (
                                <div key={idea.id} id={`idea-${idea.id}`} className={`rounded border mb-1 transition-colors ${isChampion ? (isIdeaDocked ? 'bg-gold/12 border-gold/50' : 'bg-gold/6 border-gold/30') : (isIdeaDocked ? 'bg-purple/12 border-purple/50' : 'bg-purple/6 border-purple/25')}`}>
                                  <div className="px-2.5 py-2">
                                    <div className="flex items-start gap-2">
                                      {!isChampion && <span className="text-purple/30 font-mono text-xs shrink-0 pt-0.5">{i + 1}.</span>}
                                      {isChampion && <span className="text-gold/50 font-mono text-xs shrink-0 pt-0.5">★</span>}
                                      <div className="flex-1 min-w-0">
                                        {isChampion && <div className="text-[9px] font-mono text-gold/50 uppercase tracking-wider mb-0.5">Priority</div>}
                                        <div className={`text-sm font-serif leading-snug ${isChampion ? (isIdeaDocked ? 'text-gold' : 'text-gold/80') : (isIdeaDocked ? 'text-purple' : 'text-purple/70')}`}>{idea.text}</div>
                                        <div className={`text-xs mt-0.5 ${isChampion ? 'text-gold/40' : 'text-purple/40'}`}>{idea.author} · {idea.xp}xp</div>
                                      </div>
                                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                                        <DropCircle
                                          id={`idea:${idea.id}`}
                                          isActive={isDraggingDockstar && nearestDrop === `idea:${idea.id}`}
                                          isDocked={isIdeaDocked}
                                          userInitial="G"
                                          registerRef={registerDropZone}
                                          onClick={() => { if (isIdeaDocked) { setDockedIdeaId(null); exitSubspace() } else { setDockedIdeaId(idea.id); enterSubspace(idea.id); setTimeout(() => { const el = document.getElementById(`idea-${idea.id}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 50) } }}
                                          onDragUndock={undefined}
                                          flashDocks={flashDocks}
                                          faded={isIdeaDocked}
                                          glowDrag={isDraggingDockstar && !isIdeaDocked}
                                          dockedPlayers={MOCK_PLAYERS.filter(p => p.dockedTo === `idea:${idea.id}`).map(p => ({ id: p.id, color: p.color }))}
                                        />
                                        {(() => { const s = getSubspace(idea.id); return s && s.messages.length > 0 ? (
                                          <span className={`text-[9px] font-mono ${isIdeaDocked ? 'text-accent' : 'text-muted-light/60'}`}>{s.messages.length}</span>
                                        ) : null })()}
                                      </div>
                                    </div>
                                  </div>
                                  {/* Subspace viewport — last messages + dockstar chat box */}
                                  {(() => {
                                    const sub = getSubspace(idea.id)
                                    const recentMsgs = sub?.messages.slice(-3) || []
                                    return recentMsgs.length > 0 ? (
                                      <div
                                        className={`border-t border-border/20 px-2.5 py-1.5 bg-header/20 cursor-pointer hover:bg-header/30 transition-colors ${isIdeaDocked ? 'animate-slideDown' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); enterSubspace(idea.id); if (!isIdeaDocked) setDockedIdeaId(idea.id) }}
                                        data-interactive
                                      >
                                        <div className="space-y-1">
                                          {recentMsgs.map(msg => (
                                            <div key={msg.id} className="text-[10px]">
                                              <span className="font-mono text-xs" style={{ color: msg.authorColor }}>{msg.author}</span>
                                              <span className="text-muted-light text-xs"> &middot; {msg.time}</span>
                                              <p className="text-muted/80 mt-0.5 leading-snug text-sm">{msg.text}</p>
                                            </div>
                                          ))}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1.5 pt-1 border-t border-border/10">
                                          <div className="flex -space-x-1">
                                            {(sub?.members.slice(0, 4) || []).map(m => (
                                              <div key={m.id} className="w-2 h-2 rounded-full border border-header" style={{ backgroundColor: m.color }} />
                                            ))}
                                          </div>
                                          <span className="text-[9px] font-mono text-muted-light/50">{sub?.members.length} in subspace</span>
                                          <div className="ml-auto">
                                            <DropCircle
                                              id={`bookmark:${idea.id}`}
                                              isActive={isDraggingDockstar && nearestDrop === `bookmark:${idea.id}`}
                                              isDocked={bookmarks.includes(idea.id)}
                                              userInitial=""
                                              registerRef={registerDropZone}
                                              onClick={() => { setBookmarks(prev => prev.includes(idea.id) ? prev : [...prev, idea.id]); enterSubspace(idea.id); setDockedIdeaId(idea.id) }}
                                              flashDocks={flashDocks}
                                              faded={false}
                                              glowDrag={isDraggingDockstar}
                                              dockedPlayers={[]}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    ) : null
                                  })()}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* ACCUMULATING */}
                        {chant.phase === 'ACCUMULATING' && chant.champion && !activeSubspaceId && (
                          <div>
                            <div className="px-2.5 py-2 bg-purple/6 border-l-2 border-purple/40 rounded-r mb-2.5">
                              <div className="text-[9px] font-mono text-purple/50 uppercase tracking-wider">Champion</div>
                              <div className="text-sm text-purple font-serif mt-0.5">{chant.champion.text}</div>
                            </div>
                            <div className="relative">
                              <input id="challenge-input" type="text" placeholder="Challenge with your idea..." value={pendingInputType === 'challenge' && pendingInputTargetId === chant.id ? pendingInput : ''} onChange={e => handleTextInput(e.target.value, 'challenge', chant.id)} className="w-full bg-surface border-2 border-border/30 rounded px-3 py-3 pr-10 text-sm text-foreground placeholder:text-muted-light outline-none focus:border-[#f59e0b] focus:shadow-[0_0_16px_rgba(245,158,11,0.3)] focus:placeholder:text-[#f59e0b]/40 transition-all" />
                              <div className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 pointer-events-none ${pendingInputType === 'challenge' && pendingInputTargetId === chant.id && pendingInput.trim().length > 0 ? 'border-accent bg-accent/20 shadow-[0_0_8px_rgba(34,211,238,0.4)]' : 'border-border/40'}`}>
                                <svg className={`w-3 h-3 transition-colors ${pendingInputType === 'challenge' && pendingInputTargetId === chant.id && pendingInput.trim().length > 0 ? 'fill-accent' : 'fill-muted-light/30'}`} viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" /></svg>
                              </div>
                            </div>
                          </div>
                        )}


                        {/* ── INLINE SUBSPACE — replaces card body content ── */}
                        {activeSubspaceId && (() => {
                          const hasIdea = chant.mockCell?.ideas?.some(i => i.id === activeSubspaceId) || chant.topIdeas?.some(i => i.id === activeSubspaceId)
                          if (!hasIdea) return null
                          const parentChant = chant
                          const xpVal = (xpAllocations[parentChant.id] || {})[activeSubspaceId] || 0
                          return (
                            <div className="animate-subspaceExpand -mx-3 -mb-3 border-t border-accent/30" style={{ height: 'calc(100vh - 160px)' }}>
                              <IdeaSubspace
                                ideaId={activeSubspaceId}
                                onClose={() => { setActiveSubspaceId(null); setDockedIdeaId(null) }}
                                onNavigateToSubspace={(id) => { setActiveSubspaceId(id); setDockedIdeaId(id) }}
                                bookmarks={bookmarks}
                                xp={xpVal}
                                onXpChange={parentChant.phase === 'VOTING' ? (val) => handleXpChange(parentChant.id, activeSubspaceId, val) : undefined}
                                flashDocks={flashDocks}
                              />
                            </div>
                          )
                        })()}

                        {/* Share link */}
                        {!activeSubspaceId && (
                        <div className="mt-3 pt-2.5 border-t border-border/20 flex items-center gap-2">
                          <span className="text-[10px] font-mono text-accent/70 truncate flex-1">
                            unitychant.com/{chant.question.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '-').slice(0, 40).replace(/-$/, '')}
                          </span>
                          <button
                            onClick={() => handleShareLink(chant)}
                            data-interactive
                            className="shrink-0 px-2 py-1 text-[10px] font-mono rounded border border-accent/30 text-accent hover:bg-accent/10 transition-colors"
                          >
                            {linkCopied === chant.id ? 'Copied!' : 'Share'}
                          </button>
                        </div>
                        )}

                        {/* ── MANAGE PANEL — creator only ── */}
                        {chant.isCreator && !activeSubspaceId && (
                          <div className="mt-3 pt-2.5 border-t border-border/20">
                            <div className="flex items-center gap-1.5 mb-2">
                              <svg className="w-3 h-3 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              <span className="text-[10px] font-mono text-accent uppercase tracking-wider">Manage</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              {chant.phase === 'SUBMISSION' && (
                                <button data-interactive className="px-2.5 py-2 rounded border border-warning/30 bg-warning/8 text-warning text-[11px] font-mono hover:bg-warning/15 transition-colors text-left">
                                  Start Voting
                                </button>
                              )}
                              {chant.phase === 'VOTING' && (
                                <button data-interactive className="px-2.5 py-2 rounded border border-success/30 bg-success/8 text-success text-[11px] font-mono hover:bg-success/15 transition-colors text-left">
                                  Advance Tier
                                </button>
                              )}
                              <button data-interactive onClick={() => handleShareLink(chant)} className="px-2.5 py-2 rounded border border-accent/30 bg-accent/8 text-accent text-[11px] font-mono hover:bg-accent/15 transition-colors text-left">
                                Invite
                              </button>
                              <button data-interactive onClick={() => window.location.href = `/chants/${chant.id}/analytics`} className="px-2.5 py-2 rounded border border-border/40 bg-surface/50 text-muted-light text-[11px] font-mono hover:text-foreground hover:bg-surface transition-colors text-left">
                                Analytics
                              </button>
                              <button data-interactive className="px-2.5 py-2 rounded border border-error/30 bg-error/8 text-error/70 text-[11px] font-mono hover:bg-error/15 hover:text-error transition-colors text-left">
                                Close
                              </button>
                            </div>
                            <div className="mt-2 flex items-center gap-3 text-[10px] font-mono text-muted-light">
                              <span>{fmt(chant.participants)} joined</span>
                              <span>{fmt(chant.ideas)} ideas</span>
                              <span>{chant.cells} cells</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {filteredChants.length === 0 && (
            <div className="text-center py-16 text-muted-light text-sm">No chants found.</div>
          )}

          <div className="h-32" />
        </div>

        {/* ── BOTTOM BAR — drag nav + confirm button ── */}
        {(() => {
          const hasTextInput = pendingInput.trim().length > 0 && pendingInputType
          const hasVoteReady = dockedPostId && dockedPostId !== '__create_chant__' ? getXpTotal(dockedPostId) === 10 : false
          const hasCreateReady = createMode && createQuestion.trim().length >= 2
          const showBar = isDraggingDockstar || hasTextInput || hasVoteReady || hasCreateReady || footerPinned
          const confirmLabel = hasCreateReady && !hasTextInput ? (creating ? 'Creating...' : 'Launch Chant') : hasVoteReady && !hasTextInput ? 'Submit Vote' : pendingInputType === 'idea' ? 'Submit Idea' : pendingInputType === 'comment' ? 'Post Comment' : pendingInputType === 'chat' ? 'Send Message' : pendingInputType === 'challenge' ? 'Submit Challenge' : 'Confirm'
          return (
            <div className={`fixed bottom-0 left-0 right-0 z-[9997] transition-all duration-300 ease-out ${showBar ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
              <div className="bg-header/95 backdrop-blur-sm border-t border-border/50 px-2 py-2 safe-area-bottom">
                {/* Confirm button — text input or vote ready */}
                {(hasTextInput || hasVoteReady || hasCreateReady) && !isDraggingDockstar ? (
                  <div className="flex items-center gap-2 max-w-md mx-auto px-2">
                    <button
                      onClick={() => {
                        if (hasCreateReady) { handleUndock() }
                        else { setPendingInput(''); setPendingInputType(null); setPendingDockContext(null); if (hasVoteReady && dockedPostId) setXpAllocations(prev => { const next = { ...prev }; delete next[dockedPostId]; return next }) }
                      }}
                      data-interactive
                      className="px-3 py-3 rounded text-sm font-mono text-muted-light hover:text-foreground hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (hasCreateReady) { handleCreateSubmit() }
                        else if (hasTextInput) { setPendingInput(''); setPendingInputType(null); setPendingInputTargetId(null); setPendingDockContext(null) }
                        if (hasVoteReady && dockedPostId) { setXpAllocations(prev => { const next = { ...prev }; delete next[dockedPostId]; return next }) }
                      }}
                      disabled={hasCreateReady && creating}
                      data-interactive
                      className="flex-1 py-3 rounded-lg bg-accent text-header font-mono font-bold text-sm shadow-[0_0_16px_rgba(34,211,238,0.4)] hover:bg-accent-hover disabled:opacity-40 transition-colors"
                    >
                      {confirmLabel}
                    </button>
                  </div>
                ) : (
                  /* Nav drop circles — during drag or pinned */
                  <div className="flex items-center justify-around max-w-md mx-auto">
                    {NAV_ITEMS.map(nav => (
                      <NavDropCircle key={nav.id} id={nav.id} label={nav.label} icon={nav.icon} isActive={isDraggingDockstar && nearestDrop === nav.id} registerRef={registerDropZone} glowDrag={isDraggingDockstar && nearestDrop !== nav.id} onClick={footerPinned ? () => handleDock(nav.id) : undefined} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* ── COMMUNITY VIEWER ── */}
        {showCommunityViewer && (
          <div className="fixed inset-0 z-[9990] bg-header/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCommunityViewer(false)}>
            <div className="bg-surface border border-border rounded-lg max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif text-foreground text-sm">Communities</h3>
                <button onClick={() => setShowCommunityViewer(false)} className="text-muted-light hover:text-foreground">&times;</button>
              </div>
              <div className="space-y-1.5">
                {MOCK_COMMUNITIES.filter(c => c !== 'All').map(c => (
                  <button key={c} onClick={() => { setSelectedCommunity(c); setShowCommunityViewer(false) }} className="w-full text-left px-3 py-2 rounded bg-header hover:bg-surface-hover border border-border/30 transition-colors">
                    <div className="text-xs text-foreground">{c}</div>
                    <div className="text-[10px] text-muted-light font-mono">{MOCK_CHANTS.filter(ch => ch.community === c).length} chants</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>{/* end feed */}


      <style jsx global>{`
        @keyframes slideDown {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 2000px; }
        }
        .animate-slideDown { animation: slideDown 0.3s ease-out; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .safe-area-bottom { padding-bottom: env(safe-area-inset-bottom, 8px); }
        @keyframes orbit-dot {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(3px, -2px); }
          50% { transform: translate(-1px, 3px); }
          75% { transform: translate(-3px, -1px); }
        }
        @keyframes subspaceExpand {
          from { opacity: 0; transform: scale(0.92); clip-path: inset(10% 5% 10% 5% round 8px); }
          to { opacity: 1; transform: scale(1); clip-path: inset(0 0 0 0); }
        }
        .animate-subspaceExpand { animation: subspaceExpand 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </DockstarGlowContext.Provider>
  )
}

export default function ChantsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen bg-background text-muted">Loading...</div>}>
      <ChantsPageContent />
    </Suspense>
  )
}
