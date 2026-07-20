'use client'

import { useState, useRef, useCallback, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession, signIn, signOut } from 'next-auth/react'
import { DropCircle, NavDropCircle, DockstarGlowContext } from './Dockstar'
import IdeaSubspace from './IdeaSubspace'
import TransitionOverlay from './TransitionOverlay'
import ShareMenu from '@/components/ShareMenu'
import { usePresence } from './usePresence'
import { useUserspace } from './spatial/useUserspace'
import { useChantsFeed } from './useChantsFeed'
import { useChantDetail } from './useChantDetail'
import type { Chant } from './useChantsFeed'
import { useInactivityTimer } from './useInactivityTimer'
import { useAdmin } from '@/hooks/useAdmin'
import AuthOverlay from '@/components/AuthOverlay'
import WelcomeGuide from '@/components/WelcomeGuide'
import MarkdownEditor from '@/components/MarkdownEditor'
import ReactMarkdown from 'react-markdown'

// ── PRESENCE COLORS (deterministic from user ID) ──
const PRESENCE_COLORS = [
  '#f472b6', // pink
  '#fb923c', // orange
  '#34d399', // emerald
  '#fbbf24', // amber
  '#60a5fa', // blue
  '#f87171', // red
  '#2dd4bf', // teal
  '#4ade80', // green
  '#e879f9', // fuchsia
  '#facc15', // yellow
]
function presenceColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length]
}

// ── PRESENCE EYE (small eye icon with drift animation) ──
function PresenceEye({ color, name, style, className }: { color: string; name: string; style?: React.CSSProperties; className?: string }) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0
  const seed = Math.abs(h)
  return (
    <div
      className={`${className || ''}`}
      style={{
        ...style,
        filter: `drop-shadow(0 0 3px ${color}80)`,
        animation: `presence-drift ${2.5 + (seed % 200) / 100}s ease-in-out infinite`,
        animationDelay: `${-((seed >> 8) % 300) / 100}s`,
      }}
      title={name}
    >
      <svg width="12" height="8" viewBox="0 0 20 14" fill="none">
        <path d="M10 0C4 0 0 7 0 7s4 7 10 7 10-7 10-7S16 0 10 0z" fill="#e2e8f0" stroke={color} strokeWidth="1.5" />
        <ellipse cx="10" cy="7" rx="3.5" ry="3.5" fill={color} />
        <ellipse cx="10" cy="7" rx="1.5" ry="1.5" fill="#020617" />
      </svg>
    </div>
  )
}

// ── NAV ITEMS (bottom bar drop spots) ──

const NAV_ITEMS = [
  { id: '__nav_chants__', label: 'Chants', href: '/chants', color: '#22d3ee', icon: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1.001A3.75 3.75 0 0012 18z" />
    </svg>
  )},
  { id: '__nav_podiums__', label: 'Podiums', href: '/podiums', color: '#a78bfa', icon: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
    </svg>
  )},
  { id: '__nav_groups__', label: 'Groups', href: '/groups', color: '#fbbf24', icon: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  )},
  { id: '__nav_how__', label: 'How', href: '/how', color: '#e2e8f0', icon: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
    </svg>
  )},
]

// ── HELPERS ──

function phaseBadge(phase: string, tier: number) {
  switch (phase) {
    case 'VOTING': return { label: 'Voting Phase', sublabel: tier > 0 ? `T${tier}` : '', color: 'bg-warning/15 text-warning border-warning/30' }
    case 'SUBMISSION': return { label: 'Submission Phase', sublabel: '', color: 'bg-accent/15 text-accent border-accent/30' }
    case 'COMPLETED': return { label: 'Winner', sublabel: '', color: 'bg-success/15 text-success border-success/30' }
    default: return { label: phase, sublabel: '', color: 'bg-surface text-muted border-border' }
  }
}

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return n.toString()
}

// ── CREATE DROP ZONE — orb-sized circle, drop target + tappable ──

function CreateDropZone({ id, isActive, isDocked, userInitial, registerRef, onClick, glowDrag, accentColor }: { id: string; isActive: boolean; isDocked?: boolean; userInitial?: string; registerRef: (id: string, el: HTMLElement | null) => void; onClick: () => void; glowDrag: boolean; accentColor?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const ac = accentColor || '#22d3ee'
  useEffect(() => {
    registerRef(id, ref.current)
    return () => registerRef(id, null)
  }, [id, registerRef])
  return (
    <div
      ref={ref}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); (document.activeElement as HTMLElement)?.blur(); onClick() }}
      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer select-none transition-all duration-200 text-header ${glowDrag ? 'border-[#f59e0b]/60 bg-[#f59e0b]/10 text-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.3)]' : ''}`}
      style={!glowDrag ? {
        backgroundColor: ac,
        borderColor: ac,
        boxShadow: isDocked || isActive ? `0 0 12px ${ac}66` : undefined,
        transform: isActive ? 'scale(1.1)' : undefined,
      } : undefined}
    >
      {isDocked ? (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      ) : (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
      )}
    </div>
  )
}

// ── MAIN PAGE ──

function ChantsPageContent() {
  // ── Data hooks ──
  const { data: session, status: sessionStatus, update: updateSession } = useSession()
  const { isAdmin } = useAdmin()
  const searchParams = useSearchParams()
  const { chants, loading: feedLoading, error: feedError, refresh: refreshFeed, prepend: prependChant } = useChantsFeed()
  const [dockedPostId, setDockedPostId] = useState<string | null>(searchParams.get('dock'))
  const chantDetailId = dockedPostId === '__create_chant__' || dockedPostId?.startsWith('podium:') || dockedPostId?.startsWith('group:') ? null : dockedPostId
  const { detail, loading: detailLoading, error: detailError, refresh: refreshDetail, submitVote, submitIdea, joinChant, leaveChant } = useChantDetail(chantDetailId, !session?.user)
  const autoAnonRef = useRef(false)

  // ── Auto-anonymous: create temp account so unauthenticated users can browse/dock ──
  useEffect(() => {
    if (sessionStatus !== 'unauthenticated' || autoAnonRef.current) return
    autoAnonRef.current = true
    ;(async () => {
      try {
        const res = await fetch('/api/anonymous', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto: true }),
        })
        if (!res.ok) { autoAnonRef.current = false; return }
        const { email, password } = await res.json()
        const result = await signIn('credentials', { email, password, redirect: false })
        if (result?.error) autoAnonRef.current = false
      } catch {
        autoAnonRef.current = false
      }
    })()
  }, [sessionStatus])

  // ── Feed state ──
  const [dockedIdeaId, setDockedIdeaId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'new' | 'hot' | 'top'>('new')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'chants' | 'podiums' | 'groups' | 'profile'>('chants')
  const [podiums, setPodiums] = useState<{ id: string; title: string; body: string; views: number; pinned?: boolean; createdAt: string; author: { id?: string; name: string | null }; deliberation: { id: string; question: string } | null }[]>([])
  const [podiumsLoading, setPodiumsLoading] = useState(false)
  const [groups, setGroups] = useState<{ id: string; name: string; slug: string; description: string | null; isPublic: boolean; _count: { members: number; deliberations: number }; creator: { name: string | null } }[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [profileData, setProfileData] = useState<{
    id: string; name: string; image: string | null; bio: string | null; joinedAt: string; totalXP: number
    followersCount: number; followingCount: number
    stats: {
      ideas: number; votes: number; comments: number; deliberationsCreated: number; deliberationsJoined: number
      deliberationsVotedIn: number; totalPredictions: number; correctPredictions: number; accuracy: number | null
      championPicks: number; currentStreak: number; bestStreak: number; ideasWon: number; winRate: number | null  // prediction fields always 0 (removed from User model)
      highestTierReached: number; ideasAdvanced: number; tierBreakdown: Array<{ tier: number; count: number }>
      highestUpPollinateTier: number; totalUpvotesReceived: number; totalCommentUpvotes: number
    }
    recentActivity: Array<{ deliberationId: string; question: string; phase: string; lastActive: string }>
    recentIdeas: Array<{ id: string; text: string; status: string; deliberationId: string; question: string; createdAt: string }>
  } | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileView, setProfileView] = useState<'me' | 'friends'>('me')
  const [friendsList, setFriendsList] = useState<{ id: string; name: string; image: string | null; bio: string | null }[] | null>(null)
  const [friendsLoading, setFriendsLoading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [xpAllocations, setXpAllocations] = useState<Record<string, Record<string, number>>>({})
  const [nearestDrop, setNearestDrop] = useState<string | null>(null)
  const [isDraggingDockstar, setIsDraggingDockstar] = useState(false)
  const [dockstarDragPos, setDockstarDragPos] = useState<{ x: number; y: number } | null>(null)
  const [scrollY, setScrollY] = useState(0)
  const [manageMode, setManageMode] = useState(false)
  const [manageMsg, setManageMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [startingVoting, setStartingVoting] = useState(false)
  const [dockedPostVisible, setDockedPostVisible] = useState(true)
  const [flashDocks, setFlashDocks] = useState(false)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [externalDragStart, setExternalDragStart] = useState<{ x: number; y: number } | null>(null)
  // undockingAnim removed — was set but never read
  // ── SPATIAL UNIVERSE STATE ──
  const [viewMode, setViewMode] = useState<'feed' | 'spatial'>('feed')
  const [dockstarRotation, setDockstarRotation] = useState(0)
  const [dockedUserspace, setDockedUserspace] = useState<{ userId: string; userName: string; userColor: string } | null>(null)
  const [spatialState, setSpatialState] = useState<{ mode: 'lobby' | 'list' | 'player'; listTab?: string | null; playerName?: string | null; canGoBack: boolean }>({ mode: 'lobby', canGoBack: false })
  const [followingIds, setFollowingIds] = useState<string[]>([])

  const [pendingInput, setPendingInput] = useState<string>('')
  const [pendingInputType, setPendingInputType] = useState<'comment' | 'idea' | 'chat' | null>(null)
  const [pendingDockContext, setPendingDockContext] = useState<{ postId: string; ideaId: string | null } | null>(null)
  const [pendingInputTargetId, setPendingInputTargetId] = useState<string | null>(null)
  const [createMode, setCreateMode] = useState(false)
  const [createQuestion, setCreateQuestion] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [createCommunityId, setCreateCommunityId] = useState<string | null>(null)
  const [createPodiumContextId, setCreatePodiumContextId] = useState<string | null>(null)
  const [userGroups, setUserGroups] = useState<{ id: string; name: string; slug: string }[]>([])
  const [userGroupsLoaded, setUserGroupsLoaded] = useState(false)
  const [groupCreateOpen, setGroupCreateOpen] = useState(false)
  const [groupCreateQuestion, setGroupCreateQuestion] = useState('')
  const [groupCreateDescription, setGroupCreateDescription] = useState('')
  const [groupCreating, setGroupCreating] = useState(false)
  const [groupCreateError, setGroupCreateError] = useState('')
  const [groupCreatePodiumContextId, setGroupCreatePodiumContextId] = useState<string | null>(null)
  // Podium create state
  const [createPodiumTitle, setCreatePodiumTitle] = useState('')
  const [createPodiumBody, setCreatePodiumBody] = useState('')
  const [createPodiumDelibId, setCreatePodiumDelibId] = useState<string | null>(null)
  const [createPodiumDelibSearch, setCreatePodiumDelibSearch] = useState('')
  // Group create state
  const [createGroupName, setCreateGroupName] = useState('')
  const [createGroupDescription, setCreateGroupDescription] = useState('')
  const [createGroupPublic, setCreateGroupPublic] = useState(true)
  // Podium docking state
  const [dockedPodium, setDockedPodium] = useState<{ id: string; title: string; body: string; views: number; createdAt: string; author: { id: string; name: string | null; image: string | null }; deliberation: { id: string; question: string; phase: string; _count: { members: number; ideas: number } } | null } | null>(null)
  const [podiumSettingsOpen, setPodiumSettingsOpen] = useState(false)
  const [podiumSettingsForm, setPodiumSettingsForm] = useState({ title: '', body: '' })
  const [podiumSettingsSaving, setPodiumSettingsSaving] = useState(false)
  const [podiumSettingsMsg, setPodiumSettingsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [dockedPodiumLoading, setDockedPodiumLoading] = useState(false)
  const [podiumCommentPreview, setPodiumCommentPreview] = useState<{ id: string; text: string; createdAt: string; user: { name: string | null } }[]>([])
  // Group docking state
  const [dockedGroup, setDockedGroup] = useState<{ id: string; name: string; slug: string; description: string | null; isPublic: boolean; userRole: string | null; _count: { members: number; deliberations: number }; creator: { name: string | null }; members: { user: { id: string; name: string; image: string | null } }[]; deliberations: { id: string; question: string; phase: string; creator?: { id: string; name: string | null }; _count: { members: number; ideas: number } }[]; _private_gate?: boolean } | null>(null)
  const [dockedGroupLoading, setDockedGroupLoading] = useState(false)
  const [activeSubspaceId, setActiveSubspaceId] = useState<string | null>(null)
  const [joiningGroup, setJoiningGroup] = useState(false)
  const [groupNotice, setGroupNotice] = useState<string | null>(null)
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false)
  const [groupSettingsForm, setGroupSettingsForm] = useState({ name: '', description: '', isPublic: true })
  const [groupSettingsSaving, setGroupSettingsSaving] = useState(false)
  const [groupSettingsMsg, setGroupSettingsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [groupInviteCode, setGroupInviteCode] = useState<string | null>(null)
  const [groupInviteLoading, setGroupInviteLoading] = useState(false)
  const [groupChatPreview, setGroupChatPreview] = useState<{ id: string; text: string; user: { name: string | null } }[]>([])
  const [bookmarks, setBookmarks] = useState<string[]>([])
  const [submittingVote, setSubmittingVote] = useState(false)
  const [submittingIdea, setSubmittingIdea] = useState(false)
  const [submittedIdeas, setSubmittedIdeas] = useState<Record<string, string>>({})
  const [kickedMessage, setKickedMessage] = useState(false)

  // Welcome guide state
  const [welcomeGuideOpen, setWelcomeGuideOpen] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('welcome-guide-seen')) {
      setWelcomeGuideOpen(true)
    }
  }, [])

  // Auth overlay state
  const [authOverlayOpen, setAuthOverlayOpen] = useState(false)
  const [authCallbackAction, setAuthCallbackAction] = useState<(() => void) | null>(null)

  const requireAuth = useCallback((action: () => void) => {
    if (session?.user && !session.user.isTemp) { action(); return }
    setAuthCallbackAction(() => action)
    setAuthOverlayOpen(true)
  }, [session])

  const handleAuthSuccess = useCallback(async () => {
    setAuthOverlayOpen(false)
    // Refresh session to clear isTemp flag after upgrade/sign-in
    await updateSession({ isTemp: false })
    // Execute pending action after a brief delay for session to update
    if (authCallbackAction) {
      setTimeout(() => { authCallbackAction(); setAuthCallbackAction(null) }, 500)
    }
  }, [authCallbackAction, updateSession])

  // Temp accounts can browse but not act — they need proper sign-in to submit/vote
  const needsAuth = !session?.user || !!session.user.isTemp

  // Build callbackUrl preserving current dock state
  const authCallbackUrl = dockedPostId ? `/chants?dock=${encodeURIComponent(dockedPostId)}` : '/chants'

  const dropZoneRefs = useRef<Map<string, HTMLElement>>(new Map())
  const instanceCanvasRefs = useRef<Map<string, HTMLElement>>(new Map())

  // ── PRESENCE ──
  const currentInstance = viewMode === 'spatial'
    ? (spatialState.mode === 'player' && dockedUserspace
      ? `spatial:player:${dockedUserspace.userId}`
      : 'spatial:lobby')
    : activeSubspaceId
    ? (activeSubspaceId.startsWith('podiumchat:') || activeSubspaceId.startsWith('groupchat:'))
      ? `subspace:${activeSubspaceId}`
      : `subspace:${dockedPostId}:${activeSubspaceId}`
    : dockedIdeaId
    ? `idea:${dockedPostId}:${dockedIdeaId}`
    : dockedPostId || `list:${activeTab}`

  const presenceUserId = session?.user?.id || 'anon'
  const presenceName = session?.user?.name || 'You'

  const { players: presencePlayers, transitions, moveToPosition, socketRef } = usePresence({
    userId: presenceUserId,
    name: presenceName,
    color: '#22d3ee',
    currentInstance,
  })

  const {
    activeSubspaces,
    hostNavState,
    visitors,
    enterUserspace,
    leaveUserspace,
    broadcastNavUpdate,
  } = useUserspace({ socketRef, userId: presenceUserId, connected: true })

  const [selfRatio, setSelfRatio] = useState<{ rx: number; ry: number }>({ rx: 0.5, ry: 0.5 })

  // Get players at an instance, optionally aggregating child instances (for feed-level views)
  const getInstancePlayers = useCallback((instanceId: string, aggregate = false) => {
    if (!aggregate) {
      // Precise mode — exact instance only (for inside docked views)
      const remote = (presencePlayers.get(instanceId) || []).filter(p => p.id !== presenceUserId)
      if (instanceId === currentInstance) {
        return [{ id: presenceUserId, name: presenceName, color: '#22d3ee', isSelf: true, rx: selfRatio.rx, ry: selfRatio.ry }, ...remote]
      }
      return remote
    }

    // Aggregate mode — include child instances (for feed cards / nav items)
    const isChild = (key: string) => {
      if (key === instanceId) return true
      // podium:X includes subspace:podiumchat:X
      if (instanceId.startsWith('podium:')) return key === `subspace:podiumchat:${instanceId.slice(7)}`
      // group:slug includes subspace:groupchat:slug
      if (instanceId.startsWith('group:')) return key === `subspace:groupchat:${instanceId.slice(6)}`
      // list:chants includes all chant IDs + their subspaces/ideas (anything not podium/group/list)
      if (instanceId === 'list:chants') return !key.startsWith('list:') && !key.startsWith('podium:') && !key.startsWith('group:') && !key.startsWith('subspace:podiumchat:') && !key.startsWith('subspace:groupchat:')
      // list:podiums includes all podium:* and subspace:podiumchat:*
      if (instanceId === 'list:podiums') return key.startsWith('podium:') || key.startsWith('subspace:podiumchat:')
      // list:groups includes all group:* and subspace:groupchat:*
      if (instanceId === 'list:groups') return key.startsWith('group:') || key.startsWith('subspace:groupchat:')
      // chant ID (raw cuid) — children are subspace:{chantId}:{ideaId} and idea:{chantId}:{ideaId}
      if (!instanceId.startsWith('list:') && !instanceId.startsWith('podium:') && !instanceId.startsWith('group:') && !instanceId.startsWith('subspace:')) {
        return key.startsWith(`subspace:${instanceId}:`) || key.startsWith(`idea:${instanceId}:`)
      }
      return false
    }

    const seen = new Set<string>()
    const result: { id: string; name: string; color: string; isSelf?: boolean; rx?: number; ry?: number }[] = []

    // Check if self is in this hierarchy
    if (isChild(currentInstance)) {
      result.push({ id: presenceUserId, name: presenceName, color: '#22d3ee', isSelf: true, rx: selfRatio.rx, ry: selfRatio.ry })
      seen.add(presenceUserId)
    }

    for (const [key, players] of presencePlayers.entries()) {
      if (isChild(key)) {
        for (const p of players) {
          if (p.id !== presenceUserId && !seen.has(p.id)) {
            seen.add(p.id)
            result.push(p)
          }
        }
      }
    }

    return result
  }, [presencePlayers, currentInstance, selfRatio, presenceUserId, presenceName])

  const registerInstanceCanvas = useCallback((id: string, el: HTMLElement | null) => {
    if (el) instanceCanvasRefs.current.set(id, el)
    else instanceCanvasRefs.current.delete(id)
  }, [])

  const activeDockTarget = dockedPostId === '__create_chant__' ? '__create_chant__' : dockedIdeaId ? `idea:${dockedIdeaId}` : dockedPostId

  // Handle initial dock from URL param (podium:/group: prefixes)
  useEffect(() => {
    const initial = searchParams.get('dock')
    if (!initial) return
    if (initial.startsWith('podium:')) {
      const podiumId = initial.slice(7)
      setActiveTab('podiums')
      setDockedPodiumLoading(true)
      fetch(`/api/podiums/${podiumId}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            setDockedPodium(data)
            fetch(`/api/podiums/${data.id}/comments`)
              .then(r => r.ok ? r.json() : null)
              .then(c => { if (c?.comments) setPodiumCommentPreview(c.comments.slice(-10)) })
              .catch(() => {})
          }
        })
        .catch(() => {})
        .finally(() => setDockedPodiumLoading(false))
    } else if (initial.startsWith('group:')) {
      const slug = initial.slice(6)
      setActiveTab('groups')
      setDockedGroupLoading(true)
      fetch(`/api/communities/${slug}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            setDockedGroup(data)
            if (data.userRole) {
              fetch(`/api/communities/${data.slug}/chat`)
                .then(r => r.ok ? r.json() : null)
                .then(chat => { if (chat?.messages) setGroupChatPreview(chat.messages.slice(-3)) })
                .catch(() => {})
            }
          }
        })
        .catch(() => {})
        .finally(() => setDockedGroupLoading(false))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── BROWSER HISTORY (back/forward button support) ──
  const isRestoringHistoryRef = useRef(false)
  const lastHistoryKeyRef = useRef('')
  const historyRafRef = useRef(0)
  const currentNavRef = useRef({ dock: dockedPostId as string | null, subspace: activeSubspaceId as string | null, tab: activeTab as string })

  // Replace initial history entry with current state
  useEffect(() => {
    const initial = searchParams.get('dock') || null
    const state = { dock: initial, subspace: null as string | null, tab: 'chants' }
    window.history.replaceState(state, '')
    lastHistoryKeyRef.current = JSON.stringify(state)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep current nav state in ref for popstate handler (avoids stale closures)
  useEffect(() => {
    currentNavRef.current = { dock: dockedPostId, subspace: activeSubspaceId, tab: activeTab }
  }, [dockedPostId, activeSubspaceId, activeTab])

  // Push history entry when navigation state changes (batched via rAF to coalesce rapid updates)
  useEffect(() => {
    cancelAnimationFrame(historyRafRef.current)
    historyRafRef.current = requestAnimationFrame(() => {
      if (isRestoringHistoryRef.current) {
        isRestoringHistoryRef.current = false
        lastHistoryKeyRef.current = JSON.stringify({ dock: dockedPostId, subspace: activeSubspaceId, tab: activeTab })
        return
      }
      const state = { dock: dockedPostId, subspace: activeSubspaceId, tab: activeTab }
      const key = JSON.stringify(state)
      if (key === lastHistoryKeyRef.current) return
      lastHistoryKeyRef.current = key
      const url = new URL(window.location.href)
      if (dockedPostId) url.searchParams.set('dock', dockedPostId)
      else url.searchParams.delete('dock')
      window.history.pushState(state, '', url.pathname + url.search)
    })
    return () => cancelAnimationFrame(historyRafRef.current)
  }, [dockedPostId, activeSubspaceId, activeTab])

  // Handle browser back/forward buttons
  useEffect(() => {
    const onPopstate = (e: PopStateEvent) => {
      isRestoringHistoryRef.current = true
      const s = e.state as { dock?: string | null; subspace?: string | null; tab?: string } | null
      const targetDock = s?.dock ?? null
      const targetSubspace = s?.subspace ?? null
      const targetTab = (s?.tab || 'chants') as typeof activeTab
      const cur = currentNavRef.current

      if (!targetDock && cur.dock) {
        // Back to feed — clean undock without confirmation
        setDockedPostId(null)
        setDockedIdeaId(null)
        setActiveSubspaceId(null)
        setDockedPodium(null)
        setDockedGroup(null)
        setCreateMode(false)
        setXpAllocations({})
        setPendingInput('')
        setPendingInputType(null)
        setManageMode(false)
        setGroupCreateOpen(false)
        setGroupSettingsOpen(false)
        setPodiumSettingsOpen(false)
        refreshFeed()
      } else if (!targetSubspace && cur.subspace && targetDock === cur.dock) {
        // Back from subspace to docked view
        setActiveSubspaceId(null)
        setDockedIdeaId(null)
      } else if (targetDock && targetDock !== cur.dock) {
        // Re-dock (forward button or dock-to-dock navigation)
        setDockedPostId(targetDock)
        setDockedIdeaId(null)
        setActiveSubspaceId(targetSubspace)
        setDockedPodium(null)
        setDockedGroup(null)
        setCreateMode(targetDock === '__create_chant__')
        if (targetDock.startsWith('podium:')) {
          const pid = targetDock.slice(7)
          setDockedPodiumLoading(true)
          fetch(`/api/podiums/${pid}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => {
              if (d) {
                setDockedPodium(d)
                fetch(`/api/podiums/${d.id}/comments`).then(r => r.ok ? r.json() : null).then(c => { if (c?.comments) setPodiumCommentPreview(c.comments.slice(-10)) }).catch(() => {})
              }
            })
            .finally(() => setDockedPodiumLoading(false))
        } else if (targetDock.startsWith('group:')) {
          const slug = targetDock.slice(6)
          setDockedGroupLoading(true)
          fetch(`/api/communities/${slug}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setDockedGroup(d) })
            .finally(() => setDockedGroupLoading(false))
        }
      } else if (targetSubspace && targetSubspace !== cur.subspace) {
        // Re-enter subspace (forward button)
        setActiveSubspaceId(targetSubspace)
        setDockedIdeaId(targetSubspace)
      }

      if (targetTab !== cur.tab) {
        setActiveTab(targetTab)
      }
    }
    window.addEventListener('popstate', onPopstate)
    return () => window.removeEventListener('popstate', onPopstate)
  }, [refreshFeed])

  // Fetch podiums when tab active
  useEffect(() => {
    if (activeTab !== 'podiums' || podiums.length > 0) return
    setPodiumsLoading(true)
    fetch('/api/podiums?limit=20')
      .then(r => r.json())
      .then(data => setPodiums(data.items || []))
      .catch(() => {})
      .finally(() => setPodiumsLoading(false))
  }, [activeTab, podiums.length])

  // Also fetch podiums when create form opens (for podium context selector)
  useEffect(() => {
    if ((!createMode && !groupCreateOpen) || podiums.length > 0) return
    fetch('/api/podiums?limit=20')
      .then(r => r.json())
      .then(data => setPodiums(data.items || []))
      .catch(() => {})
  }, [createMode, groupCreateOpen, podiums.length])

  // Fetch groups when tab active
  useEffect(() => {
    if (activeTab !== 'groups' || groups.length > 0) return
    setGroupsLoading(true)
    fetch('/api/communities?limit=20')
      .then(r => r.json())
      .then(data => setGroups(data.communities || []))
      .catch(() => {})
      .finally(() => setGroupsLoading(false))
  }, [activeTab, groups.length])

  // Fetch profile when tab active
  useEffect(() => {
    if (activeTab !== 'profile' || profileData || needsAuth) return
    setProfileLoading(true)
    fetch('/api/user/me')
      .then(r => r.json())
      .then(me => fetch(`/api/user/${me.user.id}`))
      .then(r => r.json())
      .then(data => setProfileData(data.user))
      .catch(() => {})
      .finally(() => setProfileLoading(false))
  }, [activeTab, profileData, needsAuth])

  // Fetch friends list when switching to friends view
  useEffect(() => {
    if (activeTab !== 'profile' || profileView !== 'friends' || friendsList || needsAuth) return
    setFriendsLoading(true)
    fetch('/api/user/me/following')
      .then(r => r.json())
      .then(data => setFriendsList(data.users || []))
      .catch(() => setFriendsList([]))
      .finally(() => setFriendsLoading(false))
  }, [activeTab, profileView, friendsList, needsAuth])

  // Track scroll
  useEffect(() => {
    const onScroll = () => {
      const sy = window.scrollY
      setScrollY(sy)
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

  useEffect(() => {
    setSelfRatio({ rx: 0.5, ry: 0.5 })
  }, [currentInstance])

  // ── SPATIAL UNIVERSE: Leader-follow effect ──
  // When visiting someone's subspace, mirror their navigation
  useEffect(() => {
    if (!dockedUserspace || !hostNavState) return
    if (hostNavState.dockedPostId !== dockedPostId) {
      setDockedPostId(hostNavState.dockedPostId)
      setDockedIdeaId(null)
      setDockedPostVisible(true)
    }
    if (hostNavState.activeTab && hostNavState.activeTab !== activeTab) {
      setActiveTab(hostNavState.activeTab as typeof activeTab)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostNavState])


  // Spatial (game-world) view retired from the UI — entry point neutralized.
  // The spatial code path remains dormant; this no-op keeps feed as the only mode.
  const toggleSpatial = useCallback(() => {}, [])

  // Browser back button support for spatial view
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      if (e.state?.spatial) {
        setViewMode('spatial')
      } else {
        setViewMode('feed')
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Dock onto a frame in spatial view → switch tab for list data (spatial handles the mode transition internally)
  const handleDockFrame = useCallback((tab: 'chants' | 'podiums' | 'groups') => {
    setActiveTab(tab)
  }, [])

  // Spatial multiplayer — remote players in the lobby
  const spatialPlayers = useMemo(() => {
    // Pull players from the current spatial instance (lobby or a specific player's space)
    const instanceKey = spatialState.mode === 'player' && dockedUserspace
      ? `spatial:player:${dockedUserspace.userId}`
      : 'spatial:lobby'
    const players = presencePlayers.get(instanceKey) || []
    return players
      .filter(p => p.id !== presenceUserId)
      .map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        rx: p.rx ?? 0.5,
        ry: p.ry ?? 0.5,
        rotation: p.rotation ?? 0,
      }))
  }, [presencePlayers, presenceUserId, spatialState.mode, dockedUserspace])

  // Broadcast camera position + rotation to spatial lobby
  const handleSpatialCameraMove = useCallback((camX: number, camY: number, rotation?: number) => {
    // Normalize camera to 0-1 within bounds
    const rx = (camX - (-600)) / 1200  // BOUNDS.minX=-600, range=1200
    const ry = (camY - (-400)) / 800   // BOUNDS.minY=-400, range=800
    moveToPosition(rx, ry, rotation)
  }, [moveToPosition])

  // Enter a user's subspace from spatial canvas
  const handleEnterUserspace = useCallback((userId: string, userName: string, userColor: string) => {
    setDockedUserspace({ userId, userName, userColor })
    setViewMode('feed')
    enterUserspace(userId)
  }, [enterUserspace])

  // Exit current userspace
  const handleExitUserspace = useCallback(() => {
    if (dockedUserspace) {
      leaveUserspace(dockedUserspace.userId)
    }
    setDockedUserspace(null)
  }, [dockedUserspace, leaveUserspace])

  const handlePageClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const isForm = target.closest('input, textarea, select')
    if (isForm) return
    const selection = window.getSelection()
    if (selection && selection.toString().length > 0) return

    const isDockTarget = target.closest('[data-dockstar], [data-dockpoint]')
    const isInteractive = target.closest('button, a, [data-interactive]')

    if (!isDockTarget && !isInteractive) {
      if (dockedPostId && dockedPostId !== '__create_chant__') {
        const instanceEl = activeSubspaceId
          ? document.getElementById('subspace-container')
          : document.getElementById(`chant-${dockedPostId}`)

        if (instanceEl) {
          const rect = instanceEl.getBoundingClientRect()
          const cx = e.clientX, cy = e.clientY

          if (cx < rect.left || cx > rect.right || cy < rect.top || cy > rect.bottom) {
            const clampedX = Math.max(rect.left, Math.min(rect.right, cx))
            const clampedY = Math.max(rect.top, Math.min(rect.bottom, cy))
            const rx = Math.max(0.05, Math.min(0.95, (clampedX - rect.left) / rect.width))
            const ry = Math.max(0.05, Math.min(0.95, (clampedY - rect.top) / rect.height))
            setSelfRatio({ rx, ry })
            moveToPosition(rx, ry)
          }
        }
      }

      setFlashDocks(true)
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
      flashTimeoutRef.current = setTimeout(() => setFlashDocks(false), 600)
    }
  }, [dockedPostId, activeSubspaceId, moveToPosition])

  const registerDropZone = useCallback((id: string, el: HTMLElement | null) => {
    if (el) dropZoneRefs.current.set(id, el)
    else dropZoneRefs.current.delete(id)
  }, [])

  // Refs for spatial-mode variables used in handleDock (which has [session] dep only)
  // Synced directly in render body (not useEffect) to eliminate timing gaps
  const viewModeRef = useRef(viewMode)
  viewModeRef.current = viewMode
  const spatialStateRef = useRef(spatialState)
  spatialStateRef.current = spatialState
  const spatialPlayersRef = useRef(spatialPlayers)
  spatialPlayersRef.current = spatialPlayers
  const activeSubspacesRef = useRef(activeSubspaces)
  activeSubspacesRef.current = activeSubspaces
  const dockedUserspaceRef = useRef(dockedUserspace)
  dockedUserspaceRef.current = dockedUserspace
  const handleDockPlayerRef = useRef<((id: string, name: string, color: string) => void) | null>(null)

  const handleDock = useCallback((id: string) => {
    // In spatial mode, only allow player: and userspace: drops — ignore nav/create/post drops
    if (viewModeRef.current === 'spatial') {
      if (id.startsWith('player:')) {
        const playerId = id.slice(7)
        // Prevent nesting on yourself if already in your own space
        if (playerId === presenceUserId && spatialStateRef.current.mode === 'player' && dockedUserspaceRef.current?.userId === presenceUserId) {
          return
        }
        // Self dock — enter your own space
        if (playerId === presenceUserId) {
          handleDockPlayerRef.current?.(presenceUserId, presenceName, '#22d3ee')
          return
        }
        const player = spatialPlayersRef.current.find(p => p.id === playerId)
        if (player) {
          handleDockPlayerRef.current?.(playerId, player.name, player.color)
        }
        return
      }
      if (id.startsWith('userspace:')) {
        const userId = id.slice(10)
        const node = activeSubspacesRef.current.find(n => n.userId === userId)
        if (node) {
          handleDockPlayerRef.current?.(userId, node.hostName, node.hostColor)
        } else {
          enterUserspace(userId)
        }
        return
      }
      // Nav drops in spatial → exit spatial, go to inline list
      if (id === '__nav_chants__') { setViewMode('feed'); setActiveTab('chants'); return }
      if (id === '__nav_podiums__') { setViewMode('feed'); setActiveTab('podiums'); return }
      if (id === '__nav_groups__') { setViewMode('feed'); setActiveTab('groups'); return }
      // Chant/podium/group drops in spatial → exit spatial, dock to that item
      if (id && !id.startsWith('__')) {
        setViewMode('feed')
        // Fall through to normal dock logic below
      } else {
        return
      }
    }
    if (dockedPostId && id !== dockedPostId && !id.startsWith('idea:')) {
      const hasUnsavedText = pendingInput.trim().length > 0
      const hasUnsavedCreate = createMode && (createQuestion.trim().length > 0 || createPodiumTitle.trim().length > 0 || createGroupName.trim().length > 0)
      const hasUnsavedVotes = dockedPostId !== '__create_chant__' && !dockedPostId.startsWith('podium:') && !dockedPostId.startsWith('group:') && Object.values(xpAllocations[dockedPostId] || {}).some(v => v > 0)
      if ((hasUnsavedText || hasUnsavedCreate || hasUnsavedVotes) && !window.confirm('You have unsubmitted work. Leave and discard?')) return
    }
    // Spatial: dock into a user's subspace
    if (id.startsWith('userspace:')) {
      const userId = id.slice(10)
      const node = activeSubspaces.find(n => n.userId === userId)
      handleEnterUserspace(userId, node?.hostName || 'User', node?.hostColor || '#22d3ee')
      return
    }
    if (id === '__create_chant__') {
      // If docked on a group, capture group context for chant creation
      const groupContext = dockedPostId?.startsWith('group:') && dockedGroup ? dockedGroup.id : null
      setDockedPostId('__create_chant__')
      setDockedIdeaId(null)
      setDockedPodium(null)
      // Keep dockedGroup if creating from group context
      if (!groupContext) setDockedGroup(null)
      setCreateMode(true)
      setCreateQuestion('')
      setCreateDescription('')
      setCreatePodiumTitle('')
      setCreatePodiumBody('')
      setCreatePodiumDelibId(null)
      setCreatePodiumDelibSearch('')
      setCreateGroupName('')
      setCreateGroupDescription('')
      setCreateGroupPublic(true)
      setCreateCommunityId(groupContext)
      setCreateError('')
      // If creating from group, switch to chants tab for the chant form
      if (groupContext) setActiveTab('chants')
      // Fetch user's groups for the group selector
      if (!userGroupsLoaded) {
        fetch('/api/communities/mine').then(r => r.ok ? r.json() : []).then(data => {
          setUserGroups(Array.isArray(data) ? data.map((g: { id: string; name: string; slug: string }) => ({ id: g.id, name: g.name, slug: g.slug })) : [])
          setUserGroupsLoaded(true)
        }).catch(() => {})
      }
      return
    }
    if (id.startsWith('__nav_')) {
      setDockedPostId(null)
      setDockedIdeaId(null)
      setDockedPodium(null)
      setDockedGroup(null)
      setActiveSubspaceId(null)
      setXpAllocations({})
      setPendingInput('')
      setPendingInputType(null)
      setViewMode('feed')
      if (id === '__nav_profile__') { setActiveTab('profile'); setSearchQuery(''); setSortBy('new'); setSearchOpen(false); return }
      const nav = NAV_ITEMS.find(n => n.id === id)
      if (nav) {
        if (nav.href === '/podiums') { setActiveTab('podiums'); setSearchQuery(''); setSortBy('new'); setSearchOpen(false); return }
        if (nav.href === '/groups') { setActiveTab('groups'); setSearchQuery(''); setSortBy('new'); setSearchOpen(false); return }
        if (nav.href === '/chants') { setActiveTab('chants'); setSearchQuery(''); setSortBy('new'); setSearchOpen(false); return }
        window.location.href = nav.href
      }
      return
    }
    if (id.startsWith('bookmark:')) {
      const ideaId = id.slice(9)
      setBookmarks(prev => prev.includes(ideaId) ? prev : [...prev, ideaId])
      enterSubspace(ideaId)
      return
    }
    if (id.startsWith('groupchat:') || id.startsWith('podiumchat:')) {
      setActiveSubspaceId(id)
      setDockedIdeaId(id)
      setDockedPostVisible(true)
      requestAnimationFrame(() => (document.activeElement as HTMLElement)?.blur())
      return
    }
    if (id.startsWith('idea:')) {
      const ideaId = id.slice(5)
      setDockedIdeaId(ideaId)
      setActiveSubspaceId(ideaId)
      setBookmarks(prev => prev.includes(ideaId) ? prev : [...prev, ideaId])
      setDockedPostVisible(true)
      requestAnimationFrame(() => (document.activeElement as HTMLElement)?.blur())
      return
    }
    if (id.startsWith('podium:')) {
      const podiumId = id.slice(7)
      setDockedPostId(id)
      setDockedIdeaId(null)
      setDockedGroup(null)
      setActiveSubspaceId(null)
      setCreateMode(false)
      setDockedPodiumLoading(true)
      setDockedPodium(null)
      setPodiumCommentPreview([])
      fetch(`/api/podiums/${podiumId}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            setDockedPodium(data)
            fetch(`/api/podiums/${data.id}/comments`)
              .then(r => r.ok ? r.json() : null)
              .then(c => { if (c?.comments) setPodiumCommentPreview(c.comments.slice(-10)) })
              .catch(() => {})
          }
        })
        .catch(() => {})
        .finally(() => setDockedPodiumLoading(false))
      return
    }
    if (id.startsWith('group:')) {
      const parts = id.slice(6)
      // parts is slug
      setDockedPostId(id)
      setDockedIdeaId(null)
      setDockedPodium(null)
      setActiveSubspaceId(null)
      setCreateMode(false)
      setDockedGroupLoading(true)
      setDockedGroup(null)
      setGroupChatPreview([])
      fetch(`/api/communities/${parts}`)
        .then(async r => {
          if (r.ok) return r.json()
          // Private group — try to get preview info
          if (r.status === 404) {
            const preview = await fetch(`/api/communities/${parts}/preview`).then(r2 => r2.ok ? r2.json() : null).catch(() => null)
            if (preview) return { ...preview, _private_gate: true }
          }
          return null
        })
        .then(data => {
          if (data) {
            if (data._private_gate) {
              setDockedGroup({ id: data.id, name: data.name, slug: parts, description: data.description, isPublic: false, userRole: null, _count: data._count || { members: 0, deliberations: 0 }, creator: data.creator || { name: null }, members: [], deliberations: [], _private_gate: true })
            } else {
              setDockedGroup({ ...data, _private_gate: false })
              if (data.userRole) {
                fetch(`/api/communities/${data.slug}/chat`)
                  .then(r => r.ok ? r.json() : null)
                  .then(chat => { if (chat?.messages) setGroupChatPreview(chat.messages.slice(-3)) })
                  .catch(() => {})
              }
            }
          }
        })
        .catch(() => {})
        .finally(() => setDockedGroupLoading(false))
      return
    }
    setCreateMode(false)
    setDockedPodium(null)
    setDockedGroup(null)
    setActiveSubspaceId(null)
    setDockedPostId(id)
    setDockedIdeaId(null)
    setDockedPostVisible(true)
    setActiveTab('chants')
    requestAnimationFrame(() => {
      const el = document.getElementById(`chant-${id}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [session])

  // Force undock — no confirmation dialog (used by inactivity kick)
  const forceUndock = useCallback(() => {
    if (dockedPostId && dockedPostId !== '__create_chant__' && !dockedPostId.startsWith('podium:') && !dockedPostId.startsWith('group:')) {
      leaveChant()
    }
    setActiveSubspaceId(null)
    setDockedPostId(null)
    setDockedIdeaId(null)
    setDockedPodium(null)
    setDockedGroup(null)
    setXpAllocations({})
    setPendingInput('')
    setPendingInputType(null)
    setCreateMode(false)
    setManageMode(false)
    setGroupCreateOpen(false)
    setGroupSettingsOpen(false)
    setPodiumSettingsOpen(false)
    refreshFeed()
  }, [dockedPostId, leaveChant, refreshFeed])

  const handleUndock = useCallback(() => {
    if (dockedPostId) {
      const hasUnsavedText = pendingInput.trim().length > 0
      const hasUnsavedCreate = createMode && (createQuestion.trim().length > 0 || createPodiumTitle.trim().length > 0 || createGroupName.trim().length > 0)
      const hasUnsavedVotes = dockedPostId !== '__create_chant__' && !dockedPostId.startsWith('podium:') && !dockedPostId.startsWith('group:') && Object.values(xpAllocations[dockedPostId] || {}).some(v => v > 0)
      if (hasUnsavedText || hasUnsavedCreate || hasUnsavedVotes) {
        if (!window.confirm('You have unsubmitted work. Leave and discard?')) return
      }
      forceUndock()
    }
  }, [dockedPostId, pendingInput, createMode, createQuestion, createPodiumTitle, createGroupName, xpAllocations, forceUndock])

  // Dock on an item from spatial list view → exit spatial, dock to that chant
  const handleDockItem = useCallback((itemId: string) => {
    setViewMode('feed')
    handleDock(itemId)
  }, [handleDock])

  // Dock on a player in spatial → enter their userspace (stay in spatial)
  const handleDockPlayerFromSpatial = useCallback((id: string, name: string, color: string) => {
    setDockedUserspace({ userId: id, userName: name, userColor: color })
    enterUserspace(id)
  }, [enterUserspace])

  // Sync handleDockPlayerRef (can't be synced in render body — declared after handleDock)
  useEffect(() => {
    handleDockPlayerRef.current = handleDockPlayerFromSpatial
  })

  // Follow host — mirror host's current nav state
  const handleFollowHost = useCallback(() => {
    if (!hostNavState?.dockedPostId) return
    setViewMode('feed')
    viewModeRef.current = 'feed' // sync ref immediately so handleDock doesn't hit spatial branch
    handleDock(hostNavState.dockedPostId)
  }, [hostNavState, handleDock])

  // Clean up userspace when spatial exits player mode (host disconnected, back to lobby, etc.)
  const prevSpatialModeRef = useRef(spatialState.mode)
  useEffect(() => {
    if (prevSpatialModeRef.current === 'player' && spatialState.mode !== 'player' && dockedUserspace) {
      leaveUserspace(dockedUserspace.userId)
      setDockedUserspace(null)
    }
    prevSpatialModeRef.current = spatialState.mode
  }, [spatialState.mode, dockedUserspace, leaveUserspace])

  // Back from spatial entirely — go back in browser history or just exit
  const handleBackFromSpatial = useCallback(() => {
    setViewMode('feed')
    queueMicrotask(() => window.history.pushState({ spatial: false }, '', '/chants'))
  }, [])

  // Build list items for spatial list mode based on active tab
  const spatialListItems = useMemo(() => {
    if (activeTab === 'chants') {
      return chants.map(c => ({
        id: c.id,
        title: c.question,
        phase: c.phase,
        tier: c.tier,
      }))
    }
    if (activeTab === 'podiums') {
      return podiums.map(p => ({
        id: `podium:${p.id}`,
        title: p.title,
      }))
    }
    if (activeTab === 'groups') {
      return groups.map(g => ({
        id: `group:${g.slug}`,
        title: g.name,
      }))
    }
    return []
  }, [activeTab, chants, podiums, groups])

  const handleCreateSubmit = useCallback(async () => {
    const q = createQuestion.trim()
    if (!q || q.length < 2) { setCreateError('Question must be at least 2 characters'); return }
    setCreating(true)
    setCreateError('')
    try {
      const res = await fetch('/api/deliberations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, description: createDescription.trim() || undefined, ...(createCommunityId ? { communityId: createCommunityId } : {}), ...(createPodiumContextId ? { podiumContextId: createPodiumContextId } : {}) }),
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
      setCreatePodiumContextId(null)
      prependChant({
        id: delib.id,
        question: delib.question,
        description: delib.description || null,
        phase: 'SUBMISSION',
        tier: 0,
        participants: 1,
        ideas: 0,
        cells: 0,
        upvotes: 0,
        community: 'Public',
        creator: 'You',
        createdAt: 'now',
        createdAtRaw: new Date().toISOString(),
        champion: null,
        userHasUpvoted: false,
        isMember: true,
        isCreator: true,
        hasSubmittedIdea: false,
        hasVoted: false,
        viewerCount: 0,
        voteCount: 0,
        isPinned: false,
        tags: [],
        continuousFlow: false,
      })
      setDockedPostId(delib.id)
    } catch {
      setCreateError('Network error')
    } finally {
      setCreating(false)
    }
  }, [createQuestion, createDescription, createCommunityId, createPodiumContextId, prependChant])

  const handlePodiumCreateSubmit = useCallback(async () => {
    const title = createPodiumTitle.trim()
    if (!title) { setCreateError('Title is required'); return }
    setCreating(true)
    setCreateError('')
    try {
      const res = await fetch('/api/podiums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body: createPodiumBody.trim() || '', ...(createPodiumDelibId ? { deliberationId: createPodiumDelibId } : {}) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setCreateError(data.error || 'Failed to create podium')
        return
      }
      const podium = await res.json()
      setCreateMode(false)
      setCreatePodiumTitle('')
      setCreatePodiumBody('')
      setCreatePodiumDelibId(null)
      setCreatePodiumDelibSearch('')
      setPodiums(prev => [{
        id: podium.id,
        title: podium.title,
        body: podium.body,
        views: 0,
        createdAt: new Date().toISOString(),
        author: { name: podium.author?.name || 'You' },
        deliberation: podium.deliberation || null,
      }, ...prev])
      // Dock to the new podium
      setDockedPostId(`podium:${podium.id}`)
      setDockedPodium({ ...podium, views: 0, createdAt: new Date().toISOString() })
    } catch {
      setCreateError('Network error')
    } finally {
      setCreating(false)
    }
  }, [createPodiumTitle, createPodiumBody, createPodiumDelibId])

  const handleGroupCreateSubmit = useCallback(async () => {
    const name = createGroupName.trim()
    if (!name) { setCreateError('Name is required'); return }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
    if (slug.length < 3) { setCreateError('Name must produce a valid slug (at least 3 chars)'); return }
    setCreating(true)
    setCreateError('')
    try {
      const res = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, description: createGroupDescription.trim() || undefined, isPublic: createGroupPublic }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.error === 'PRO_REQUIRED' || data.error === 'PRIVATE_GROUP_LIMIT') {
          setCreateError(data.message || 'Upgrade required for private groups')
        } else {
          setCreateError(data.error || 'Failed to create group')
        }
        return
      }
      const group = await res.json()
      setCreateMode(false)
      setCreateGroupName('')
      setCreateGroupDescription('')
      setCreateGroupPublic(true)
      setGroups(prev => [{
        id: group.id,
        name: group.name,
        slug: group.slug,
        description: group.description,
        isPublic: group.isPublic,
        _count: { members: 1, deliberations: 0 },
        creator: { name: 'You' },
      }, ...prev])
      // Dock to the new group
      setDockedPostId(`group:${group.slug}`)
      setDockedGroup({ ...group, _count: { members: 1, deliberations: 0 }, creator: { name: 'You' }, members: [], deliberations: [] })
    } catch {
      setCreateError('Network error')
    } finally {
      setCreating(false)
    }
  }, [createGroupName, createGroupDescription, createGroupPublic])

  const handleGroupChantCreate = useCallback(async () => {
    if (!dockedGroup) return
    const q = groupCreateQuestion.trim()
    if (!q || q.length < 2) { setGroupCreateError('Question must be at least 2 characters'); return }
    setGroupCreating(true)
    setGroupCreateError('')
    try {
      const res = await fetch('/api/deliberations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, description: groupCreateDescription.trim() || undefined, communityId: dockedGroup.id, ...(groupCreatePodiumContextId ? { podiumContextId: groupCreatePodiumContextId } : {}) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setGroupCreateError(data.error || 'Failed to create chant')
        return
      }
      const delib = await res.json()
      setDockedGroup(prev => prev ? { ...prev, deliberations: [{ id: delib.id, question: delib.question, phase: 'SUBMISSION', _count: { members: 1, ideas: 0 } }, ...prev.deliberations] } : prev)
      setGroupCreateOpen(false)
      setGroupCreateQuestion('')
      setGroupCreateDescription('')
      setGroupCreatePodiumContextId(null)
      prependChant({
        id: delib.id, question: delib.question, description: delib.description || null, phase: 'SUBMISSION', tier: 0, participants: 1, ideas: 0, cells: 0, upvotes: 0,
        community: dockedGroup.name, creator: 'You', createdAt: 'now', createdAtRaw: new Date().toISOString(), champion: null,
        userHasUpvoted: false, isMember: true, isCreator: true, hasSubmittedIdea: false, hasVoted: false, viewerCount: 0, voteCount: 0, isPinned: false, tags: [], continuousFlow: false,
      })
    } catch {
      setGroupCreateError('Network error')
    } finally {
      setGroupCreating(false)
    }
  }, [dockedGroup, groupCreateQuestion, groupCreateDescription, groupCreatePodiumContextId, prependChant])

  // Dock to a chant and directly open manage mode
  const handleDockToSettings = useCallback((id: string, fromGroup?: { question: string; phase: string; community: string; _count?: { members: number; ideas: number } }) => {
    // If coming from group context, ensure the chant is in the feed so the card renders
    if (fromGroup) {
      const exists = chants.some(c => c.id === id)
      if (!exists) {
        prependChant({
          id, question: fromGroup.question, description: null, phase: fromGroup.phase as 'SUBMISSION' | 'VOTING' | 'COMPLETED' | 'ACCUMULATING', tier: 0,
          participants: fromGroup._count?.members || 0, ideas: fromGroup._count?.ideas || 0, cells: 0, upvotes: 0,
          community: fromGroup.community, creator: 'You', createdAt: '', createdAtRaw: new Date().toISOString(),
          champion: null, userHasUpvoted: false, isMember: true, isCreator: true, hasSubmittedIdea: false, hasVoted: false,
          viewerCount: 0, voteCount: 0, isPinned: false, tags: [], continuousFlow: false,
        })
      }
    }
    handleDock(id)
    setManageMode(true)
  }, [handleDock, chants, prependChant])

  const handleDragState = useCallback((dragging: boolean, nearest: string | null) => {
    setIsDraggingDockstar(dragging)
    setNearestDrop(nearest)
  }, [])

  const handleDropCircleDrag = useCallback((x: number, y: number) => {
    setExternalDragStart({ x, y })
  }, [])

  const handleXpChange = useCallback((chantId: string, ideaId: string, value: number) => {
    setXpAllocations(prev => {
      const current = prev[chantId] || {}
      const othersTotal = Object.entries(current).filter(([k]) => k !== ideaId).reduce((s, [, v]) => s + v, 0)
      const capped = Math.min(value, 10 - othersTotal)
      return { ...prev, [chantId]: { ...current, [ideaId]: Math.max(0, capped) } }
    })
  }, [])

  const handleTextInput = useCallback((value: string, type: 'comment' | 'idea' | 'chat', targetId: string) => {
    setPendingInput(value)
    setPendingInputType(type)
    setPendingInputTargetId(targetId)
    if (value.trim().length > 0) {
      setPendingDockContext(prev => prev || { postId: dockedPostId!, ideaId: dockedIdeaId })
    }
  }, [dockedPostId, dockedIdeaId])

  // ── SUBSPACE ──
  const enterSubspace = useCallback((ideaId: string) => {
    if (needsAuth) { requireAuth(() => { setActiveSubspaceId(ideaId); setBookmarks(prev => prev.includes(ideaId) ? prev : [...prev, ideaId]) }); return }
    setActiveSubspaceId(ideaId)
    setBookmarks(prev => prev.includes(ideaId) ? prev : [...prev, ideaId])
  }, [session, dockedPostId])

  const exitSubspace = useCallback(() => {
    setActiveSubspaceId(null)
  }, [])

  // ── DERIVED DATA ──
  const tabAccentColor = activeTab === 'podiums' ? '#a78bfa'
    : activeTab === 'groups' ? '#fbbf24'
    : activeTab === 'profile' ? '#e2e8f0'
    : '#22d3ee'

  const filteredChants = chants
    .filter(c => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return c.question.toLowerCase().includes(q) || c.creator.toLowerCase().includes(q) || c.community.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (sortBy === 'top') return (b.ideas + b.voteCount) - (a.ideas + a.voteCount)
      if (sortBy === 'hot') {
        const diff = b.viewerCount - a.viewerCount
        if (diff !== 0) return diff
        // Fallback: recent activity score (votes + participants + recency)
        const now = Date.now()
        const aAge = (now - new Date(a.createdAtRaw).getTime()) / 3600000 // hours
        const bAge = (now - new Date(b.createdAtRaw).getTime()) / 3600000
        const aScore = (a.voteCount + a.participants) / Math.max(1, Math.pow(aAge / 24, 0.5))
        const bScore = (b.voteCount + b.participants) / Math.max(1, Math.pow(bAge / 24, 0.5))
        return bScore - aScore
      }
      return new Date(b.createdAtRaw).getTime() - new Date(a.createdAtRaw).getTime()
    })

  const filteredPodiums = podiums
    .filter(p => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return p.title.toLowerCase().includes(q) || (p.author?.name || '').toLowerCase().includes(q) || p.body.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (sortBy === 'top') return (b.views || 0) - (a.views || 0)
      if (sortBy === 'hot') {
        const aViewers = getInstancePlayers(`podium:${a.id}`, true).length
        const bViewers = getInstancePlayers(`podium:${b.id}`, true).length
        const diff = bViewers - aViewers
        if (diff !== 0) return diff
        // Fallback: total views as proxy for historical engagement
        return (b.views || 0) - (a.views || 0)
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

  const filteredGroups = groups
    .filter(g => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return g.name.toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q) || (g.creator?.name || '').toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (sortBy === 'top') return (b._count?.members || 0) - (a._count?.members || 0)
      if (sortBy === 'hot') {
        const aViewers = getInstancePlayers(`group:${a.slug}`, true).length
        const bViewers = getInstancePlayers(`group:${b.slug}`, true).length
        const diff = bViewers - aViewers
        if (diff !== 0) return diff
        // Fallback: members + chant activity as proxy
        return ((b._count?.members || 0) + (b._count?.deliberations || 0)) - ((a._count?.members || 0) + (a._count?.deliberations || 0))
      }
      return 0 // default order from API (newest first)
    })

  const getXpTotal = (chantId: string) => {
    const alloc = xpAllocations[chantId] || {}
    return Object.values(alloc).reduce((s, v) => s + v, 0)
  }

  // Get cell ideas for the docked voting chant — user's VOTING cell, or any VOTING cell at current tier as fallback
  const myVotingCell = detail?.cells.find(c => detail.myCellIds.includes(c.id) && c.status === 'VOTING') || null
  const fallbackCell = !myVotingCell && detail?.phase === 'VOTING'
    ? detail.cells.find(c => c.status === 'VOTING' && c.tier === detail.currentTier) || null
    : null
  const dockedCell = myVotingCell || fallbackCell
  const dockedCellIdeas = dockedCell?.ideas || []
  const canVote = !!myVotingCell && !detail?.hasVoted

  // For subspace header: find the idea text/author
  const activeSubspaceIdea = detail?.ideas.find(i => i.id === activeSubspaceId)
  // For docked header
  const dockedChant = chants.find(c => c.id === dockedPostId)
  const isDockedToChant = dockedPostId && dockedPostId !== '__create_chant__' && !dockedPostId.startsWith('podium:') && !dockedPostId.startsWith('group:')

  // ── INACTIVITY TIMER ── (10 min idle = boot, 1 min warning)
  const handleInactivityBoot = useCallback(() => {
    forceUndock()
    setKickedMessage(true)
  }, [forceUndock])

  const { warning: inactivityWarning, secondsLeft: inactivitySecondsLeft, dismissWarning } = useInactivityTimer({
    enabled: !!isDockedToChant && detail?.phase === 'VOTING' && canVote,
    onBoot: handleInactivityBoot,
  })

  // ── VOTE SUBMIT ──
  const handleVoteSubmit = useCallback(async () => {
    if (!dockedPostId || submittingVote) return
    const alloc = xpAllocations[dockedPostId] || {}
    const allocations = Object.entries(alloc)
      .filter(([, pts]) => pts > 0)
      .map(([ideaId, points]) => ({ ideaId, points }))
    if (allocations.length === 0) return

    setSubmittingVote(true)
    try {
      await submitVote(allocations)
      setXpAllocations(prev => { const next = { ...prev }; delete next[dockedPostId]; return next })
    } catch (err) {
      console.error('Vote failed:', err)
    } finally {
      setSubmittingVote(false)
    }
  }, [dockedPostId, xpAllocations, submitVote, submittingVote])

  // ── IDEA SUBMIT ──
  // pendingInput is preserved in state, so after auth completes the callback re-reads it
  const pendingInputRef = useRef(pendingInput)
  pendingInputRef.current = pendingInput
  const dockedPostIdRef = useRef(dockedPostId)
  dockedPostIdRef.current = dockedPostId

  const handleIdeaSubmit = useCallback(async () => {
    if (needsAuth) {
      // Store a callback that submits directly (skips auth check on retry)
      requireAuth(async () => {
        const text = pendingInputRef.current.trim()
        const docked = dockedPostIdRef.current
        if (!text || !docked) return
        setSubmittingIdea(true)
        try {
          await submitIdea(text)
          setSubmittedIdeas(prev => ({ ...prev, [docked]: text }))
          setPendingInput('')
          setPendingInputType(null)
          setPendingInputTargetId(null)
          setPendingDockContext(null)
        } catch (err) {
          console.error('Idea submit failed:', err)
        } finally {
          setSubmittingIdea(false)
        }
      })
      return
    }
    if (!dockedPostId || submittingIdea) return
    const text = pendingInput.trim()
    if (!text) return

    setSubmittingIdea(true)
    try {
      await submitIdea(text)
      setSubmittedIdeas(prev => ({ ...prev, [dockedPostId]: text }))
      setPendingInput('')
      setPendingInputType(null)
      setPendingInputTargetId(null)
      setPendingDockContext(null)
    } catch (err) {
      console.error('Idea submit failed:', err)
    } finally {
      setSubmittingIdea(false)
    }
  }, [needsAuth, dockedPostId, pendingInput, submitIdea, submittingIdea, requireAuth])

  // ── JOIN ──
  const [joining, setJoining] = useState(false)
  const handleJoin = useCallback(async () => {
    if (!dockedPostId || joining) return
    setJoining(true)
    try {
      await joinChant()
      refreshFeed()
    } catch (err) {
      console.error('Join failed:', err)
    } finally {
      setJoining(false)
    }
  }, [dockedPostId, joining, joinChant, refreshFeed])

  // ── START VOTING ──
  const handleStartVoting = useCallback(async () => {
    if (!dockedPostId || startingVoting) return
    setManageMsg(null)
    setStartingVoting(true)
    try {
      const res = await fetch(`/api/deliberations/${dockedPostId}/start-voting`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setManageMsg({ type: 'error', text: data.error || 'Failed to start voting' })
        return
      }
      if (data.reason === 'NO_IDEAS') {
        setManageMsg({ type: 'error', text: 'Need at least 1 idea to start voting' })
      } else if (data.reason === 'INSUFFICIENT_PARTICIPANTS') {
        setManageMsg({ type: 'error', text: 'Need at least 1 participant to start voting' })
      } else if (data.reason === 'SINGLE_IDEA') {
        setManageMsg({ type: 'success', text: 'Only 1 idea, declared champion automatically' })
        refreshDetail()
        setManageMode(false)
      } else {
        setManageMsg({ type: 'success', text: `Voting started! ${data.cellsCreated || ''} cells created` })
        refreshDetail()
        refreshFeed()
        setManageMode(false)
      }
    } catch {
      setManageMsg({ type: 'error', text: 'Network error' })
    } finally {
      setStartingVoting(false)
    }
  }, [dockedPostId, startingVoting, refreshDetail, refreshFeed])

  return (
    <DockstarGlowContext.Provider value={{ nearestDrop, isDragging: isDraggingDockstar }}>
      <div
        className="min-h-screen bg-background text-foreground relative"
        onClick={handlePageClick}
      >
        <TransitionOverlay transitions={transitions} instanceRefs={instanceCanvasRefs} />

        {/* UNIFIED HEADER, same container for all states */}
        <div className="sticky top-0 z-[60] bg-header border-b border-border/30">
          <div className="px-3 py-2.5 flex items-center gap-2.5 max-w-2xl mx-auto min-h-[52px]">
            {activeSubspaceId?.startsWith('podiumchat:') && dockedPodium ? (
              /* PODIUM SUBSPACE state */
              <>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-serif truncate leading-snug" style={{ color: '#a78bfa' }}>
                    {dockedPodium.title}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs mt-0.5">
                    <span className="font-mono" style={{ color: '#a78bfa99' }}>Podium</span>
                    <span className="text-muted-light/50">/</span>
                    <span className="text-muted-light">{dockedPodium.author?.name || 'Anonymous'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    data-interactive
                    onClick={exitSubspace}
                    className="w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors"
                    style={{ borderColor: '#a78bfa4d', backgroundColor: '#a78bfa14' }}
                  >
                    <svg className="w-4 h-4" style={{ color: '#a78bfa' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 19.5L3.75 12l7.5-7.5" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 19.5L12 12l7.5-7.5" /></svg>
                  </button>
                  <ShareMenu url={`/?dock=podium:${dockedPodium.id}`} text={dockedPodium.title} variant="icon" />
                  <DropCircle
                    id={dockedPostId || '__header__'}
                    isActive={false}
                    isDocked={true}
                    userInitial="P"
                    registerRef={registerDropZone}
                    onClick={handleUndock}
                    onDragUndock={handleDropCircleDrag}
                    flashDocks={flashDocks}
                    accentColor="#a78bfa"
                  />
                </div>
              </>
            ) : activeSubspaceId?.startsWith('groupchat:') && dockedGroup ? (
              /* GROUP SUBSPACE state */
              <>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-serif truncate leading-snug" style={{ color: '#fbbf24' }}>
                    {dockedGroup.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs mt-0.5">
                    <span className="font-mono" style={{ color: '#fbbf2499' }}>Group</span>
                    <span className="text-muted-light/50">/</span>
                    <span className="text-muted-light">{fmt(dockedGroup._count.members)} members</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    data-interactive
                    onClick={exitSubspace}
                    className="w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors"
                    style={{ borderColor: '#fbbf244d', backgroundColor: '#fbbf2414' }}
                  >
                    <svg className="w-4 h-4" style={{ color: '#fbbf24' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 19.5L3.75 12l7.5-7.5" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 19.5L12 12l7.5-7.5" /></svg>
                  </button>
                  <ShareMenu url={`/?dock=group:${dockedGroup.slug}`} text={dockedGroup.name} variant="icon" />
                  <DropCircle
                    id={dockedPostId || '__header__'}
                    isActive={false}
                    isDocked={true}
                    userInitial="G"
                    registerRef={registerDropZone}
                    onClick={handleUndock}
                    onDragUndock={handleDropCircleDrag}
                    flashDocks={flashDocks}
                    accentColor="#fbbf24"
                  />
                </div>
              </>
            ) : activeSubspaceId ? (
              /* IDEA SUBSPACE state */
              <>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-serif text-foreground/80 truncate leading-snug">
                    {activeSubspaceIdea?.text || 'Subspace'}
                  </h3>
                  {detail && (
                    <div className="flex items-center gap-1.5 text-xs mt-0.5">
                      <span className="font-mono text-accent">Chant</span>
                      <span className="text-muted-light/50">/</span>
                      <span className="text-muted-light">{detail.creator?.name || 'Anonymous'}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    data-interactive
                    onClick={exitSubspace}
                    className="w-10 h-10 rounded-full border-2 border-accent/30 bg-accent/8 flex items-center justify-center hover:bg-accent/15 hover:border-accent/50 transition-colors"
                  >
                    <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 19.5L3.75 12l7.5-7.5" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 19.5L12 12l7.5-7.5" /></svg>
                  </button>
                  {detail && (
                    <ShareMenu url={`/?dock=${detail.id}`} text={detail.question} variant="icon" />
                  )}
                  <DropCircle
                    id={dockedPostId || '__header__'}
                    isActive={false}
                    isDocked={true}
                    userInitial="G"
                    registerRef={registerDropZone}
                    onClick={handleUndock}
                    onDragUndock={handleDropCircleDrag}
                    flashDocks={flashDocks}
                  />
                </div>
              </>
            ) : isDockedToChant && (dockedChant || detail) ? (
              /* DOCKED state */
              <>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-serif text-foreground/80 truncate leading-snug">
                    {dockedChant?.question || detail?.question || '...'}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs mt-0.5">
                    <span className="font-mono text-accent">{dockedChant?.community || 'Public'}</span>
                    <span className="text-muted-light/50">/</span>
                    <span className="text-muted-light">{dockedChant?.creator || detail?.creator?.name || ''}</span>
                    {/* Presence dots for other users docked to this chant */}
                    {(() => {
                      const chantId = dockedChant?.id || dockedPostId || ''
                      const dockedPeers = getInstancePlayers(chantId, true).filter(p => p.id !== presenceUserId)
                      return dockedPeers.length > 0 ? (
                        <>
                          <span className="text-muted-light/50">&middot;</span>
                          <span className="flex items-center gap-1.5">
                            {dockedPeers.slice(0, 5).map(p => (
                              <PresenceEye key={p.id} color={presenceColor(p.id)} name={p.name} />
                            ))}
                            {dockedPeers.length > 5 && <span className="text-[9px] text-muted-light font-mono">+{dockedPeers.length - 5}</span>}
                          </span>
                        </>
                      ) : null
                    })()}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    data-interactive
                    onClick={handleUndock}
                    className="w-10 h-10 rounded-full border-2 border-accent/30 bg-accent/8 flex items-center justify-center hover:bg-accent/15 hover:border-accent/50 transition-colors"
                  >
                    <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                  </button>
                  <ShareMenu url={`/?dock=${dockedChant?.id || dockedPostId}`} text={dockedChant?.question || detail?.question || ''} variant="icon" />
                  {dockedChant?.isCreator && (
                    <button
                      data-interactive
                      onClick={() => setManageMode(!manageMode)}
                      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors ${manageMode ? 'border-accent bg-accent/20 hover:bg-accent/30' : 'border-accent/30 bg-accent/8 hover:bg-accent/15 hover:border-accent/50'}`}
                    >
                      {manageMode ? (
                        <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      ) : (
                        <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><circle cx="12" cy="12" r="3" /></svg>
                      )}
                    </button>
                  )}
                  <DropCircle
                    id={dockedChant?.id || dockedPostId || ''}
                    isActive={false}
                    isDocked={true}
                    userInitial="G"
                    registerRef={registerDropZone}
                    onClick={handleUndock}
                    onDragUndock={handleDropCircleDrag}
                    flashDocks={flashDocks}
                  />
                </div>
              </>
            ) : dockedPostId?.startsWith('podium:') && dockedPodium ? (
              /* PODIUM DOCKED state — top bar */
              <>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-serif truncate leading-snug" style={{ color: '#a78bfa' }}>
                    {dockedPodium.title}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs mt-0.5">
                    <span style={{ color: '#a78bfa99' }}>{dockedPodium.author?.name || 'Anonymous'}</span>
                    <span className="text-muted-light/40">&middot;</span>
                    <span className="text-muted-light">{fmt(dockedPodium.views)} views</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    data-interactive
                    onClick={handleUndock}
                    className="w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors"
                    style={{ borderColor: '#a78bfa4d', backgroundColor: '#a78bfa14' }}
                  >
                    <svg className="w-4 h-4" style={{ color: '#a78bfa' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                  </button>
                  {dockedPodium.author?.id === session?.user?.id && (
                    <button
                      data-interactive
                      onClick={() => {
                        setPodiumSettingsOpen(o => {
                          if (!o) setPodiumSettingsForm({ title: dockedPodium.title, body: dockedPodium.body })
                          return !o
                        })
                        setPodiumSettingsMsg(null)
                      }}
                      className="w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors"
                      style={{ borderColor: podiumSettingsOpen ? '#a78bfa' : '#a78bfa4d', backgroundColor: podiumSettingsOpen ? '#a78bfa22' : '#a78bfa14' }}
                      title="Podium Settings"
                    >
                      {podiumSettingsOpen ? (
                        <svg className="w-4 h-4" style={{ color: '#a78bfa' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      ) : (
                        <svg className="w-4 h-4" style={{ color: '#a78bfa' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      )}
                    </button>
                  )}
                  <ShareMenu url={`/?dock=podium:${dockedPodium.id}`} text={dockedPodium.title} variant="icon" />
                  <DropCircle
                    id={dockedPostId}
                    isActive={false}
                    isDocked={true}
                    userInitial="P"
                    registerRef={registerDropZone}
                    onClick={handleUndock}
                    onDragUndock={handleDropCircleDrag}
                    flashDocks={flashDocks}
                    accentColor="#a78bfa"
                  />
                </div>
              </>
            ) : dockedPostId?.startsWith('group:') && dockedGroup ? (
              /* GROUP DOCKED state — top bar */
              <>
                <button
                  data-interactive
                  onClick={() => { setGroupCreateOpen(o => !o); setGroupCreateQuestion(''); setGroupCreateDescription(''); setGroupCreateError('') }}
                  className="w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors shrink-0"
                  style={{ borderColor: groupCreateOpen ? '#22d3ee' : '#22d3ee4d', backgroundColor: groupCreateOpen ? '#22d3ee22' : '#22d3ee14' }}
                  title="Create Chant"
                >
                  <svg className="w-5 h-5" style={{ color: '#22d3ee' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d={groupCreateOpen ? "M6 18L18 6M6 6l12 12" : "M12 4.5v15m7.5-7.5h-15"} /></svg>
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-serif truncate leading-snug" style={{ color: '#fbbf24' }}>
                    {dockedGroup.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs mt-0.5">
                    <span style={{ color: '#fbbf2499' }}>{dockedGroup.creator?.name || 'Anonymous'}</span>
                    <span className="text-muted-light/40">&middot;</span>
                    <span className="text-muted-light">{fmt(dockedGroup._count.members)} members</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    data-interactive
                    onClick={handleUndock}
                    className="w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors"
                    style={{ borderColor: '#fbbf244d', backgroundColor: '#fbbf2414' }}
                  >
                    <svg className="w-4 h-4" style={{ color: '#fbbf24' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                  </button>
                  {(dockedGroup.userRole === 'OWNER' || dockedGroup.userRole === 'ADMIN') && (
                    <button
                      data-interactive
                      onClick={() => {
                        setGroupSettingsOpen(o => {
                          if (!o) {
                            setGroupSettingsForm({ name: dockedGroup.name, description: dockedGroup.description || '', isPublic: dockedGroup.isPublic })
                            // Fetch existing invite code
                            fetch(`/api/communities/${dockedGroup.slug}/invite`).then(r => r.ok ? r.json() : null).then(d => { if (d?.inviteCode) setGroupInviteCode(d.inviteCode) }).catch(() => {})
                          }
                          return !o
                        })
                        setGroupSettingsMsg(null)
                      }}
                      className="w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors"
                      style={{ borderColor: '#fbbf244d', backgroundColor: '#fbbf2414' }}
                      title="Group Settings"
                    >
                      <svg className="w-4 h-4" style={{ color: '#fbbf24' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>
                  )}
                  <ShareMenu url={`/?dock=group:${dockedGroup.slug}`} text={dockedGroup.name} variant="icon" />
                  <DropCircle
                    id={dockedPostId}
                    isActive={false}
                    isDocked={true}
                    userInitial="G"
                    registerRef={registerDropZone}
                    onClick={handleUndock}
                    onDragUndock={handleDropCircleDrag}
                    flashDocks={flashDocks}
                    accentColor="#fbbf24"
                  />
                </div>
              </>
            ) : (
              /* FEED / CREATE state */
              <>
                <CreateDropZone
                  id="__create_chant__"
                  isActive={isDraggingDockstar && nearestDrop === '__create_chant__'}
                  isDocked={createMode}
                  userInitial="G"
                  registerRef={registerDropZone}
                  onClick={() => createMode ? handleUndock() : handleDock('__create_chant__')}
                  glowDrag={isDraggingDockstar && nearestDrop !== '__create_chant__'}
                  accentColor={tabAccentColor}
                />
                {activeTab === 'profile' ? (
                  <>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {([{ key: 'me', label: 'Me' }, { key: 'friends', label: 'Friends' }] as const).map(v => (
                        <button
                          key={v.key}
                          data-interactive
                          onClick={() => setProfileView(v.key)}
                          className={`px-2.5 py-1 rounded text-xs font-mono uppercase tracking-wider transition-colors ${profileView === v.key ? 'bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/30' : 'text-[#4ade80]/60 hover:text-[#4ade80] border border-transparent'}`}
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex-1" />
                  </>
                ) : activeTab === 'chants' ? (
                  <>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(['new', 'hot', 'top'] as const).map(s => (
                        <button key={s} data-interactive onClick={() => setSortBy(s)}
                          className={`px-2.5 py-1 rounded text-xs font-mono uppercase tracking-wider transition-colors ${sortBy === s ? 'bg-purple/15 text-purple border border-purple/30' : 'text-purple/60 hover:text-purple border border-transparent'}`}
                        >{s}</button>
                      ))}
                    </div>
                    <div className="hidden sm:flex flex-1 min-w-0">
                      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..."
                        className="w-full bg-transparent border border-purple/30 rounded px-2 py-1 text-sm text-purple placeholder:text-purple/40 outline-none focus:border-purple/60 font-mono" />
                    </div>
                    <div className="flex-1 sm:hidden" />
                    <button data-interactive onClick={() => { setSearchOpen(o => !o); if (searchOpen) setSearchQuery('') }}
                      className={`sm:hidden w-8 h-8 rounded-full border flex items-center justify-center shrink-0 transition-colors ${searchOpen ? 'border-foreground/40 bg-foreground/10' : 'border-border bg-transparent'}`}>
                      <svg className="w-4 h-4 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" /></svg>
                    </button>
                  </>
                ) : activeTab === 'podiums' ? (
                  <>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(['new', 'hot', 'top'] as const).map(s => (
                        <button key={s} data-interactive onClick={() => setSortBy(s)}
                          className={`px-2.5 py-1 rounded text-xs font-mono uppercase tracking-wider transition-colors ${sortBy === s ? 'bg-[#a78bfa]/15 text-[#a78bfa] border border-[#a78bfa]/30' : 'text-[#a78bfa]/60 hover:text-[#a78bfa] border border-transparent'}`}
                        >{s}</button>
                      ))}
                    </div>
                    <div className="hidden sm:flex flex-1 min-w-0">
                      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search podiums..."
                        className="w-full bg-transparent border border-[#a78bfa]/30 rounded px-2 py-1 text-sm text-[#a78bfa] placeholder:text-[#a78bfa]/40 outline-none focus:border-[#a78bfa]/60 font-mono" />
                    </div>
                    <div className="flex-1 sm:hidden" />
                    <button data-interactive onClick={() => { setSearchOpen(o => !o); if (searchOpen) setSearchQuery('') }}
                      className={`sm:hidden w-8 h-8 rounded-full border flex items-center justify-center shrink-0 transition-colors ${searchOpen ? 'border-foreground/40 bg-foreground/10' : 'border-border bg-transparent'}`}>
                      <svg className="w-4 h-4 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" /></svg>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(['new', 'hot', 'top'] as const).map(s => (
                        <button key={s} data-interactive onClick={() => setSortBy(s)}
                          className={`px-2.5 py-1 rounded text-xs font-mono uppercase tracking-wider transition-colors ${sortBy === s ? 'bg-[#fbbf24]/15 text-[#fbbf24] border border-[#fbbf24]/30' : 'text-[#fbbf24]/60 hover:text-[#fbbf24] border border-transparent'}`}
                        >{s}</button>
                      ))}
                    </div>
                    <div className="hidden sm:flex flex-1 min-w-0">
                      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search groups..."
                        className="w-full bg-transparent border border-[#fbbf24]/30 rounded px-2 py-1 text-sm text-[#fbbf24] placeholder:text-[#fbbf24]/40 outline-none focus:border-[#fbbf24]/60 font-mono" />
                    </div>
                    <div className="flex-1 sm:hidden" />
                    <button data-interactive onClick={() => { setSearchOpen(o => !o); if (searchOpen) setSearchQuery('') }}
                      className={`sm:hidden w-8 h-8 rounded-full border flex items-center justify-center shrink-0 transition-colors ${searchOpen ? 'border-foreground/40 bg-foreground/10' : 'border-border bg-transparent'}`}>
                      <svg className="w-4 h-4 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" /></svg>
                    </button>
                  </>
                )}
                {!session?.user ? (
                  <button
                    data-interactive
                    onClick={() => setAuthOverlayOpen(true)}
                    className="shrink-0 px-3 py-1.5 rounded-full border border-accent/40 bg-accent/10 text-accent text-xs font-mono uppercase tracking-wider hover:bg-accent/20 transition-colors"
                  >
                    Sign in
                  </button>
                ) : (
                  <a
                    href={`/user/${session?.user?.id}`}
                    data-interactive
                    title="Your page"
                    className="shrink-0 flex items-center gap-1.5 pl-1 pr-1 sm:pr-2.5 py-1 rounded-full border border-border bg-surface/50 hover:border-foreground/30 transition-colors"
                  >
                    <span className="w-6 h-6 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-[11px] font-bold text-accent">
                      {(session?.user?.name || 'U').charAt(0).toUpperCase()}
                    </span>
                    <span className="hidden sm:inline text-xs font-mono text-muted max-w-[90px] truncate">{session?.user?.name || 'You'}</span>
                  </a>
                )}
              </>
            )}
          </div>
          {/* MOBILE SEARCH BAR, slides down below toolbar */}
          {searchOpen && activeTab !== 'profile' && !dockedPostId && !activeSubspaceId && (
            <div className="sm:hidden px-3 pb-2 max-w-2xl mx-auto">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={activeTab === 'podiums' ? 'Search podiums...' : activeTab === 'groups' ? 'Search groups...' : 'Search...'}
                className={`w-full bg-transparent border rounded px-2 py-1.5 text-sm outline-none font-mono ${
                  activeTab === 'podiums' ? 'border-[#a78bfa]/30 text-[#a78bfa] placeholder:text-[#a78bfa]/40 focus:border-[#a78bfa]/60'
                  : activeTab === 'groups' ? 'border-[#fbbf24]/30 text-[#fbbf24] placeholder:text-[#fbbf24]/40 focus:border-[#fbbf24]/60'
                  : 'border-purple/30 text-purple placeholder:text-purple/40 focus:border-purple/60'
                }`}
                autoFocus
              />
            </div>
          )}
          {/* INACTIVITY WARNING */}
          {inactivityWarning && (
            <div className="px-3 py-2 bg-warning/10 border-t border-warning/30 flex items-center gap-2 max-w-2xl mx-auto">
              <span className="text-warning font-mono text-sm font-bold">{inactivitySecondsLeft}s</span>
              <span className="text-warning/80 text-xs flex-1">Inactive, you will be removed from this cell</span>
              <button
                data-interactive
                onClick={dismissWarning}
                className="px-3 py-1 rounded bg-warning/20 border border-warning/40 text-warning text-xs font-mono hover:bg-warning/30 transition-colors"
              >
                I'm here
              </button>
            </div>
          )}
          {/* INLINE CREATE FORM, tab-aware */}
          <div className={`overflow-hidden transition-all duration-300 ease-out ${createMode ? (activeTab === 'podiums' ? 'max-h-[800px]' : 'max-h-[500px]') + ' opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="px-3 pb-3 space-y-3 max-w-2xl mx-auto">
              {activeTab === 'podiums' ? (
                /* PODIUM CREATE FORM */
                <>
                  <input
                    type="text"
                    value={createPodiumTitle}
                    onChange={e => { setCreatePodiumTitle(e.target.value.slice(0, 200)); setCreateError('') }}
                    placeholder="Podium title"
                    className="w-full bg-surface border-2 border-border/30 rounded px-3 py-3 text-sm text-foreground placeholder:text-muted-light outline-none transition-all"
                    style={{ borderColor: createPodiumTitle.trim() ? '#a78bfa' : undefined, boxShadow: createPodiumTitle.trim() ? '0 0 16px #a78bfa33' : undefined }}
                    disabled={creating}
                    autoFocus={createMode}
                  />
                  <MarkdownEditor
                    value={createPodiumBody}
                    onChange={setCreatePodiumBody}
                    placeholder="Write your post... Use the toolbar for formatting."
                    minHeight="200px"
                  />
                  {/* Link a chant */}
                  {createPodiumDelibId ? (
                    <div className="flex items-center gap-2 bg-[#a78bfa]/10 border border-[#a78bfa]/25 rounded px-3 py-2">
                      <span className="text-xs text-foreground flex-1 truncate">
                        Linked: {chants.find(c => c.id === createPodiumDelibId)?.question || 'Chant'}
                      </span>
                      <button onClick={() => setCreatePodiumDelibId(null)} className="text-muted hover:text-foreground text-sm">&times;</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={createPodiumDelibSearch}
                        onChange={e => setCreatePodiumDelibSearch(e.target.value)}
                        placeholder="Link a chant (optional)"
                        className="w-full bg-surface border border-border/30 rounded px-3 py-2 text-xs text-foreground placeholder:text-muted-light outline-none transition-all"
                      />
                      {createPodiumDelibSearch && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-surface border border-border rounded overflow-hidden max-h-36 overflow-y-auto z-10">
                          {chants.filter(c => c.question.toLowerCase().includes(createPodiumDelibSearch.toLowerCase())).slice(0, 5).map(c => (
                            <button
                              key={c.id}
                              onClick={() => { setCreatePodiumDelibId(c.id); setCreatePodiumDelibSearch('') }}
                              className="w-full text-left px-3 py-2 hover:bg-background transition-colors border-b border-border last:border-0"
                            >
                              <div className="text-xs text-foreground truncate">{c.question}</div>
                              <div className="text-[10px] text-muted">{c.phase}</div>
                            </button>
                          ))}
                          {chants.filter(c => c.question.toLowerCase().includes(createPodiumDelibSearch.toLowerCase())).length === 0 && (
                            <div className="text-xs text-muted px-3 py-2">No matching chants</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : activeTab === 'groups' ? (
                /* GROUP CREATE FORM */
                <>
                  <input
                    type="text"
                    value={createGroupName}
                    onChange={e => { setCreateGroupName(e.target.value); setCreateError('') }}
                    placeholder="Group name"
                    className="w-full bg-surface border-2 border-border/30 rounded px-3 py-3 text-sm text-foreground placeholder:text-muted-light outline-none transition-all"
                    style={{ borderColor: createGroupName.trim() ? '#fbbf24' : undefined, boxShadow: createGroupName.trim() ? '0 0 16px #fbbf2433' : undefined }}
                    disabled={creating}
                    autoFocus={createMode}
                  />
                  <textarea
                    value={createGroupDescription}
                    onChange={e => setCreateGroupDescription(e.target.value)}
                    placeholder="Description (optional)"
                    rows={2}
                    className="w-full bg-surface border-2 border-border/30 rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-light outline-none transition-all resize-none"
                    style={{ borderColor: createGroupDescription.trim() ? '#fbbf2466' : undefined }}
                    disabled={creating}
                  />
                  <button
                    data-interactive
                    onClick={() => {
                      if (createGroupPublic) {
                        // Toggling to private — check if backend will allow it (error handled on submit)
                        setCreateGroupPublic(false)
                      } else {
                        setCreateGroupPublic(true)
                      }
                    }}
                    className="flex items-center gap-2 text-xs font-mono transition-colors"
                    style={{ color: '#fbbf24' }}
                  >
                    <div className="w-8 h-4 rounded-full border transition-colors relative" style={{ borderColor: '#fbbf2466', backgroundColor: createGroupPublic ? '#fbbf2433' : 'transparent' }}>
                      <div className="absolute top-0.5 w-3 h-3 rounded-full transition-all" style={{ backgroundColor: '#fbbf24', left: createGroupPublic ? '14px' : '2px' }} />
                    </div>
                    {createGroupPublic ? 'Public' : 'Private'}
                  </button>
                  {!createGroupPublic && (
                    <div className="rounded border border-[#fbbf24]/20 bg-[#fbbf24]/[0.04] px-3 py-2 text-xs text-muted-light">
                      Private groups require a <a href="/pricing" className="font-bold underline" style={{ color: '#fbbf24' }}>Pro plan</a>. Members join via invite link only.
                    </div>
                  )}
                </>
              ) : (
                /* CHANT CREATE FORM (default) */
                <>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={createQuestion}
                      onChange={e => { setCreateQuestion(e.target.value); setCreateError('') }}
                      onKeyDown={e => { if (e.key === 'Enter' && createQuestion.trim().length >= 2) handleCreateSubmit() }}
                      placeholder="What should we deliberate?"
                      className="flex-1 bg-surface border-2 border-border/30 rounded px-3 py-3 text-sm text-foreground placeholder:text-muted-light outline-none focus:border-accent focus:shadow-[0_0_16px_rgba(8,145,178,0.2)] transition-all"
                      disabled={creating}
                      autoFocus={createMode}
                    />
                    <button
                      onClick={handleCreateSubmit}
                      disabled={createQuestion.trim().length < 2 || creating}
                      data-interactive
                      className="px-3 py-2.5 rounded bg-accent/20 border border-accent/40 text-accent text-sm font-mono hover:bg-accent/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                      </svg>
                    </button>
                  </div>
                  <textarea
                    value={createDescription}
                    onChange={e => setCreateDescription(e.target.value)}
                    placeholder="Add context (optional)"
                    rows={2}
                    className="w-full bg-surface border-2 border-border/30 rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-light outline-none focus:border-accent focus:shadow-[0_0_16px_rgba(8,145,178,0.2)] transition-all resize-none"
                    disabled={creating}
                  />
                  {userGroups.length > 0 && (
                    <select
                      value={createCommunityId || ''}
                      onChange={e => setCreateCommunityId(e.target.value || null)}
                      className="w-full bg-surface border-2 border-border/30 rounded px-3 py-2 text-xs font-mono text-foreground outline-none focus:border-accent transition-all appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
                      disabled={creating}
                    >
                      <option value="">Public (no group)</option>
                      {userGroups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  )}
                  {podiums.length > 0 && (
                    <select
                      value={createPodiumContextId || ''}
                      onChange={e => setCreatePodiumContextId(e.target.value || null)}
                      className="w-full bg-surface border-2 border-border/30 rounded px-3 py-2 text-xs font-mono outline-none focus:border-accent transition-all appearance-none cursor-pointer"
                      style={{ color: createPodiumContextId ? '#a855f7' : '#64748b', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
                      disabled={creating}
                    >
                      <option value="">No context podium</option>
                      {podiums.map(p => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                  )}
                </>
              )}
              {createError && (
                <p className="text-xs text-error font-mono">{createError}</p>
              )}
            </div>
          </div>
        </div>
        {/* GROUP CHANT CREATE, drops down from top bar when docked to group */}
        <div className={`overflow-hidden transition-all duration-300 ease-out bg-header ${groupCreateOpen && dockedPostId?.startsWith('group:') ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="px-3 pb-3 space-y-3 max-w-2xl mx-auto">
            <div className="flex gap-2">
              <input
                type="text"
                value={groupCreateQuestion}
                onChange={e => { setGroupCreateQuestion(e.target.value); setGroupCreateError('') }}
                onKeyDown={e => { if (e.key === 'Enter' && groupCreateQuestion.trim().length >= 2) handleGroupChantCreate() }}
                placeholder="What should we deliberate?"
                className="flex-1 bg-surface border-2 border-border/30 rounded px-3 py-3 text-sm text-foreground placeholder:text-muted-light outline-none focus:border-accent focus:shadow-[0_0_16px_rgba(8,145,178,0.2)] transition-all"
                disabled={groupCreating}
                autoFocus={groupCreateOpen}
              />
              <button
                onClick={handleGroupChantCreate}
                disabled={groupCreateQuestion.trim().length < 2 || groupCreating}
                data-interactive
                className="px-3 py-2.5 rounded text-sm font-mono disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                style={{ backgroundColor: '#fbbf2433', border: '1px solid #fbbf2466', color: '#fbbf24' }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
            <textarea
              value={groupCreateDescription}
              onChange={e => setGroupCreateDescription(e.target.value)}
              placeholder="Add context (optional)"
              rows={2}
              className="w-full bg-surface border-2 border-border/30 rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-light outline-none focus:border-accent focus:shadow-[0_0_16px_rgba(8,145,178,0.2)] transition-all resize-none"
              disabled={groupCreating}
            />
            <div className="w-full bg-surface border-2 border-border/30 rounded px-3 py-2 text-xs font-mono text-muted-light/60">
              Posting to <span style={{ color: '#fbbf24' }}>{dockedGroup?.name}</span>
            </div>
            {podiums.length > 0 && (
              <select
                value={groupCreatePodiumContextId || ''}
                onChange={e => setGroupCreatePodiumContextId(e.target.value || null)}
                className="w-full bg-surface border-2 border-border/30 rounded px-3 py-2 text-xs font-mono outline-none focus:border-accent transition-all appearance-none cursor-pointer"
                style={{ color: groupCreatePodiumContextId ? '#a855f7' : '#64748b', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
                disabled={groupCreating}
              >
                <option value="">No context podium</option>
                {podiums.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            )}
            {groupCreateError && <p className="text-xs text-error font-mono">{groupCreateError}</p>}
          </div>
        </div>

        {viewMode !== 'spatial' && (activeSubspaceId?.startsWith('podiumchat:') ? (
          /* PODIUM SUBSPACE VIEW — uses IdeaSubspace with podium comments API */
          <div
            id="subspace-container"
            className="relative max-w-2xl mx-auto flex flex-col select-none"
            style={{ height: 'calc(100vh - 64px)' }}
          >
            {dockedPodium ? (
              <IdeaSubspace
                ideaId={activeSubspaceId}
                deliberationId=""
                onClose={exitSubspace}
                onNavigateToSubspace={() => {}}
                bookmarks={[]}
                players={getInstancePlayers(`podium:${dockedPodium.id}`, true)}
                onMovePosition={(rx, ry) => { setSelfRatio({ rx, ry }); moveToPosition(rx, ry) }}
                commentEndpoint={`/api/podiums/${dockedPodium.id}/comments`}
                accentColor="#a78bfa"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-muted-light text-sm font-mono animate-pulse">Loading subspace...</div>
              </div>
            )}
          </div>
        ) : activeSubspaceId?.startsWith('groupchat:') ? (
          /* GROUP SUBSPACE VIEW — uses IdeaSubspace with community chat API */
          <div
            id="subspace-container"
            className="relative max-w-2xl mx-auto flex flex-col select-none"
            style={{ height: 'calc(100vh - 64px)' }}
          >
            {dockedGroup ? (
              <IdeaSubspace
                ideaId={activeSubspaceId}
                deliberationId=""
                onClose={exitSubspace}
                onNavigateToSubspace={() => {}}
                bookmarks={[]}
                players={getInstancePlayers(`group:${dockedGroup.slug}`, true)}
                onMovePosition={(rx, ry) => { setSelfRatio({ rx, ry }); moveToPosition(rx, ry) }}
                commentEndpoint={`/api/communities/${dockedGroup.slug}/chat`}
                accentColor="#fbbf24"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-muted-light text-sm font-mono animate-pulse">Loading subspace...</div>
              </div>
            )}
          </div>
        ) : activeSubspaceId ? (
          /* IDEA SUBSPACE VIEW */
          <div
            id="subspace-container"
            className="relative max-w-2xl mx-auto flex flex-col select-none"
            style={{ height: 'calc(100vh - 64px)' }}
          >
            {(() => {
              const xpVal = dockedPostId ? (xpAllocations[dockedPostId] || {})[activeSubspaceId] || 0 : 0
              return (
                <IdeaSubspace
                  ideaId={activeSubspaceId}
                  deliberationId={dockedPostId || ''}
                  ideaText={activeSubspaceIdea?.text}
                  ideaAuthor={activeSubspaceIdea?.author?.name}
                  onClose={exitSubspace}
                  onNavigateToSubspace={(id) => { setActiveSubspaceId(id); setDockedIdeaId(id) }}
                  bookmarks={bookmarks}
                  xp={xpVal}
                  onXpChange={detail?.phase === 'VOTING' && canVote && dockedPostId ? (val) => handleXpChange(dockedPostId, activeSubspaceId, val) : undefined}
                  flashDocks={flashDocks}
                  players={getInstancePlayers(currentInstance)}
                  onMovePosition={(rx, ry) => { setSelfRatio({ rx, ry }); moveToPosition(rx, ry) }}
                />
              )
            })()}
          </div>
        ) : activeTab === 'podiums' ? (
          /* PODIUMS LIST (with inline docking) */
          <div className="max-w-2xl mx-auto">
            {/* DOCKED PODIUM CONTENT */}
            {dockedPostId?.startsWith('podium:') ? (
              <div className="px-3 py-4">
                {dockedPodiumLoading ? (
                  <div className="py-8 text-center text-muted-light text-sm font-mono animate-pulse">Loading...</div>
                ) : dockedPodium ? (
                  <div className="animate-slideDown space-y-2.5">
                    {/* PODIUM SETTINGS PANEL */}
                    {podiumSettingsOpen ? (
                      <div className="rounded border border-[#a78bfa]/30 bg-surface/90 p-3 space-y-3">
                        <div className="text-xs font-mono uppercase tracking-wider" style={{ color: '#a78bfa' }}>Podium Settings</div>
                        {podiumSettingsMsg && (
                          <div className={`text-xs font-mono px-2 py-1 rounded ${podiumSettingsMsg.type === 'success' ? 'bg-success/10 text-success border border-success/30' : 'bg-error/10 text-error border border-error/30'}`}>
                            {podiumSettingsMsg.text}
                          </div>
                        )}
                        <input
                          type="text"
                          value={podiumSettingsForm.title}
                          onChange={e => setPodiumSettingsForm(f => ({ ...f, title: e.target.value.slice(0, 200) }))}
                          placeholder="Title"
                          className="w-full bg-background border border-border/50 rounded px-2.5 py-2 text-xs text-foreground outline-none focus:border-[#a78bfa]/50 transition-colors"
                        />
                        <textarea
                          value={podiumSettingsForm.body}
                          onChange={e => setPodiumSettingsForm(f => ({ ...f, body: e.target.value }))}
                          placeholder="Body (markdown)"
                          rows={6}
                          className="w-full bg-background border border-border/50 rounded px-2.5 py-2 text-xs text-foreground outline-none focus:border-[#a78bfa]/50 transition-colors resize-none"
                        />
                        <div className="flex items-center gap-3 text-xs font-mono text-muted-light">
                          <span>{fmt(dockedPodium.views)} views</span>
                          <span className="text-muted-light/40">&middot;</span>
                          <span>{podiumCommentPreview.length} comments</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            data-interactive
                            disabled={podiumSettingsSaving || !podiumSettingsForm.title.trim()}
                            onClick={async () => {
                              setPodiumSettingsSaving(true)
                              setPodiumSettingsMsg(null)
                              try {
                                const res = await fetch(`/api/podiums/${dockedPodium.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ title: podiumSettingsForm.title.trim(), body: podiumSettingsForm.body.trim() }),
                                })
                                if (!res.ok) {
                                  const data = await res.json().catch(() => ({}))
                                  setPodiumSettingsMsg({ type: 'error', text: data.error || 'Failed to save' })
                                  return
                                }
                                setPodiumSettingsMsg({ type: 'success', text: 'Saved' })
                                setDockedPodium(prev => prev ? { ...prev, title: podiumSettingsForm.title.trim(), body: podiumSettingsForm.body.trim() } : prev)
                                // Update in feed list too
                                setPodiums(prev => prev.map(p => p.id === dockedPodium.id ? { ...p, title: podiumSettingsForm.title.trim(), body: podiumSettingsForm.body.trim() } : p))
                                setTimeout(() => setPodiumSettingsMsg(null), 2000)
                              } catch {
                                setPodiumSettingsMsg({ type: 'error', text: 'Network error' })
                              } finally {
                                setPodiumSettingsSaving(false)
                              }
                            }}
                            className="px-3 py-1.5 rounded text-xs font-mono font-bold transition-colors disabled:opacity-50"
                            style={{ backgroundColor: '#a78bfa', color: '#020617' }}
                          >
                            {podiumSettingsSaving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            data-interactive
                            onClick={async () => {
                              if (!confirm(`Delete "${dockedPodium.title}"? This cannot be undone.`)) return
                              if (!confirm('Are you sure?')) return
                              try {
                                const res = await fetch(`/api/podiums/${dockedPodium.id}`, { method: 'DELETE' })
                                if (res.ok) {
                                  setPodiumSettingsOpen(false)
                                  setPodiums(prev => prev.filter(p => p.id !== dockedPodium.id))
                                  forceUndock()
                                }
                              } catch {}
                            }}
                            className="px-3 py-1.5 rounded text-xs font-mono bg-error text-white hover:bg-error-hover transition-colors"
                          >
                            Delete Podium
                          </button>
                        </div>
                      </div>
                    ) : (
                    <>
                    {/* Body content, render markdown */}
                    <div className="prose-podium text-sm text-foreground/90 leading-relaxed">
                      <ReactMarkdown
                        components={{
                          h2: ({ children }) => <h2 className="text-lg font-serif mt-4 mb-2" style={{ color: '#a78bfa' }}>{children}</h2>,
                          h3: ({ children }) => <h3 className="text-base font-serif mt-3 mb-1.5" style={{ color: '#a78bfab3' }}>{children}</h3>,
                          p: ({ children }) => <p className="mb-3">{children}</p>,
                          blockquote: ({ children }) => <blockquote className="border-l-2 pl-3 italic text-muted-light" style={{ borderColor: '#a78bfa4d' }}>{children}</blockquote>,
                          ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
                          a: ({ href, children }) => <a href={href} className="text-accent underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                          code: ({ children }) => <code className="bg-surface border border-border px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                          strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
                          em: ({ children }) => <em className="italic">{children}</em>,
                        }}
                      >
                        {dockedPodium.body}
                      </ReactMarkdown>
                    </div>
                    </>
                    )}
                    {/* Linked deliberation */}
                    {dockedPodium.deliberation && (
                      <div
                        className="mt-4 p-3 rounded border cursor-pointer hover:bg-accent/5 transition-colors"
                        style={{ borderColor: '#22d3ee4d' }}
                        onClick={() => handleDock(dockedPodium.deliberation!.id)}
                      >
                        <div className="text-[10px] font-mono text-accent uppercase tracking-wider mb-1">Linked Chant</div>
                        <div className="text-sm font-serif text-foreground">{dockedPodium.deliberation.question}</div>
                        <div className="text-xs font-mono text-muted-light mt-1">
                          {dockedPodium.deliberation.phase} &middot; {dockedPodium.deliberation._count?.members || 0} members &middot; {dockedPodium.deliberation._count?.ideas || 0} ideas
                        </div>
                      </div>
                    )}
                    {/* Chat card, dockable into podium subspace (comments) */}
                    {(() => {
                      const isPodiumChatDocked = activeSubspaceId === `podiumchat:${dockedPodium.id}`
                      const chatPlayers = getInstancePlayers(`podium:${dockedPodium.id}`).filter(p => p.id !== presenceUserId)
                      return (
                        <div className={`mt-4 rounded border transition-colors ${isPodiumChatDocked ? 'border-[#a78bfa]/50 bg-[#a78bfa]/10' : 'border-[#a78bfa]/25 bg-[#a78bfa]/[0.04]'}`}>
                          <div className="px-2.5 py-2">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-mono uppercase tracking-wider mb-1" style={{ color: '#a78bfa99' }}>Comments</div>
                                {podiumCommentPreview.length > 0 ? (
                                  <div className="space-y-0.5">
                                    {podiumCommentPreview.map(msg => (
                                      <div key={msg.id} className="text-[11px] font-mono leading-snug truncate">
                                        <span style={{ color: '#a78bfa99' }}>{msg.user?.name || 'Anon'}</span>
                                        <span className="text-muted-light/30 mx-1">·</span>
                                        <span className="text-foreground/50">{msg.text}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-muted-light/40 font-mono">No comments yet</div>
                                )}
                              </div>
                              <div className="relative">
                                <DropCircle
                                  id={`podiumchat:${dockedPodium.id}`}
                                  isActive={isDraggingDockstar && nearestDrop === `podiumchat:${dockedPodium.id}`}
                                  isDocked={isPodiumChatDocked}
                                  userInitial="P"
                                  registerRef={registerDropZone}
                                  onClick={() => { if (!isPodiumChatDocked) handleDock(`podiumchat:${dockedPodium.id}`) }}
                                  flashDocks={flashDocks}
                                  faded={isPodiumChatDocked}
                                  icon="chat"
                                  glowDrag={isDraggingDockstar && !isPodiumChatDocked}
                                  accentColor="#a78bfa"
                                />
                                {chatPlayers.length > 0 && chatPlayers.slice(0, 6).map((p, i) => {
                                  const angle = (i * 137.5 + 30) * (Math.PI / 180)
                                  const r = 24
                                  return (
                                    <PresenceEye
                                      key={p.id}
                                      color={presenceColor(p.id)}
                                      name={p.name}
                                      className="absolute"
                                      style={{
                                        left: `calc(50% + ${Math.cos(angle) * r}px - 5px)`,
                                        top: `calc(50% + ${Math.sin(angle) * r}px - 3.5px)`,
                                      }}
                                    />
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                ) : (
                  <div className="py-8 text-center text-error/70 text-sm font-mono">Podium not found</div>
                )}
              </div>
            ) : (
              /* PODIUMS FEED */
              <>
                {podiumsLoading ? (
                  <div className="space-y-4 px-3 py-4">
                    {Array.from({ length: 3 }, (_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-4 bg-surface rounded w-3/4 mb-2" />
                        <div className="h-3 bg-surface rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : filteredPodiums.length === 0 ? (
                  <div className="text-center py-16 text-muted-light text-sm">{podiums.length === 0 ? 'No podiums yet.' : 'No matching podiums.'}</div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {filteredPodiums.map(p => {
                      const podiumPlayers = getInstancePlayers(`podium:${p.id}`, true).filter(pl => pl.id !== presenceUserId)
                      return (
                        <div key={p.id} className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-surface/30 transition-colors cursor-pointer" onClick={() => handleDock(`podium:${p.id}`)}>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-serif text-foreground leading-snug mb-0.5">{p.title}</h3>
                            <div className="flex items-center gap-1.5 text-xs mb-1">
                              <span style={{ color: '#a78bfab3' }}>{p.author?.name || 'Anonymous'}</span>
                              <span className="text-muted-light/40">&middot;</span>
                              <span className="text-muted-light">{fmt(p.views)} views</span>
                              {p.pinned && <span className="text-accent text-[10px] font-mono">PINNED</span>}
                            </div>
                            <p className="text-sm text-muted-light/70 line-clamp-2">{p.body.replace(/\n/g, ' ').slice(0, 180)}</p>
                            {p.deliberation && (
                              <div className="mt-1 text-xs text-accent/60 font-mono truncate">Linked: {p.deliberation.question}</div>
                            )}
                          </div>
                          <div className="relative pt-1 self-center flex items-center gap-2">
                            {p.author?.id === session?.user?.id && (
                              <button
                                data-interactive
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDock(`podium:${p.id}`)
                                  setTimeout(() => {
                                    setPodiumSettingsOpen(true)
                                    setPodiumSettingsForm({ title: p.title, body: p.body })
                                  }, 100)
                                }}
                                className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-[#a78bfa]/15 transition-colors"
                                style={{ borderColor: '#a78bfa4d', backgroundColor: '#a78bfa08' }}
                                title="Edit Podium"
                              >
                                <svg className="w-3.5 h-3.5" style={{ color: '#a78bfa' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              </button>
                            )}
                            <ShareMenu url={`/?dock=podium:${p.id}`} text={p.title} variant="icon" />
                            <div className="relative">
                            <DropCircle
                              id={`podium:${p.id}`}
                              isActive={isDraggingDockstar && nearestDrop === `podium:${p.id}`}
                              isDocked={false}
                              userInitial="P"
                              registerRef={registerDropZone}
                              onClick={() => handleDock(`podium:${p.id}`)}
                              flashDocks={flashDocks}
                              glowDrag={isDraggingDockstar}
                              accentColor="#a78bfa"
                              icon="document"
                            />
                            {podiumPlayers.length > 0 && podiumPlayers.slice(0, 8).map((pl, i) => {
                              const angle = (i * 137.5 + 30) * (Math.PI / 180)
                              const r = 24
                              const ox = Math.cos(angle) * r
                              const oy = Math.sin(angle) * r
                              return (
                                <PresenceEye
                                  key={pl.id}
                                  color={presenceColor(pl.id)}
                                  name={pl.name}
                                  className="absolute"
                                  style={{
                                    left: `calc(50% + ${ox}px - 5px)`,
                                    top: `calc(50% + ${oy}px - 3.5px)`,
                                  }}
                                />
                              )
                            })}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
            <div className="h-32" />
          </div>
        ) : activeTab === 'groups' ? (
          /* GROUPS LIST (with inline docking) */
          <div className="max-w-2xl mx-auto">
            {/* DOCKED GROUP CONTENT */}
            {dockedPostId?.startsWith('group:') ? (
              <div className="px-3 py-4">
                {dockedGroupLoading ? (
                  <div className="py-8 text-center text-muted-light text-sm font-mono animate-pulse">Loading...</div>
                ) : dockedGroup ? (
                  <div className="animate-slideDown space-y-2.5">
                    {/* Private gate, shown for private groups without membership */}
                    {dockedGroup._private_gate && (
                      <div className="rounded border border-[#fbbf24]/30 bg-surface/90 px-4 py-6 text-center space-y-3">
                        <div className="text-2xl">🔒</div>
                        <div className="text-sm font-serif" style={{ color: '#fbbf24' }}>{dockedGroup.name}</div>
                        {dockedGroup.description && <div className="text-xs text-muted-light">{dockedGroup.description}</div>}
                        <div className="text-xs text-muted-light/60 font-mono">{fmt(dockedGroup._count.members)} members &middot; Private</div>
                        {(() => {
                          const inviteParam = searchParams.get('invite')
                          if (inviteParam) {
                            return (
                              <button
                                data-interactive
                                disabled={joiningGroup}
                                onClick={async () => {
                                  if (needsAuth) { setAuthOverlayOpen(true); return }
                                  setJoiningGroup(true)
                                  try {
                                    const res = await fetch(`/api/communities/invite/${inviteParam}/join`, { method: 'POST' })
                                    const data = await res.json()
                                    if (res.ok) {
                                      // Refetch full group data now that we're a member
                                      const full = await fetch(`/api/communities/${dockedGroup.slug}`).then(r => r.ok ? r.json() : null)
                                      if (full) setDockedGroup({ ...full, _private_gate: false })
                                    } else {
                                      alert(data.message || data.error || 'Failed to join')
                                    }
                                  } catch { alert('Network error') }
                                  setJoiningGroup(false)
                                }}
                                className="px-5 py-2.5 rounded text-sm font-mono font-bold transition-colors disabled:opacity-50"
                                style={{ backgroundColor: '#fbbf24', color: '#020617', boxShadow: '0 0 16px #fbbf2466' }}
                              >
                                {joiningGroup ? 'Joining...' : 'Join with Invite'}
                              </button>
                            )
                          }
                          return (
                            <div className="text-xs text-muted-light/50 font-mono">
                              {!needsAuth ? 'You need an invite link to join this group.' : 'Sign in with an invite link to join.'}
                            </div>
                          )
                        })()}
                      </div>
                    )}
                    {/* Join card, shown for public groups when not a member */}
                    {!dockedGroup._private_gate && !dockedGroup.userRole && (
                      <div className="rounded border border-[#fbbf24]/30 bg-[#fbbf24]/[0.06] px-3 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-serif" style={{ color: '#fbbf24' }}>Join {dockedGroup.name}</div>
                            <div className="text-xs text-muted-light mt-0.5">{fmt(dockedGroup._count.members)} members &middot; Public</div>
                          </div>
                          <button
                            data-interactive
                            disabled={joiningGroup}
                            onClick={async () => {
                              if (needsAuth) { setAuthOverlayOpen(true); return }
                              setJoiningGroup(true)
                              try {
                                const res = await fetch(`/api/communities/${dockedGroup.slug}/join`, { method: 'POST' })
                                if (res.ok) {
                                  setDockedGroup(prev => prev ? { ...prev, userRole: 'MEMBER', _count: { ...prev._count, members: prev._count.members + 1 } } : prev)
                                }
                              } catch {}
                              setJoiningGroup(false)
                            }}
                            className="px-4 py-2 rounded text-sm font-mono font-bold transition-colors disabled:opacity-50"
                            style={{ backgroundColor: '#fbbf24', color: '#020617', boxShadow: '0 0 12px #fbbf2466' }}
                          >
                            {joiningGroup ? 'Joining...' : 'Join'}
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Group content, hidden behind private gate */}
                    {!dockedGroup._private_gate && (<>
                    {/* Chat card, dockable into group subspace */}
                    {(() => {
                      const isGroupChatDocked = activeSubspaceId === `groupchat:${dockedGroup.slug}`
                      const chatPlayers = getInstancePlayers(`group:${dockedGroup.slug}`).filter(p => p.id !== presenceUserId)
                      return (
                        <div className={`rounded border transition-colors ${isGroupChatDocked ? 'border-[#fbbf24]/50 bg-[#fbbf24]/10' : 'border-[#fbbf24]/25 bg-[#fbbf24]/[0.04]'}`}>
                          <div className="px-2.5 py-2">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-serif leading-snug" style={{ color: '#fbbf24' }}>General Chat</div>
                                <div className="flex items-center gap-2 text-xs font-mono text-muted-light mt-1">
                                  <span>{fmt(dockedGroup._count.members)} members</span>
                                </div>
                                {dockedGroup.userRole ? (
                                  groupChatPreview.length > 0 ? (
                                    <div className="mt-1.5 space-y-0.5">
                                      {groupChatPreview.map(msg => (
                                        <div key={msg.id} className="text-[11px] font-mono leading-snug truncate">
                                          <span className="text-[#fbbf24]/60">{msg.user?.name || 'Anon'}</span>
                                          <span className="text-muted-light/30 mx-1">·</span>
                                          <span className="text-foreground/50">{msg.text}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-[11px] text-muted-light/40 font-mono mt-1.5">No messages yet</div>
                                  )
                                ) : (
                                  <div className="text-[11px] text-muted-light/40 font-mono mt-1.5">Join to chat</div>
                                )}
                              </div>
                              <div className="relative">
                                <DropCircle
                                  id={`groupchat:${dockedGroup.slug}`}
                                  isActive={isDraggingDockstar && nearestDrop === `groupchat:${dockedGroup.slug}`}
                                  isDocked={isGroupChatDocked}
                                  userInitial="G"
                                  registerRef={registerDropZone}
                                  onClick={() => {
                                    if (isGroupChatDocked) return
                                    if (!dockedGroup.userRole) {
                                      setGroupNotice('Join the group to enter chat')
                                      setTimeout(() => setGroupNotice(null), 2500)
                                      return
                                    }
                                    handleDock(`groupchat:${dockedGroup.slug}`)
                                  }}
                                  flashDocks={flashDocks}
                                  faded={isGroupChatDocked || !dockedGroup.userRole}
                                  glowDrag={isDraggingDockstar && !isGroupChatDocked}
                                  accentColor="#fbbf24"
                                  icon="chat"
                                />
                                {chatPlayers.length > 0 && chatPlayers.slice(0, 6).map((p, i) => {
                                  const angle = (i * 137.5 + 30) * (Math.PI / 180)
                                  const r = 24
                                  return (
                                    <PresenceEye
                                      key={p.id}
                                      color={presenceColor(p.id)}
                                      name={p.name}
                                      className="absolute"
                                      style={{
                                        left: `calc(50% + ${Math.cos(angle) * r}px - 5px)`,
                                        top: `calc(50% + ${Math.sin(angle) * r}px - 3.5px)`,
                                      }}
                                    />
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                    {groupNotice && (
                      <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-mono text-warning animate-slideDown">
                        {groupNotice}
                      </div>
                    )}
                    {/* INLINE GROUP SETTINGS */}
                    {groupSettingsOpen && (
                      <div className="rounded border border-[#fbbf24]/30 bg-surface/90 p-3 space-y-3">
                        <div className="text-xs font-mono uppercase tracking-wider" style={{ color: '#fbbf24' }}>Group Settings</div>
                        {groupSettingsMsg && (
                          <div className={`text-xs font-mono px-2 py-1 rounded ${groupSettingsMsg.type === 'success' ? 'bg-success/10 text-success border border-success/30' : 'bg-error/10 text-error border border-error/30'}`}>
                            {groupSettingsMsg.text}
                          </div>
                        )}
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={groupSettingsForm.name}
                            onChange={e => setGroupSettingsForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="Group name"
                            className="w-full bg-background border border-border/50 rounded px-2.5 py-2 text-xs text-foreground outline-none focus:border-[#fbbf24]/50 transition-colors"
                          />
                          <textarea
                            value={groupSettingsForm.description}
                            onChange={e => setGroupSettingsForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Description"
                            rows={2}
                            className="w-full bg-background border border-border/50 rounded px-2.5 py-2 text-xs text-foreground outline-none focus:border-[#fbbf24]/50 transition-colors resize-none"
                          />
                          <button
                            data-interactive
                            onClick={() => setGroupSettingsForm(f => ({ ...f, isPublic: !f.isPublic }))}
                            className="flex items-center gap-2 text-xs font-mono transition-colors"
                            style={{ color: '#fbbf24' }}
                          >
                            <div className="w-7 h-3.5 rounded-full border transition-colors relative" style={{ borderColor: '#fbbf2466', backgroundColor: groupSettingsForm.isPublic ? '#fbbf2433' : 'transparent' }}>
                              <div className="absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all" style={{ backgroundColor: '#fbbf24', left: groupSettingsForm.isPublic ? '12px' : '2px' }} />
                            </div>
                            {groupSettingsForm.isPublic ? 'Public' : 'Private'}
                          </button>
                          {!groupSettingsForm.isPublic && dockedGroup.isPublic && (
                            <div className="rounded border border-[#fbbf24]/20 bg-[#fbbf24]/[0.04] px-2.5 py-1.5 text-[10px] text-muted-light">
                              Switching to private requires a <a href="/pricing" className="font-bold underline" style={{ color: '#fbbf24' }}>Pro plan</a>. Existing members keep access.
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            data-interactive
                            disabled={groupSettingsSaving}
                            onClick={async () => {
                              setGroupSettingsSaving(true)
                              setGroupSettingsMsg(null)
                              try {
                                const res = await fetch(`/api/communities/${dockedGroup.slug}/settings`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(groupSettingsForm),
                                })
                                if (!res.ok) {
                                  const data = await res.json().catch(() => ({}))
                                  const msg = (data.error === 'PRO_REQUIRED' || data.error === 'PRIVATE_GROUP_LIMIT') ? data.message : (data.error || 'Failed to save')
                                  setGroupSettingsMsg({ type: 'error', text: msg })
                                  return
                                }
                                setGroupSettingsMsg({ type: 'success', text: 'Saved' })
                                setDockedGroup(prev => prev ? { ...prev, name: groupSettingsForm.name, description: groupSettingsForm.description, isPublic: groupSettingsForm.isPublic } : prev)
                                setTimeout(() => setGroupSettingsMsg(null), 2000)
                              } catch {
                                setGroupSettingsMsg({ type: 'error', text: 'Network error' })
                              } finally {
                                setGroupSettingsSaving(false)
                              }
                            }}
                            className="px-3 py-1.5 rounded text-xs font-mono font-bold transition-colors disabled:opacity-50"
                            style={{ backgroundColor: '#fbbf24', color: '#020617' }}
                          >
                            {groupSettingsSaving ? 'Saving...' : 'Save'}
                          </button>
                          {dockedGroup.userRole === 'OWNER' && (
                            <>
                              <button
                                data-interactive
                                onClick={async () => {
                                  if (!confirm('Delete ALL chat messages? This cannot be undone.')) return
                                  try {
                                    const res = await fetch(`/api/communities/${dockedGroup.slug}/chat`, { method: 'DELETE' })
                                    if (res.ok) {
                                      const data = await res.json()
                                      setGroupSettingsMsg({ type: 'success', text: `Purged ${data.deleted} message(s)` })
                                      setGroupChatPreview([])
                                    }
                                  } catch {}
                                }}
                                className="px-3 py-1.5 rounded text-xs font-mono border border-error/30 text-error hover:bg-error/10 transition-colors"
                              >
                                Purge Chat
                              </button>
                              <button
                                data-interactive
                                onClick={async () => {
                                  if (!confirm(`Delete "${dockedGroup.name}"? This cannot be undone.`)) return
                                  if (!confirm('Are you sure?')) return
                                  try {
                                    const res = await fetch(`/api/communities/${dockedGroup.slug}`, { method: 'DELETE' })
                                    if (res.ok) {
                                      setGroupSettingsOpen(false)
                                      forceUndock()
                                    }
                                  } catch {}
                                }}
                                className="px-3 py-1.5 rounded text-xs font-mono bg-error text-white hover:bg-error-hover transition-colors"
                              >
                                Delete Group
                              </button>
                            </>
                          )}
                        </div>
                        {/* Invite Link Management */}
                        {(dockedGroup.userRole === 'OWNER' || dockedGroup.userRole === 'ADMIN') && (
                          <div className="border-t border-border/30 pt-2 space-y-2">
                            <div className="text-[10px] font-mono text-muted-light">Invite Link</div>
                            {groupInviteCode ? (
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    readOnly
                                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/chants?dock=group:${dockedGroup.slug}&invite=${groupInviteCode}`}
                                    className="flex-1 bg-background border border-border/50 rounded px-2 py-1.5 text-[10px] font-mono text-foreground/70 outline-none select-all"
                                    onClick={e => (e.target as HTMLInputElement).select()}
                                  />
                                  <button
                                    data-interactive
                                    onClick={() => {
                                      const url = `${window.location.origin}/chants?dock=group:${dockedGroup.slug}&invite=${groupInviteCode}`
                                      navigator.clipboard.writeText(url)
                                      setGroupSettingsMsg({ type: 'success', text: 'Copied!' })
                                      setTimeout(() => setGroupSettingsMsg(null), 1500)
                                    }}
                                    className="px-2 py-1.5 rounded text-[10px] font-mono border border-[#fbbf24]/30 hover:bg-[#fbbf24]/10 transition-colors"
                                    style={{ color: '#fbbf24' }}
                                  >
                                    Copy
                                  </button>
                                </div>
                                <button
                                  data-interactive
                                  onClick={async () => {
                                    if (!confirm('Reset invite link? The old link will stop working.')) return
                                    setGroupInviteLoading(true)
                                    try {
                                      const res = await fetch(`/api/communities/${dockedGroup.slug}/invite`, { method: 'PUT' })
                                      const data = await res.json()
                                      if (data.inviteCode) setGroupInviteCode(data.inviteCode)
                                    } catch {}
                                    setGroupInviteLoading(false)
                                  }}
                                  className="text-[10px] font-mono text-error/60 hover:text-error transition-colors"
                                >
                                  Reset Link
                                </button>
                              </div>
                            ) : (
                              <button
                                data-interactive
                                disabled={groupInviteLoading}
                                onClick={async () => {
                                  setGroupInviteLoading(true)
                                  try {
                                    const res = await fetch(`/api/communities/${dockedGroup.slug}/invite`, { method: 'POST' })
                                    const data = await res.json()
                                    if (data.inviteCode) setGroupInviteCode(data.inviteCode)
                                  } catch {}
                                  setGroupInviteLoading(false)
                                }}
                                className="px-3 py-1.5 rounded text-xs font-mono border border-[#fbbf24]/30 hover:bg-[#fbbf24]/10 transition-colors disabled:opacity-50"
                                style={{ color: '#fbbf24' }}
                              >
                                {groupInviteLoading ? 'Generating...' : 'Generate Invite Link'}
                              </button>
                            )}
                          </div>
                        )}
                        {/* Member list */}
                        <div className="border-t border-border/30 pt-2">
                          <div className="text-[10px] font-mono text-muted-light mb-1.5">Members ({dockedGroup._count.members})</div>
                          <div className="space-y-1">
                            {dockedGroup.members.map(m => (
                              <div key={m.user.id} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-5 h-5 rounded-full bg-[#fbbf24]/20 flex items-center justify-center text-[9px] font-bold" style={{ color: '#fbbf24' }}>
                                    {(m.user.name || '?').charAt(0).toUpperCase()}
                                  </div>
                                  <span className="text-foreground/80 font-mono">{m.user.name || 'Anon'}</span>
                                </div>
                                {dockedGroup.userRole === 'OWNER' && m.user.id !== dockedGroup.members.find(mm => dockedGroup.creator.name === mm.user.name)?.user.id && (
                                  <button
                                    data-interactive
                                    onClick={async () => {
                                      if (!confirm(`Remove ${m.user.name || 'this user'}?`)) return
                                      try {
                                        await fetch(`/api/communities/${dockedGroup.slug}/members/${m.user.id}`, { method: 'DELETE' })
                                        setDockedGroup(prev => prev ? { ...prev, members: prev.members.filter(mm => mm.user.id !== m.user.id), _count: { ...prev._count, members: prev._count.members - 1 } } : prev)
                                      } catch {}
                                    }}
                                    className="text-[10px] font-mono text-error/60 hover:text-error transition-colors"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Group's chants, same as main feed cards */}
                    {!groupSettingsOpen && dockedGroup.deliberations && dockedGroup.deliberations.length > 0 && (
                      <div className="divide-y divide-border/30">
                        {dockedGroup.deliberations.map(d => {
                          const dBadge = phaseBadge(d.phase, 0)
                          const isNearChant = isDraggingDockstar && nearestDrop === d.id
                          const chantPlayers = getInstancePlayers(d.id, true).filter(p => p.id !== presenceUserId)
                          return (
                            <div
                              key={d.id}
                              className="relative overflow-hidden flex items-start gap-2.5 px-3 py-2.5 transition-colors duration-200"
                              onClick={(e) => {
                                const target = e.target as HTMLElement
                                if (target.closest('[data-dockstar], [data-dockpoint], button, a, input, textarea, [data-interactive]')) return
                                handleDock(d.id)
                              }}
                            >
                              <div className="relative z-10 flex-1 min-w-0">
                                <h3 className="text-base font-serif text-foreground leading-snug mb-1">{d.question}</h3>
                                <div className="flex items-center gap-1.5 mb-1.5 text-xs">
                                  <span className="font-mono" style={{ color: '#fbbf24' }}>{dockedGroup.name}</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
                                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-px rounded border ${dBadge.color}`}>
                                    {dBadge.label}
                                  </span>
                                  <span className="text-muted">{fmt(d._count.members)}</span>
                                  <span className="text-muted-light/40">&middot;</span>
                                  <span className="text-muted">{fmt(d._count.ideas)} ideas</span>
                                </div>
                              </div>
                              <div className="relative z-10 pt-1 self-center flex items-center gap-2">
                                {d.creator?.id === session?.user?.id && dockedGroup && (
                                  <button
                                    data-interactive
                                    onClick={(e) => { e.stopPropagation(); handleDockToSettings(d.id, { question: d.question, phase: d.phase, community: dockedGroup.name, _count: d._count }) }}
                                    className="w-8 h-8 rounded-full border border-accent/30 bg-accent/8 flex items-center justify-center hover:bg-accent/15 hover:border-accent/50 transition-colors"
                                    title="Manage"
                                  >
                                    <svg className="w-3.5 h-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                  </button>
                                )}
                                <ShareMenu url={`/?dock=${d.id}`} text={d.question} variant="icon" />
                                <div className="relative">
                                  <DropCircle
                                    id={d.id}
                                    isActive={isNearChant}
                                    isDocked={false}
                                    userInitial="G"
                                    registerRef={registerDropZone}
                                    onClick={() => handleDock(d.id)}
                                    flashDocks={flashDocks}
                                    glowDrag={isDraggingDockstar}
                                    icon="chant"
                                  />
                                  {chantPlayers.length > 0 && chantPlayers.slice(0, 6).map((p, i) => {
                                    const angle = (i * 137.5 + 30) * (Math.PI / 180)
                                    const r = 24
                                    return (
                                      <PresenceEye
                                        key={p.id}
                                        color={presenceColor(p.id)}
                                        name={p.name}
                                        className="absolute"
                                        style={{
                                          left: `calc(50% + ${Math.cos(angle) * r}px - 5px)`,
                                          top: `calc(50% + ${Math.sin(angle) * r}px - 3.5px)`,
                                        }}
                                      />
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {dockedGroup.deliberations?.length === 0 && (
                      <div className="py-4 text-center text-muted-light text-xs font-mono">No chants in this group yet</div>
                    )}
                    </>)}
                  </div>
                ) : (
                  <div className="py-8 text-center text-error/70 text-sm font-mono">Group not found</div>
                )}
              </div>
            ) : (
              /* GROUPS FEED */
              <>
                {groupsLoading ? (
                  <div className="space-y-4 px-3 py-4">
                    {Array.from({ length: 3 }, (_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-4 bg-surface rounded w-3/4 mb-2" />
                        <div className="h-3 bg-surface rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : filteredGroups.length === 0 ? (
                  <div className="text-center py-16 text-muted-light text-sm">{groups.length === 0 ? 'No groups yet.' : 'No matching groups.'}</div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {filteredGroups.map(g => {
                      const groupPlayers = getInstancePlayers(`group:${g.slug}`, true).filter(pl => pl.id !== presenceUserId)
                      return (
                        <div key={g.id} className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-surface/30 transition-colors cursor-pointer" onClick={() => handleDock(`group:${g.slug}`)}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <h3 className="text-base font-serif text-foreground leading-snug">{g.name}</h3>
                              {!g.isPublic && <span className="text-[10px] font-mono text-warning/70 border border-warning/30 rounded px-1">PRIVATE</span>}
                            </div>
                            {g.description && <p className="text-sm text-muted-light/70 line-clamp-2 mb-1">{g.description}</p>}
                            <div className="flex items-center gap-2 text-xs font-mono text-muted-light">
                              <span>{fmt(g._count.members)} members</span>
                              <span className="text-muted-light/40">&middot;</span>
                              <span>{fmt(g._count.deliberations)} chants</span>
                              <span className="text-muted-light/40">&middot;</span>
                              <span style={{ color: '#a78bfa99' }}>{g.creator?.name || 'Anonymous'}</span>
                            </div>
                          </div>
                          <div className="relative pt-1 self-center flex items-center gap-2">
                            <ShareMenu url={`/?dock=group:${g.slug}`} text={g.name} variant="icon" />
                            <div className="relative">
                            <DropCircle
                              id={`group:${g.slug}`}
                              isActive={isDraggingDockstar && nearestDrop === `group:${g.slug}`}
                              isDocked={false}
                              userInitial="G"
                              registerRef={registerDropZone}
                              onClick={() => handleDock(`group:${g.slug}`)}
                              flashDocks={flashDocks}
                              glowDrag={isDraggingDockstar}
                              accentColor="#fbbf24"
                              icon="people"
                            />
                            {groupPlayers.length > 0 && groupPlayers.slice(0, 8).map((pl, i) => {
                              const angle = (i * 137.5 + 30) * (Math.PI / 180)
                              const r = 24
                              const ox = Math.cos(angle) * r
                              const oy = Math.sin(angle) * r
                              return (
                                <PresenceEye
                                  key={pl.id}
                                  color={presenceColor(pl.id)}
                                  name={pl.name}
                                  className="absolute"
                                  style={{
                                    left: `calc(50% + ${ox}px - 5px)`,
                                    top: `calc(50% + ${oy}px - 3.5px)`,
                                  }}
                                />
                              )
                            })}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
            <div className="h-32" />
          </div>
        ) : activeTab === 'profile' ? (
          /* PROFILE TAB */
          <div className="max-w-2xl mx-auto px-3 py-4">
            {profileView === 'friends' ? (
              /* FRIENDS LIST */
              friendsLoading ? (
                <div className="py-8 text-center text-muted-light text-sm font-mono animate-pulse">Loading...</div>
              ) : needsAuth ? (
                <div className="py-8 text-center">
                  <p className="text-xs text-muted mb-2">Sign in to see your friends</p>
                  <button onClick={() => setAuthOverlayOpen(true)} className="text-xs text-accent hover:underline">Sign in</button>
                </div>
              ) : friendsList && friendsList.length > 0 ? (
                <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg divide-y divide-border">
                  {friendsList.map(friend => (
                    <button
                      key={friend.id}
                      onClick={() => window.location.href = `/user/${friend.id}`}
                      className="flex items-center gap-3 p-3 w-full text-left hover:bg-surface transition-colors"
                    >
                      {friend.image ? (
                        <img src={friend.image} alt="" className="w-9 h-9 rounded-full" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[#4ade80]/20 flex items-center justify-center">
                          <span className="text-sm text-[#4ade80] font-semibold">{(friend.name || '?').charAt(0).toUpperCase()}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">{friend.name || 'Anonymous'}</div>
                        {friend.bio && <div className="text-xs text-muted truncate">{friend.bio}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted">
                  <p className="text-xs">Not following anyone yet</p>
                </div>
              )
            ) : profileLoading ? (
              <div className="py-8 text-center text-muted-light text-sm font-mono animate-pulse">Loading...</div>
            ) : profileData ? (
              <div className="space-y-4">
                {/* Profile Header */}
                <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    {profileData.image ? (
                      <img src={profileData.image} alt="" className="w-14 h-14 rounded-full" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center">
                        <span className="text-xl text-accent font-semibold">{profileData.name.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-bold text-foreground truncate">{profileData.name}</h2>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => window.location.href = '/profile/manage'} className="text-xs text-muted hover:text-foreground border border-border rounded-lg px-2 py-1 transition-colors">Manage</button>
                          <button onClick={() => window.location.href = '/billing'} className="text-xs text-muted hover:text-foreground border border-border rounded-lg px-2 py-1 transition-colors">Billing</button>
                          <button onClick={() => window.location.href = '/settings'} className="text-xs text-muted hover:text-foreground border border-border rounded-lg px-2 py-1 transition-colors">Settings</button>
                          <button onClick={() => signOut({ callbackUrl: '/' })} className="text-xs text-error hover:text-error-hover border border-error/30 rounded-lg px-2 py-1 transition-colors">Sign out</button>
                        </div>
                      </div>
                      {profileData.bio && <p className="text-xs text-muted mt-1">{profileData.bio}</p>}
                      <div className="flex items-center gap-3 mt-1 text-xs">
                        <span className="text-foreground"><strong>{profileData.followersCount}</strong> <span className="text-muted">followers</span></span>
                        <span className="text-foreground"><strong>{profileData.followingCount}</strong> <span className="text-muted">following</span></span>
                      </div>
                      <p className="text-xs text-subtle mt-0.5">Joined {new Date(profileData.joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div>
                  <h3 className="text-xs font-semibold text-foreground mb-2">Activity</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Vote Points', value: profileData.totalXP || 0, icon: 'VP' },
                      { label: 'Ideas', value: profileData.stats.ideas, icon: '\u{1F4A1}' },
                      { label: 'Comments', value: profileData.stats.comments, icon: '\u{1F4AC}' },
                      { label: 'Created', value: profileData.stats.deliberationsCreated, icon: '\u{1F4DD}' },
                      { label: 'Joined', value: profileData.stats.deliberationsJoined, icon: '\u{1F465}' },
                      { label: 'Accuracy', value: profileData.stats.accuracy !== null ? `${profileData.stats.accuracy}%` : '-', icon: '\u{1F3AF}' },
                    ].map(s => (
                      <div key={s.label} className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-muted text-xs mb-0.5"><span>{s.icon}</span><span>{s.label}</span></div>
                        <div className="text-lg font-bold text-foreground font-mono">{s.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Win Record */}
                {profileData.stats.ideasWon > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-foreground mb-2">Win Record</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Ideas Won', value: profileData.stats.ideasWon, icon: '\u{1F3C6}' },
                        { label: 'Win Rate', value: profileData.stats.winRate !== null ? `${profileData.stats.winRate}%` : '-', icon: '\u{1F4CA}' },
                        { label: 'Highest Tier', value: profileData.stats.highestTierReached || '-', icon: '\u{2B06}\u{FE0F}' },
                        { label: 'Advanced', value: profileData.stats.ideasAdvanced, icon: '\u{1F680}' },
                      ].map(s => (
                        <div key={s.label} className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-muted text-xs mb-0.5"><span>{s.icon}</span><span>{s.label}</span></div>
                          <div className="text-lg font-bold text-foreground font-mono">{s.value}</div>
                        </div>
                      ))}
                    </div>
                    {profileData.stats.tierBreakdown.length > 0 && (
                      <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3 mt-2">
                        <div className="text-xs text-muted mb-1.5">Tier breakdown</div>
                        <div className="flex gap-1.5 flex-wrap">
                          {profileData.stats.tierBreakdown.map(t => (
                            <span key={t.tier} className="bg-surface border border-border rounded px-1.5 py-0.5 text-xs font-mono">T{t.tier}: {t.count}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Comments Stats */}
                {profileData.stats.comments > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-foreground mb-2">Comments</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Comments', value: profileData.stats.comments, icon: '\u{1F4AC}' },
                        { label: 'Upvotes', value: profileData.stats.totalUpvotesReceived, icon: '\u{1F44D}' },
                        { label: 'Up-Pollinate', value: `Tier ${profileData.stats.highestUpPollinateTier}`, icon: '\u{1F338}' },
                      ].map(s => (
                        <div key={s.label} className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-muted text-xs mb-0.5"><span>{s.icon}</span><span>{s.label}</span></div>
                          <div className="text-lg font-bold text-foreground font-mono">{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Prediction Stats */}
                {profileData.stats.totalPredictions > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-foreground mb-2">Predictions</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Total', value: profileData.stats.totalPredictions, icon: '\u{1F52E}' },
                        { label: 'Correct', value: profileData.stats.correctPredictions, icon: '\u{2705}' },
                        { label: 'Priorities', value: profileData.stats.championPicks, icon: '\u{1F451}' },
                        { label: 'Best Streak', value: profileData.stats.bestStreak, icon: '\u{1F525}' },
                      ].map(s => (
                        <div key={s.label} className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-muted text-xs mb-0.5"><span>{s.icon}</span><span>{s.label}</span></div>
                          <div className="text-lg font-bold text-foreground font-mono">{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Ideas */}
                {profileData.recentIdeas.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-foreground mb-2">Recent Ideas</h3>
                    <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg divide-y divide-border">
                      {profileData.recentIdeas.map(idea => (
                        <button
                          key={idea.id}
                          onClick={() => handleDock(idea.deliberationId)}
                          className="block w-full text-left p-3 hover:bg-surface transition-colors"
                        >
                          <p className="text-xs text-foreground">{idea.text}</p>
                          <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              idea.status === 'WINNER' ? 'bg-success-bg text-success'
                                : idea.status === 'ADVANCING' ? 'bg-accent-light text-accent'
                                : idea.status === 'IN_VOTING' ? 'bg-warning-bg text-warning'
                                : idea.status === 'ELIMINATED' ? 'bg-error-bg text-error'
                                : 'bg-surface text-muted'
                            }`}>{idea.status}</span>
                            <span className="text-muted truncate">{idea.question}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Activity */}
                {profileData.recentActivity.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-foreground mb-2">Recent Activity</h3>
                    <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg divide-y divide-border">
                      {profileData.recentActivity.map(activity => (
                        <button
                          key={activity.deliberationId}
                          onClick={() => handleDock(activity.deliberationId)}
                          className="block w-full text-left p-3 hover:bg-surface transition-colors"
                        >
                          <p className="text-xs text-foreground">{activity.question}</p>
                          <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              activity.phase === 'VOTING' ? 'bg-warning-bg text-warning'
                                : activity.phase === 'ACCUMULATING' ? 'bg-purple-bg text-purple'
                                : activity.phase === 'COMPLETED' ? 'bg-success-bg text-success'
                                : 'bg-surface text-muted'
                            }`}>{activity.phase}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {profileData.recentIdeas.length === 0 && profileData.recentActivity.length === 0 && (
                  <div className="text-center py-6 text-muted">
                    <p className="text-xs">No activity yet</p>
                    <button onClick={() => { setActiveTab('chants') }} className="text-xs text-accent hover:underline mt-1.5 inline-block">Join a chant to get started</button>
                  </div>
                )}
              </div>
            ) : needsAuth ? (
              <div className="py-8 text-center">
                <p className="text-xs text-muted mb-2">Sign in to view your profile</p>
                <button onClick={() => setAuthOverlayOpen(true)} className="text-xs text-accent hover:underline">Sign in</button>
              </div>
            ) : null}
            <div className="h-32" />
          </div>
        ) : (
          /* CHANTS FEED */
          <div className="max-w-2xl mx-auto">
          {feedLoading && !isDockedToChant ? (
            <div className="space-y-4 px-3 py-4">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-surface rounded w-3/4 mb-2" />
                  <div className="h-3 bg-surface rounded w-1/2 mb-1" />
                  <div className="h-3 bg-surface rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : (
          <div className="divide-y divide-border/30">
            {(isDockedToChant ? (() => {
              const found = filteredChants.filter(c => c.id === dockedPostId)
              if (found.length > 0) return found
              // Chant not in feed (e.g. invite link or feed still loading) — synthesize from detail
              if (detail) return [{
                id: detail.id, question: detail.question, description: detail.description, phase: detail.phase,
                tier: detail.currentTier, participants: detail.memberCount, ideas: detail.ideaCount, cells: 0,
                upvotes: 0, community: 'Public', creator: detail.creator?.name || 'Anonymous',
                createdAt: '', createdAtRaw: new Date().toISOString(), champion: detail.champion ? { text: detail.champion.text } : null,
                userHasUpvoted: false, isMember: detail.isMember, isCreator: false, hasSubmittedIdea: !!detail.myIdea,
                hasVoted: detail.hasVoted, viewerCount: 0, voteCount: 0, isPinned: false, tags: [] as string[],
                continuousFlow: detail.continuousFlow, podiumContext: detail.podiumContext,
              } satisfies Chant]
              // Detail not loaded yet — show a minimal placeholder card
              return [{ id: dockedPostId!, question: '...', description: null, phase: 'SUBMISSION' as const,
                tier: 0, participants: 0, ideas: 0, cells: 0, upvotes: 0, community: '', creator: '',
                createdAt: '', createdAtRaw: new Date().toISOString(), champion: null,
                userHasUpvoted: false, isMember: false, isCreator: false, hasSubmittedIdea: false,
                hasVoted: false, viewerCount: 0, voteCount: 0, isPinned: false, tags: [] as string[],
                continuousFlow: false, podiumContext: null,
              } satisfies Chant]
            })() : filteredChants).map(chant => {
              const isDocked = dockedPostId === chant.id
              const badge = phaseBadge(chant.phase, chant.tier)
              const isNearDrop = isDraggingDockstar && nearestDrop === chant.id

              return (
                <div
                  key={chant.id}
                  className={`relative transition-colors duration-200 ${isDocked ? '' : 'overflow-hidden'}`}
                >
                  {/* Card header */}
                  <div
                    id={`chant-${chant.id}`}
                    className="relative overflow-hidden flex items-start gap-2.5 px-3 py-2.5"
                    onClick={(e) => {
                      const target = e.target as HTMLElement
                      if (target.closest('[data-dockstar], [data-dockpoint], button, a, input, textarea, [data-interactive]')) return
                      const sel = window.getSelection()
                      if (sel && sel.toString().length > 0) return
                      if (currentInstance === chant.id || (isDocked && currentInstance === chant.id)) {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const rx = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width))
                        const ry = Math.max(0.1, Math.min(0.9, (e.clientY - rect.top) / rect.height))
                        setSelfRatio({ rx, ry })
                        moveToPosition(rx, ry)
                      }
                    }}
                  >
                    <div className="relative z-10 flex-1 min-w-0">
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
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded border bg-accent/10 text-accent border-accent/30">YOURS</span>
                        )}
                        {chant.hasVoted && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded border bg-purple/10 text-purple border-purple/30">
                            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                            VOTED
                          </span>
                        )}
                        {!chant.hasVoted && chant.hasSubmittedIdea && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded border bg-purple/10 text-purple border-purple/30">SUBMITTED</span>
                        )}
                        <span className="text-muted">{fmt(chant.participants)}</span>
                        <span className="text-muted-light/40">&middot;</span>
                        <span className="text-muted">{fmt(chant.ideas)} ideas</span>
                      </div>
                      {chant.phase === 'COMPLETED' && chant.champion && !isDocked && (
                        <div className="mt-1.5 px-2 py-1.5 bg-gold/6 border-l-2 border-gold/30 text-sm text-gold/80">
                          {chant.champion.text}
                        </div>
                      )}
                    </div>
                    {!isDocked && (() => {
                      const remotePlayers = getInstancePlayers(chant.id, true).filter(p => p.id !== presenceUserId)
                      return (
                        <div className="relative z-10 pt-1 self-center flex items-center gap-2">
                          {chant.isCreator && (
                            <button
                              data-interactive
                              onClick={(e) => { e.stopPropagation(); handleDockToSettings(chant.id) }}
                              className="w-8 h-8 rounded-full border border-accent/30 bg-accent/8 flex items-center justify-center hover:bg-accent/15 hover:border-accent/50 transition-colors"
                              title="Manage"
                            >
                              <svg className="w-3.5 h-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            </button>
                          )}
                          <ShareMenu url={`/?dock=${chant.id}`} text={chant.question} variant="icon" />
                          <div className="relative">
                            <DropCircle
                              id={chant.id}
                              isActive={isNearDrop}
                              isDocked={false}
                              userInitial="G"
                              registerRef={registerDropZone}
                              onClick={() => handleDock(chant.id)}
                              flashDocks={flashDocks}
                              glowDrag={isDraggingDockstar}
                              icon="chant"
                            />
                            {remotePlayers.length > 0 && remotePlayers.slice(0, 12).map((p, i) => {
                              const ring = i < 6 ? 0 : 1
                              const angle = (i * 137.5 + 30) * (Math.PI / 180)
                              const r = 24 + ring * 10
                              const ox = Math.cos(angle) * r
                              const oy = Math.sin(angle) * r
                              return (
                                <PresenceEye
                                  key={p.id}
                                  color={presenceColor(p.id)}
                                  name={p.name}
                                  className="absolute"
                                  style={{
                                    left: `calc(50% + ${ox}px - 5px)`,
                                    top: `calc(50% + ${oy}px - 3.5px)`,
                                  }}
                                />
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  {/* EXPANDED (docked) */}
                  {isDocked && (
                    <div className="relative z-10 px-3 pb-3 animate-slideDown">
                      <div className="border-t border-border/30 pt-2.5">
                        {/* Loading indicator, shown in both normal and manage mode */}
                        {detailLoading && (
                          <div className="py-6 text-center">
                            <div className="text-muted-light text-sm font-mono animate-pulse">Loading...</div>
                          </div>
                        )}

                        {/* Detail error */}
                        {!detailLoading && detailError && (
                          <div className="py-4 text-center">
                            <div className="text-error/70 text-sm font-mono mb-1">{detailError}</div>
                            <button data-interactive onClick={refreshDetail} className="text-xs text-accent font-mono hover:underline">Retry</button>
                          </div>
                        )}

                        {/* Auto-join status, only show for logged-in users (unauthenticated can browse without joining) */}
                        {!manageMode && !detailLoading && detail && !detail.isMember && detail.phase !== 'COMPLETED' && detail.phase !== 'SUBMISSION' && session?.user && (
                          <div className="mb-2.5 py-1 text-center text-muted-light text-xs font-mono animate-pulse">Joining...</div>
                        )}

                        {/* Description */}
                        {!manageMode && !detailLoading && detail?.description && (
                          <div className="mb-2.5 text-sm text-muted-light leading-snug">{detail.description}</div>
                        )}

                        {/* Podium context, on-ramp card linking to the podium that inspired this chant */}
                        {!manageMode && !detailLoading && detail?.podiumContext && (
                          <button
                            data-interactive
                            onClick={() => {
                              setDockedPostId(`podium:${detail.podiumContext!.id}`)
                              setDockedIdeaId(null)
                              setActiveSubspaceId(null)
                            }}
                            className="w-full mb-3 text-left bg-[#a855f7]/8 border border-[#a855f7]/25 rounded px-3 py-2.5 hover:bg-[#a855f7]/15 transition-colors group"
                          >
                            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: '#a855f7' }}>Context</div>
                            <div className="text-sm font-serif text-foreground/90 leading-snug group-hover:text-foreground transition-colors">{detail.podiumContext.title}</div>
                          </button>
                        )}

                        {/* SUBMISSION phase */}
                        {!manageMode && !detailLoading && detail?.phase === 'SUBMISSION' && (() => {
                          const myIdeaText = submittedIdeas[chant.id] || detail.myIdea?.text
                          return (
                          <div>
                            {myIdeaText ? (
                              <div className="bg-accent/10 border border-accent/30 rounded px-3 py-3">
                                <div className="flex items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-mono text-accent uppercase tracking-wider mb-1.5">Your idea</div>
                                    <div className="text-base font-serif text-foreground leading-relaxed">{myIdeaText}</div>
                                  </div>
                                  {detail.myIdea?.id && (
                                    <DropCircle
                                      id={`idea:${detail.myIdea.id}`}
                                      isActive={isDraggingDockstar && nearestDrop === `idea:${detail.myIdea.id}`}
                                      isDocked={dockedIdeaId === detail.myIdea.id}
                                      userInitial="G"
                                      registerRef={registerDropZone}
                                      onClick={() => { enterSubspace(detail.myIdea!.id); setDockedIdeaId(detail.myIdea!.id) }}
                                      onDragUndock={undefined}
                                      flashDocks={flashDocks}
                                      glowDrag={isDraggingDockstar && dockedIdeaId !== detail.myIdea.id}
                                      icon="chat"
                                    />
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="relative">
                                <input id="idea-input" type="text" placeholder="Your idea..." value={pendingInputType === 'idea' && pendingInputTargetId === chant.id ? pendingInput : ''} onChange={e => handleTextInput(e.target.value, 'idea', chant.id)} onKeyDown={e => { if (e.key === 'Enter' && pendingInput.trim()) handleIdeaSubmit() }} autoFocus className="w-full bg-surface border-2 border-border/30 rounded px-3 py-3 text-sm text-foreground placeholder:text-muted-light outline-none focus:border-[#f59e0b] focus:shadow-[0_0_16px_rgba(245,158,11,0.3)] focus:placeholder:text-[#f59e0b]/40 transition-all" />
                              </div>
                            )}
                            <div className="mt-2 text-center text-xs font-mono text-muted-light/50">{fmt(detail.ideaCount)} ideas submitted</div>

                            {/* Other submitted ideas */}
                            {detail.ideas.length > 0 && (
                              <div className="mt-3 space-y-1">
                                {detail.ideas
                                  .filter(idea => idea.id !== detail.myIdea?.id)
                                  .map(idea => (
                                  <div key={idea.id} className="flex items-start gap-2 rounded border border-border/20 bg-surface/50 px-2.5 py-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-serif text-foreground/80 leading-snug">{idea.text}</div>
                                      <div className="text-[10px] font-mono text-muted-light mt-0.5">{idea.author.name}</div>
                                    </div>
                                    <DropCircle
                                      id={`idea:${idea.id}`}
                                      isActive={isDraggingDockstar && nearestDrop === `idea:${idea.id}`}
                                      isDocked={dockedIdeaId === idea.id}
                                      userInitial={idea.author.name?.charAt(0)?.toUpperCase() || '?'}
                                      registerRef={registerDropZone}
                                      onClick={() => { enterSubspace(idea.id); setDockedIdeaId(idea.id) }}
                                      onDragUndock={undefined}
                                      flashDocks={flashDocks}
                                      glowDrag={isDraggingDockstar && dockedIdeaId !== idea.id}
                                      icon="chat"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          )
                        })()}

                        {/* VOTING phase */}
                        {!manageMode && !detailLoading && detail?.phase === 'VOTING' && dockedCellIdeas.length > 0 && (
                          <div>
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-mono text-muted-light">
                                  {dockedCell ? `Cell / Tier ${dockedCell.tier}` : `Tier ${detail.currentTier}`}
                                </span>
                                {canVote ? (
                                  <span className={`text-xl font-mono font-bold ${getXpTotal(chant.id) === 10 ? 'text-success' : 'text-accent'}`}>
                                    {getXpTotal(chant.id)}<span className="text-sm text-muted-light/60">/10 XP</span>
                                  </span>
                                ) : detail.hasVoted ? (
                                  <span className="text-xs font-mono text-success flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                    Voted
                                  </span>
                                ) : null}
                              </div>
                              <div className="space-y-1.5">
                                {dockedCellIdeas.map(idea => {
                                  const xp = !canVote ? idea.totalXP : ((xpAllocations[chant.id] || {})[idea.id] || 0)
                                  const isIdeaDocked = dockedIdeaId === idea.id
                                  return (
                                    <div key={idea.id} id={`idea-${idea.id}`} className={`rounded border transition-colors ${isIdeaDocked ? 'bg-purple/10 border-purple/50' : 'bg-purple/6 border-purple/25'}`}>
                                      <div className="px-2.5 py-2">
                                        <div className="flex items-start gap-2 mb-1.5">
                                          <div className="flex-1 min-w-0">
                                            <div className={`text-sm font-serif leading-snug ${isIdeaDocked ? 'text-purple' : 'text-purple'}`}>{idea.text}</div>
                                            <div className="text-xs text-purple/70 mt-0.5">{idea.author?.name || 'Anonymous'}</div>
                                          </div>
                                          <span className={`text-2xl font-mono font-bold ${xp > 0 ? 'text-accent' : 'text-muted-light/20'}`}>{xp}</span>
                                        </div>
                                        {/* XP slider */}
                                        <div className="flex items-center gap-2">
                                          <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                                            {canVote && (() => {
                                              const currentXp = (xpAllocations[chant.id] || {})[idea.id] || 0
                                              return (
                                                <input
                                                  type="range"
                                                  min={0}
                                                  max={10}
                                                  value={currentXp}
                                                  onChange={e => handleXpChange(chant.id, idea.id, parseInt(e.target.value))}
                                                  className="xp-slider flex-1 h-2 appearance-none rounded-full cursor-pointer"
                                                  style={{
                                                    background: `linear-gradient(to right, #0891b2 0%, #0891b2 ${currentXp * 10}%, #1e293b ${currentXp * 10}%, #1e293b 100%)`,
                                                  }}
                                                />
                                              )
                                            })()}
                                            {!canVote && (
                                              <span className="text-xs font-mono text-muted-light">{idea.totalXP} XP / {idea.totalVotes} votes</span>
                                            )}
                                          </div>
                                          {(() => {
                                            const ideaPlayers = getInstancePlayers(`subspace:${chant.id}:${idea.id}`).filter(p => p.id !== presenceUserId)
                                            return (
                                              <div className="relative">
                                                <DropCircle
                                                  id={`idea:${idea.id}`}
                                                  isActive={isDraggingDockstar && nearestDrop === `idea:${idea.id}`}
                                                  isDocked={isIdeaDocked}
                                                  userInitial="G"
                                                  registerRef={registerDropZone}
                                                  onClick={() => { enterSubspace(idea.id); if (!isIdeaDocked) setDockedIdeaId(idea.id) }}
                                                  onDragUndock={undefined}
                                                  flashDocks={flashDocks}
                                                  faded={isIdeaDocked}
                                                  glowDrag={isDraggingDockstar && !isIdeaDocked}
                                                  icon="chat"
                                                />
                                                {ideaPlayers.length > 0 && ideaPlayers.slice(0, 8).map((p, i) => {
                                                  const ring = i < 6 ? 0 : 1
                                                  const angle = (i * 137.5 + 30) * (Math.PI / 180)
                                                  const r = 24 + ring * 10
                                                  const ox = Math.cos(angle) * r
                                                  const oy = Math.sin(angle) * r
                                                  return (
                                                    <PresenceEye
                                                      key={p.id}
                                                      color={presenceColor(p.id)}
                                                      name={p.name}
                                                      className="absolute"
                                                      style={{
                                                        left: `calc(50% + ${ox}px - 5px)`,
                                                        top: `calc(50% + ${oy}px - 3.5px)`,
                                                      }}
                                                    />
                                                  )
                                                })}
                                              </div>
                                            )
                                          })()}
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* VOTING phase, no cell yet (not assigned or browsing), show competing ideas */}
                        {!manageMode && !detailLoading && detail?.phase === 'VOTING' && dockedCellIdeas.length === 0 && (() => {
                          const votingIdeas = detail.ideas.filter(i => i.status === 'IN_VOTING' || i.status === 'ADVANCING' || i.status === 'WINNER').slice(0, 5)
                          return (
                          <div>
                            <div className="flex gap-4 text-center text-xs font-mono mb-2.5 justify-center">
                              <div><span className="text-foreground">{fmt(detail.memberCount)}</span> <span className="text-muted-light">people</span></div>
                              <div><span className="text-foreground">{fmt(votingIdeas.length)}</span> <span className="text-muted-light">competing</span></div>
                              <div><span className="text-foreground">T{detail.currentTier}</span> <span className="text-muted-light">tier</span></div>
                            </div>
                            {detail.isMember && !needsAuth && (() => {
                              const allCellsComplete = detail.cells.length > 0 && detail.cells.filter(c => c.tier === detail.currentTier).every(c => c.status === 'COMPLETED')
                              return allCellsComplete ? (
                                <div className="text-center text-muted-light text-xs font-mono mb-3">
                                  This round has completed. Waiting for results...
                                </div>
                              ) : (
                                <div className="text-center text-muted-light text-xs font-mono mb-3 animate-pulse">
                                  Waiting for cell assignment...
                                </div>
                              )
                            })()}
                            {needsAuth && (
                              <div className="text-center text-xs font-mono mb-3">
                                <button onClick={() => setAuthOverlayOpen(true)} className="text-accent hover:underline">Sign in to vote</button>
                              </div>
                            )}
                            {/* Browse competing ideas */}
                            {votingIdeas.length > 0 && (
                              <div className="space-y-1.5">
                                {votingIdeas.map(idea => {
                                  const isIdeaDocked = dockedIdeaId === idea.id
                                  return (
                                    <div key={idea.id} id={`idea-${idea.id}`} className={`rounded border transition-colors ${isIdeaDocked ? 'bg-purple/10 border-purple/50' : 'bg-purple/6 border-purple/25'}`}>
                                      <div className="px-2.5 py-2">
                                        <div className="flex items-start gap-2">
                                          <div className="flex-1 min-w-0">
                                            <div className="text-sm font-serif text-purple leading-snug">{idea.text}</div>
                                            <div className="text-xs text-purple/70 mt-0.5">{idea.author?.name || 'Anonymous'}</div>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className={`text-lg font-mono font-bold ${idea.totalXP > 0 ? 'text-accent/60' : 'text-muted-light/20'}`}>{idea.totalXP}</span>
                                            <DropCircle
                                              id={`idea:${idea.id}`}
                                              isActive={isDraggingDockstar && nearestDrop === `idea:${idea.id}`}
                                              isDocked={isIdeaDocked}
                                              userInitial={idea.author?.name?.charAt(0)?.toUpperCase() || '?'}
                                              registerRef={registerDropZone}
                                              onClick={() => { enterSubspace(idea.id); if (!isIdeaDocked) setDockedIdeaId(idea.id) }}
                                              onDragUndock={undefined}
                                              flashDocks={flashDocks}
                                              glowDrag={isDraggingDockstar && !isIdeaDocked}
                                              icon="chat"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                          )
                        })()}

                        {/* COMPLETED phase, show top ideas */}
                        {!manageMode && !detailLoading && detail?.phase === 'COMPLETED' && (
                          <div>
                            <div className="flex gap-4 text-center text-xs font-mono mb-2.5">
                              <div><span className="text-foreground">{fmt(detail.memberCount)}</span> <span className="text-muted-light">people</span></div>
                              <div><span className="text-foreground">{detail.currentTier}</span> <span className="text-muted-light">tiers</span></div>
                            </div>
                            {detail.ideas.slice(0, 5).map((idea, i) => {
                              const isChampion = idea.isChampion || i === 0
                              const isIdeaDocked = dockedIdeaId === idea.id
                              return (
                                <div key={idea.id} id={`idea-${idea.id}`} className={`rounded border mb-1 transition-colors ${isChampion ? (isIdeaDocked ? 'bg-gold/12 border-gold/50' : 'bg-gold/6 border-gold/30') : (isIdeaDocked ? 'bg-purple/12 border-purple/50' : 'bg-purple/6 border-purple/25')}`}>
                                  <div className="px-2.5 py-2">
                                    <div className="flex items-start gap-2">
                                      {!isChampion && <span className="text-purple/30 font-mono text-xs shrink-0 pt-0.5">{i + 1}.</span>}
                                      {isChampion && <span className="text-gold/50 font-mono text-xs shrink-0 pt-0.5">&#9733;</span>}
                                      <div className="flex-1 min-w-0">
                                        {isChampion && <div className="text-[9px] font-mono text-gold/50 uppercase tracking-wider mb-0.5">Winner</div>}
                                        <div className={`text-sm font-serif leading-snug ${isChampion ? (isIdeaDocked ? 'text-gold' : 'text-gold/80') : (isIdeaDocked ? 'text-purple' : 'text-purple')}`}>{idea.text}</div>
                                        <div className={`text-xs mt-0.5 ${isChampion ? 'text-gold/40' : 'text-purple/70'}`}>{idea.author?.name || 'Anonymous'} &middot; {idea.totalXP}xp</div>
                                      </div>
                                      <div className="flex flex-col items-center gap-0.5 shrink-0 relative">
                                        <DropCircle
                                          id={`idea:${idea.id}`}
                                          isActive={isDraggingDockstar && nearestDrop === `idea:${idea.id}`}
                                          isDocked={isIdeaDocked}
                                          userInitial="G"
                                          registerRef={registerDropZone}
                                          onClick={() => { enterSubspace(idea.id); if (!isIdeaDocked) setDockedIdeaId(idea.id) }}
                                          onDragUndock={undefined}
                                          flashDocks={flashDocks}
                                          faded={isIdeaDocked}
                                          glowDrag={isDraggingDockstar && !isIdeaDocked}
                                          icon="chat"
                                        />
                                        {(() => {
                                          const sp = getInstancePlayers(`subspace:${chant.id}:${idea.id}`).filter(p => p.id !== presenceUserId)
                                          return sp.length > 0 ? sp.slice(0, 8).map((p, i) => {
                                            const ring = i < 6 ? 0 : 1
                                            const angle = (i * 137.5 + 30) * (Math.PI / 180)
                                            const r = 24 + ring * 10
                                            const ox = Math.cos(angle) * r
                                            const oy = Math.sin(angle) * r
                                            return (
                                              <PresenceEye
                                                key={p.id}
                                                color={presenceColor(p.id)}
                                                name={p.name}
                                                className="absolute"
                                                style={{
                                                  left: `calc(50% + ${ox}px - 5px)`,
                                                  top: `calc(50% + ${oy}px - 3.5px)`,
                                                }}
                                              />
                                            )
                                          }) : null
                                        })()}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* MANAGE PANEL -- creator only */}
                        {/* MANAGE MODE, replaces normal content when active */}
                        {!detailLoading && detail && manageMode && chant.isCreator && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-3">
                              <svg className="w-3.5 h-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              <span className="text-xs font-mono text-accent uppercase tracking-wider">Manage</span>
                            </div>
                            <div className="flex items-center gap-3 mb-3 text-xs font-mono text-muted-light">
                              <span>{fmt(detail.memberCount)} joined</span>
                              <span>{fmt(detail.ideaCount)} ideas</span>
                              <span>{detail.cells.length} cells</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              {detail.phase === 'SUBMISSION' && (
                                <button
                                  data-interactive
                                  onClick={handleStartVoting}
                                  disabled={startingVoting}
                                  className="px-2.5 py-2.5 rounded border border-warning/30 bg-warning/8 text-warning text-xs font-mono hover:bg-warning/15 transition-colors text-left disabled:opacity-50"
                                >
                                  {startingVoting ? 'Starting...' : detail.ideaCount < 2 ? `Start Voting (${detail.ideaCount} idea${detail.ideaCount === 1 ? '' : 's'})` : 'Start Voting'}
                                </button>
                              )}
                              {detail.phase === 'VOTING' && (
                                <button data-interactive className="px-2.5 py-2.5 rounded border border-success/30 bg-success/8 text-success text-xs font-mono hover:bg-success/15 transition-colors text-left">
                                  Advance Tier
                                </button>
                              )}
                              <ShareMenu url={`/?dock=${chant.id}`} text={chant.question} />
                              <button data-interactive onClick={() => window.location.href = `/chants/${chant.id}/analytics`} className="px-2.5 py-2.5 rounded border border-border/40 bg-surface/50 text-muted-light text-xs font-mono hover:text-foreground hover:bg-surface transition-colors text-left">
                                Analytics
                              </button>
                              <button data-interactive className="px-2.5 py-2.5 rounded border border-error/30 bg-error/8 text-error/70 text-xs font-mono hover:bg-error/15 hover:text-error transition-colors text-left">
                                Close Chant
                              </button>
                            </div>
                            {manageMsg && (
                              <div className={`mt-2 px-2.5 py-2 rounded text-xs font-mono ${manageMsg.type === 'error' ? 'bg-error/10 text-error border border-error/20' : 'bg-success/10 text-success border border-success/20'}`}>
                                {manageMsg.text}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          )}

          {!feedLoading && filteredChants.length === 0 && (
            <div className="text-center py-16 text-muted-light text-sm">
              {feedError ? `Error loading chants: ${feedError}` : 'No chants found.'}
            </div>
          )}

          <div className="h-32" />
        </div>
        ))}

        {/* BOTTOM BAR */}
        {(() => {
          const isDocked = !!dockedPostId || !!activeSubspaceId
          const hasTextInput = pendingInput.trim().length > 0 && pendingInputType
          const hasVoteReady = dockedPostId && dockedPostId !== '__create_chant__' && canVote ? getXpTotal(dockedPostId) === 10 : false
          const hasGroupChantCreate = groupCreateOpen && dockedPostId?.startsWith('group:') && groupCreateQuestion.trim().length >= 2
          const hasCreateReady = hasGroupChantCreate || (createMode && (
            activeTab === 'podiums' ? createPodiumTitle.trim().length > 0
            : activeTab === 'groups' ? createGroupName.trim().length > 0
            : createQuestion.trim().length >= 2
          ))
          const hasConfirm = hasTextInput || hasVoteReady || hasCreateReady
          // Show nav bar when undocked (always), show confirm bar when docked with pending action
          // Hide entirely in spatial mode — drop targets are on the canvas
          // In spatial mode, only show bottom bar when dragging dockstar (reveals nav drop targets)
          const showBar = viewMode === 'spatial' ? isDraggingDockstar : (!isDocked || hasConfirm)
          const confirmLabel = hasCreateReady && !hasTextInput
            ? (hasGroupChantCreate ? (groupCreating ? 'Creating...' : 'Launch Chant')
              : creating ? 'Creating...'
              : activeTab === 'podiums' ? 'Publish Podium'
              : activeTab === 'groups' ? 'Create Group'
              : 'Launch Chant')
            : hasVoteReady && !hasTextInput ? (submittingVote ? 'Submitting...' : 'Submit Vote')
            : pendingInputType === 'idea' ? (submittingIdea ? 'Submitting...' : 'Submit Idea')
            : pendingInputType === 'comment' ? 'Post Comment'
            : pendingInputType === 'chat' ? 'Send Message'
            : 'Confirm'
          return (
            <div className={`fixed bottom-0 left-0 right-0 z-[9997] transition-all duration-300 ease-out ${showBar ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
              <div className="bg-header/95 backdrop-blur-sm border-t border-border/50 px-2 py-1.5 safe-area-bottom">
                {isDocked && hasConfirm ? (
                  /* Confirm bar (docked with pending action) */
                  <div className="flex items-center gap-2 max-w-md mx-auto px-2">
                    <button
                      onClick={() => {
                        if (hasGroupChantCreate) { setGroupCreateOpen(false); setGroupCreateQuestion(''); setGroupCreateDescription(''); setGroupCreateError('') }
                        else if (hasCreateReady) { handleUndock() }
                        else { setPendingInput(''); setPendingInputType(null); setPendingDockContext(null); if (hasVoteReady && dockedPostId) setXpAllocations(prev => { const next = { ...prev }; delete next[dockedPostId]; return next }) }
                      }}
                      data-interactive
                      className="px-3 py-3 rounded text-sm font-mono text-muted-light hover:text-foreground hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (hasGroupChantCreate) { handleGroupChantCreate() }
                        else if (hasCreateReady) {
                          if (activeTab === 'podiums') handlePodiumCreateSubmit()
                          else if (activeTab === 'groups') handleGroupCreateSubmit()
                          else handleCreateSubmit()
                        }
                        else if (hasVoteReady) { handleVoteSubmit() }
                        else if (hasTextInput && pendingInputType === 'idea') { handleIdeaSubmit() }
                        else if (hasTextInput) { setPendingInput(''); setPendingInputType(null); setPendingInputTargetId(null); setPendingDockContext(null) }
                      }}
                      disabled={(hasCreateReady && (creating || groupCreating)) || submittingVote || submittingIdea}
                      data-interactive
                      className="flex-1 py-3 rounded-lg text-header font-mono font-bold text-sm disabled:opacity-40 transition-colors"
                      style={{ backgroundColor: tabAccentColor, boxShadow: `0 0 16px ${tabAccentColor}66` }}
                    >
                      {confirmLabel}
                    </button>
                  </div>
                ) : !isDocked ? (
                  /* Nav bar (always visible when undocked) */
                  <div className="flex items-center justify-center gap-3 max-w-md mx-auto">
                    {NAV_ITEMS.map(nav => {
                      const tabKey = nav.id === '__nav_chants__' ? 'chants' : nav.id === '__nav_podiums__' ? 'podiums' : nav.id === '__nav_groups__' ? 'groups' : null
                      const navPlayers = tabKey ? getInstancePlayers(`list:${tabKey}`, true).map(p => ({ id: p.id, name: p.name, color: ('isSelf' in p && p.isSelf) ? '#22d3ee' : presenceColor(p.id) })) : undefined
                      return (
                        <NavDropCircle key={nav.id} id={nav.id} label={nav.label} icon={nav.icon} isActive={isDraggingDockstar && nearestDrop === nav.id} registerRef={registerDropZone} glowDrag={isDraggingDockstar && nearestDrop !== nav.id} onClick={() => handleDock(nav.id)} color={nav.color} players={navPlayers} />
                      )
                    })}
                    {isAdmin && (
                      <NavDropCircle
                        id="__nav_admin__"
                        label="Admin"
                        icon={
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        }
                        isActive={false}
                        registerRef={registerDropZone}
                        onClick={() => { window.location.href = '/admin' }}
                        color="#f59e0b"
                      />
                    )}
                    <NavDropCircle
                      id="__nav_profile__"
                      label={needsAuth ? 'Sign in' : 'Profile'}
                      icon={
                        needsAuth ? (
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                          </svg>
                        )
                      }
                      isActive={false}
                      registerRef={registerDropZone}
                      onClick={() => {
                        if (needsAuth) { setAuthOverlayOpen(true); return }
                        setActiveTab('profile')
                        setProfileView('me')
                        setDockedPostId(null)
                        setDockedIdeaId(null)
                        setDockedPodium(null)
                        setDockedGroup(null)
                        setSearchQuery('')
                        setSortBy('new')
                        setSearchOpen(false)
                      }}
                      color={needsAuth ? '#0891b2' : '#4ade80'}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          )
        })()}

        {/* INACTIVITY KICKED POPUP */}
        {kickedMessage && (
          <div className="fixed inset-0 z-[9995] bg-header/80 backdrop-blur-sm flex items-end justify-center p-4 pb-24" onClick={() => setKickedMessage(false)}>
            <div className="bg-surface border border-warning/30 rounded-lg max-w-sm w-full p-4 shadow-[0_0_24px_rgba(245,158,11,0.15)]" onClick={e => e.stopPropagation()}>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-warning/15 border border-warning/30 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono text-warning font-bold mb-1">Timed out</div>
                  <div className="text-xs text-foreground/70 leading-relaxed">You were removed from the cell due to 10 minutes of inactivity. Dock back in to rejoin.</div>
                </div>
                <button
                  data-interactive
                  onClick={() => setKickedMessage(false)}
                  className="text-muted-light hover:text-foreground text-lg leading-none shrink-0"
                >
                  &times;
                </button>
              </div>
            </div>
          </div>
        )}

      </div>


      <WelcomeGuide open={welcomeGuideOpen} onClose={() => setWelcomeGuideOpen(false)} />

      <AuthOverlay
        open={authOverlayOpen}
        onClose={() => { setAuthOverlayOpen(false); setAuthCallbackAction(null) }}
        onAuthSuccess={handleAuthSuccess}
        callbackUrl={authCallbackUrl}
        tempUserId={session?.user?.isTemp ? session.user.id : undefined}
      />

      <style jsx global>{`
        .xp-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #0891b2;
          border: 2px solid #22d3ee;
          box-shadow: 0 0 8px rgba(8, 145, 178, 0.5);
          cursor: pointer;
        }
        .xp-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #0891b2;
          border: 2px solid #22d3ee;
          box-shadow: 0 0 8px rgba(8, 145, 178, 0.5);
          cursor: pointer;
        }
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
