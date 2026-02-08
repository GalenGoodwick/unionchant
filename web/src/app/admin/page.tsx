'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { getDisplayName } from '@/lib/user'
import Header from '@/components/Header'

function UserAvatar({ image, name }: { image: string | null; name: string | null }) {
  const [imgError, setImgError] = useState(false)
  const initial = (name || '?').charAt(0).toUpperCase()

  if (image && !imgError) {
    return (
      <img
        src={image}
        alt=""
        className="w-8 h-8 rounded-full"
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <span className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-sm font-medium text-accent">
      {initial}
    </span>
  )
}

type UserStatus = 'ACTIVE' | 'BANNED' | 'DELETED'
type AdminTab = 'deliberations' | 'users' | 'moderation' | 'podiums' | 'groups'

interface ChallengeStats {
  totalLogs: number
  resultCounts: { result: string; count: number }[]
  recentFails: { id: string; result: string; pointerEvents: number; chaseDurationMs: number; evadeCount: number; createdAt: string; user: { id: string; name: string | null; email: string; challengeFailCount: number; botFlaggedAt: string | null } }[]
  flaggedUsers: { id: string; name: string | null; email: string; botFlaggedAt: string | null; challengeFailCount: number; createdAt: string }[]
}

interface AdminReport {
  id: string
  targetType: string
  targetId: string
  reason: string
  details: string | null
  status: string
  resolution: string | null
  createdAt: string
  resolvedAt: string | null
  reporter: { id: string; name: string | null; email: string; image: string | null }
  resolvedBy: { id: string; name: string | null } | null
}

interface AdminUser {
  id: string
  email: string
  name: string | null
  status: UserStatus
  image: string | null
  createdAt: string
  bannedAt: string | null
  banReason: string | null
  zipCode: string | null
  _count: { ideas: number; votes: number; comments: number; deliberationsCreated: number }
}

interface Deliberation {
  id: string
  question: string
  phase: string
  isPublic: boolean
  organization: string | null
  tags: string[]
  createdAt: string
  submissionEndsAt: string | null
  ideaGoal: number | null
  creator: {
    name: string | null
    email: string
    status?: UserStatus
  }
  _count: {
    members: number
    ideas: number
  }
}

function getVotingType(d: Deliberation): string {
  if (d.ideaGoal) return `Idea Goal ${d._count.ideas}/${d.ideaGoal}`
  if (d.submissionEndsAt) return 'Timed'
  return 'Facilitator controlled'
}

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [deliberations, setDeliberations] = useState<Deliberation[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'public' | 'private'>('all')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [testQuestion, setTestQuestion] = useState('')
  const [enableRolling, setEnableRolling] = useState(false)
  const [targetPhase, setTargetPhase] = useState<'SUBMISSION' | 'VOTING' | 'ACCUMULATING'>('SUBMISSION')
  const [testUsers, setTestUsers] = useState(20)
  const [createStatus, setCreateStatus] = useState('')
  // Voting trigger options
  const [votingTrigger, setVotingTrigger] = useState<'manual' | 'timer' | 'ideas'>('manual')
  const [timerMinutes, setTimerMinutes] = useState(60)
  const [ideaGoal, setIdeaGoal] = useState(20)
  const [votingMinutes, setVotingMinutes] = useState(5)
  // Tab state
  const [activeTab, setActiveTab] = useState<AdminTab>('deliberations')

  // User management state
  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersTotal, setUsersTotal] = useState(0)
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersSearch, setUsersSearch] = useState('')
  const [usersStatus, setUsersStatus] = useState<'' | UserStatus>('')
  const [usersPage, setUsersPage] = useState(1)
  const [userActioning, setUserActioning] = useState<string | null>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Moderation state
  const [reports, setReports] = useState<AdminReport[]>([])
  const [reportsTotal, setReportsTotal] = useState(0)
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportsFilter, setReportsFilter] = useState<'PENDING' | 'RESOLVED' | 'DISMISSED'>('PENDING')
  const [reportsPage, setReportsPage] = useState(1)
  const [reportActioning, setReportActioning] = useState<string | null>(null)

  // Flagged users state
  interface FlaggedUser {
    id: string; name: string | null; email: string; image: string | null
    status: UserStatus; bannedAt: string | null; banReason: string | null; createdAt: string
    _count: { ideas: number; votes: number; comments: number }
    reports: Array<{
      id: string; reason: string; details: string | null; targetType: string
      createdAt: string; reporter: { id: string; name: string | null; email: string }
    }>
    totalReports: number
  }
  const [flaggedUsers, setFlaggedUsers] = useState<FlaggedUser[]>([])
  const [bannedUsers, setBannedUsers] = useState<FlaggedUser[]>([])
  const [flaggedLoading, setFlaggedLoading] = useState(false)
  const [flagActioning, setFlagActioning] = useState<string | null>(null)

  // Challenge state
  const [challengeTriggering, setChallengeTriggering] = useState(false)
  const [challengeStats, setChallengeStats] = useState<ChallengeStats | null>(null)
  const [challengeStatsLoading, setChallengeStatsLoading] = useState(false)
  const [challengeResult, setChallengeResult] = useState<string | null>(null)

  // Rate limit config
  const [rateLimits, setRateLimits] = useState<Array<{
    id?: string; endpoint: string; maxRequests: number; windowMs: number; keyType: string; enabled: boolean
  }>>([])
  const [rateLimitsLoading, setRateLimitsLoading] = useState(false)
  const [rateLimitsSaving, setRateLimitsSaving] = useState<string | null>(null)

  // Podiums state
  const [podiums, setPodiums] = useState<Array<{
    id: string; title: string; pinned: boolean; views: number; createdAt: string
    author: { id: string; name: string | null; image: string | null; isAI?: boolean }
    deliberation: { id: string; question: string } | null
  }>>([])
  const [podiumsLoading, setPodiumsLoading] = useState(false)
  const [podiumsCursor, setPodiumsCursor] = useState<string | null>(null)
  const [podiumsHasMore, setPodiumsHasMore] = useState(false)
  const [podiumActioning, setPodiumActioning] = useState<string | null>(null)

  // Groups state
  const [groups, setGroups] = useState<Array<{
    id: string; name: string; slug: string; description: string | null; isPublic: boolean; createdAt: string
    creator: { id: string; name: string | null; email: string; image: string | null }
    _count: { members: number; deliberations: number; chatMessages: number; bans: number }
  }>>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [groupDeleting, setGroupDeleting] = useState<string | null>(null)
  const [groupSearch, setGroupSearch] = useState('')

  const fetchGroups = useCallback(async () => {
    setGroupsLoading(true)
    try {
      const res = await fetch('/api/admin/communities')
      if (res.ok) {
        const data = await res.json()
        setGroups(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error('Failed to fetch groups:', error)
    } finally {
      setGroupsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'groups' && groups.length === 0) {
      fetchGroups()
    }
  }, [activeTab, fetchGroups, groups.length])

  const handleGroupDelete = async (groupId: string, groupName: string) => {
    if (!window.confirm(`Delete group "${groupName}" and all its data (members, bans, messages)? Deliberations will be unlinked but not deleted. This cannot be undone.`)) return
    setGroupDeleting(groupId)
    try {
      const res = await fetch(`/api/admin/communities/${groupId}`, { method: 'DELETE' })
      if (res.ok) {
        setGroups(prev => prev.filter(g => g.id !== groupId))
      } else {
        const data = await res.json().catch(() => ({}))
        alert(`Delete failed: ${data.error || res.status}`)
      }
    } catch (err) {
      alert(`Delete failed: ${err}`)
    } finally {
      setGroupDeleting(null)
    }
  }

  const fetchPodiums = useCallback(async (cursor?: string | null) => {
    setPodiumsLoading(true)
    try {
      const params = new URLSearchParams({ limit: '30' })
      if (cursor) params.set('cursor', cursor)
      const res = await fetch(`/api/podiums?${params}`)
      if (res.ok) {
        const data = await res.json()
        if (cursor) {
          setPodiums(prev => [...prev, ...(data.items || [])])
        } else {
          setPodiums(data.items || [])
        }
        setPodiumsCursor(data.nextCursor || null)
        setPodiumsHasMore(!!data.nextCursor)
      }
    } catch (error) {
      console.error('Failed to fetch podiums:', error)
    } finally {
      setPodiumsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'podiums' && podiums.length === 0) {
      fetchPodiums()
    }
  }, [activeTab, fetchPodiums, podiums.length])

  const handlePodiumPin = async (podiumId: string, pinned: boolean) => {
    setPodiumActioning(podiumId)
    try {
      const res = await fetch(`/api/podiums/${podiumId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned }),
      })
      if (res.ok) {
        setPodiums(prev => prev.map(p => p.id === podiumId ? { ...p, pinned } : p))
      }
    } catch {
      console.error('Failed to pin/unpin podium')
    } finally {
      setPodiumActioning(null)
    }
  }

  const handlePodiumDelete = async (podiumId: string, title: string) => {
    if (!confirm(`Delete podium post "${title}"? This cannot be undone.`)) return
    setPodiumActioning(podiumId)
    try {
      const res = await fetch(`/api/podiums/${podiumId}`, { method: 'DELETE' })
      if (res.ok) {
        setPodiums(prev => prev.filter(p => p.id !== podiumId))
      } else {
        const data = await res.json().catch(() => ({}))
        alert(`Delete failed: ${data.error || res.status}`)
      }
    } catch (err) {
      alert(`Delete failed: ${err}`)
    } finally {
      setPodiumActioning(null)
    }
  }

  const fetchReports = useCallback(async (statusFilter = reportsFilter, page = reportsPage) => {
    setReportsLoading(true)
    try {
      const params = new URLSearchParams({ status: statusFilter, page: String(page) })
      const res = await fetch(`/api/reports?${params}`)
      if (res.ok) {
        const data = await res.json()
        setReports(data.reports || [])
        setReportsTotal(data.total || 0)
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error)
    } finally {
      setReportsLoading(false)
    }
  }, [reportsFilter, reportsPage])

  const fetchFlaggedUsers = useCallback(async () => {
    setFlaggedLoading(true)
    try {
      const res = await fetch('/api/admin/flagged-users')
      if (res.ok) {
        const data = await res.json()
        setFlaggedUsers(data.flagged || [])
        setBannedUsers(data.banned || [])
      }
    } catch (error) {
      console.error('Failed to fetch flagged users:', error)
    } finally {
      setFlaggedLoading(false)
    }
  }, [])

  const handleFlagAction = async (userId: string, action: 'ban' | 'unban') => {
    let reason = ''
    if (action === 'ban') {
      reason = window.prompt('Ban reason:') || ''
      if (!reason) return
    }
    setFlagActioning(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      })
      if (res.ok) {
        fetchFlaggedUsers()
        fetchReports()
      } else {
        const err = await res.json()
        alert(`Failed: ${err.error}`)
      }
    } catch {
      alert('Failed to perform action')
    } finally {
      setFlagActioning(null)
    }
  }

  useEffect(() => {
    if (activeTab === 'moderation') {
      fetchReports(reportsFilter, reportsPage)
      fetchFlaggedUsers()
    }
  }, [activeTab, reportsFilter, reportsPage, fetchReports, fetchFlaggedUsers])

  const handleReportAction = async (reportId: string, status: 'RESOLVED' | 'DISMISSED', action?: string) => {
    setReportActioning(reportId)
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, action }),
      })
      if (res.ok) {
        fetchReports()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to resolve report')
      }
    } catch {
      alert('Failed to resolve report')
    } finally {
      setReportActioning(null)
    }
  }

  const fetchDeliberations = async () => {
    try {
      const res = await fetch('/api/admin/deliberations')
      if (res.ok) {
        const data = await res.json()
        // Ensure we have an array
        setDeliberations(Array.isArray(data) ? data : [])
      } else {
        setDeliberations([])
      }
    } catch (error) {
      console.error('Failed to fetch deliberations:', error)
      setDeliberations([])
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = useCallback(async (search = usersSearch, statusFilter = usersStatus, page = usersPage) => {
    setUsersLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      if (statusFilter) params.set('status', statusFilter)
      params.set('page', String(page))
      params.set('limit', '20')
      const res = await fetch(`/api/admin/users?${params}`)
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
        setUsersTotal(data.total || 0)
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setUsersLoading(false)
    }
  }, [usersSearch, usersStatus, usersPage])

  // Debounced search for users
  useEffect(() => {
    if (activeTab !== 'users') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setUsersPage(1)
      fetchUsers(usersSearch, usersStatus, 1)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [usersSearch, usersStatus, activeTab, fetchUsers])

  // Page change for users
  useEffect(() => {
    if (activeTab === 'users' && usersPage > 1) {
      fetchUsers(usersSearch, usersStatus, usersPage)
    }
  }, [usersPage, activeTab, fetchUsers, usersSearch, usersStatus])

  // Challenge functions
  const fetchChallengeStats = useCallback(async () => {
    setChallengeStatsLoading(true)
    try {
      const res = await fetch('/api/admin/trigger-challenge')
      if (res.ok) setChallengeStats(await res.json())
    } catch { /* silent */ }
    setChallengeStatsLoading(false)
  }, [])

  const triggerChallenge = async () => {
    if (!window.confirm('Force ALL users to re-verify now?')) return
    setChallengeTriggering(true)
    setChallengeResult(null)
    try {
      const res = await fetch('/api/admin/trigger-challenge', { method: 'POST' })
      const data = await res.json()
      setChallengeResult(`Triggered for ${data.affected} users`)
      fetchChallengeStats()
    } catch {
      setChallengeResult('Failed to trigger')
    }
    setChallengeTriggering(false)
  }

  // Load challenge stats on mount
  useEffect(() => { fetchChallengeStats() }, [fetchChallengeStats])

  const handleUserAction = async (userId: string, action: 'ban' | 'unban' | 'delete') => {
    let reason = ''
    if (action === 'ban') {
      reason = window.prompt('Ban reason:') || ''
      if (!reason) return
    }
    if (action === 'delete') {
      if (!window.confirm('Permanently delete this user? This cannot be undone.')) return
    }
    setUserActioning(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      })
      if (res.ok) {
        fetchUsers()
      } else {
        const err = await res.json()
        alert(`Failed: ${err.error}`)
      }
    } catch {
      alert('Action failed')
    } finally {
      setUserActioning(null)
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
      return
    }

    if (status === 'authenticated') {
      // Check admin status
      fetch('/api/admin/check')
        .then(res => res.json())
        .then(data => {
          setIsAdmin(data.isAdmin)
          if (data.isAdmin) {
            fetchDeliberations()
            // Fetch rate limits
            setRateLimitsLoading(true)
            fetch('/api/admin/rate-limits')
              .then(r => r.json())
              .then(d => setRateLimits(Array.isArray(d) ? d : []))
              .catch(() => {})
              .finally(() => setRateLimitsLoading(false))
          }
        })
        .catch(() => setIsAdmin(false))
    }
  }, [status, router])

  const handleDelete = async (id: string, question: string) => {
    if (!confirm(`Are you sure you want to delete "${question}"?\n\nThis will permanently delete all ideas, votes, and comments.`)) {
      return
    }

    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/deliberations/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setDeliberations(prev => prev.filter(d => d.id !== id))
      } else {
        const error = await res.json()
        alert(`Failed to delete: ${error.error}`)
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete deliberation')
    } finally {
      setDeleting(null)
    }
  }

  const filteredDeliberations = deliberations.filter(d => {
    if (filter === 'public' && !d.isPublic) return false
    if (filter === 'private' && d.isPublic) return false
    if (search && !d.question.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const phaseStyles: Record<string, string> = {
    SUBMISSION: 'bg-accent text-white',
    VOTING: 'bg-warning text-white',
    COMPLETED: 'bg-success text-white',
    ACCUMULATING: 'bg-purple text-white',
  }

  // Loading state
  if (status === 'loading' || isAdmin === null) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    )
  }

  // Block non-admin users
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Access Denied</h1>
          <p className="text-muted mb-6">You don&apos;t have permission to access this page.</p>
          <Link href="/" className="text-accent hover:text-accent-hover">
            Go to homepage
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      {/* ── CHALLENGE CONTROL — big red button ── */}
      <div className="bg-error/10 border-b-2 border-error">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <button
              onClick={triggerChallenge}
              disabled={challengeTriggering}
              className="bg-error hover:bg-error-hover text-white font-bold text-lg px-8 py-4 rounded-lg transition-colors disabled:opacity-50 shadow-lg shrink-0"
            >
              {challengeTriggering ? 'Triggering...' : 'TRIGGER CHALLENGE — ALL USERS'}
            </button>
            <div className="flex-1 min-w-0">
              {challengeResult && (
                <p className="text-success font-semibold text-sm mb-1">{challengeResult}</p>
              )}
              {challengeStatsLoading ? (
                <p className="text-muted text-sm">Loading stats...</p>
              ) : challengeStats && (
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="text-muted">Total challenges: <span className="text-foreground font-mono">{challengeStats.totalLogs}</span></span>
                  {challengeStats.resultCounts.map(r => (
                    <span key={r.result} className={r.result === 'passed' ? 'text-success' : 'text-error'}>
                      {r.result}: <span className="font-mono">{r.count}</span>
                    </span>
                  ))}
                  {challengeStats.flaggedUsers.length > 0 && (
                    <span className="text-warning">Flagged users: <span className="font-mono">{challengeStats.flaggedUsers.length}</span></span>
                  )}
                </div>
              )}
              {challengeStats && challengeStats.recentFails.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-muted cursor-pointer hover:text-foreground">
                    Recent failures ({challengeStats.recentFails.length})
                  </summary>
                  <div className="mt-1 max-h-40 overflow-y-auto space-y-1">
                    {challengeStats.recentFails.slice(0, 10).map(f => (
                      <div key={f.id} className="text-xs text-muted bg-background rounded px-2 py-1 flex gap-3">
                        <span className="text-error font-mono">{f.result}</span>
                        <span>{f.user.email}</span>
                        <span>ptr:{f.pointerEvents} dur:{f.chaseDurationMs}ms evd:{f.evadeCount}</span>
                        <span className="text-subtle">{new Date(f.createdAt).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <Link href="/" className="text-muted hover:text-foreground text-sm mb-2 inline-block">
              &larr; Back to home
            </Link>
            <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
            <p className="text-muted text-sm mt-1">Manage deliberations, run tests, and monitor activity</p>
          </div>
          <Link
            href="/admin/test"
            className="bg-surface hover:bg-header hover:text-white text-muted border border-border px-4 py-2 rounded transition-colors text-sm"
          >
            Advanced Test Page →
          </Link>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 mb-6 bg-background rounded-lg border border-border p-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('deliberations')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors shrink-0 ${
              activeTab === 'deliberations' ? 'bg-header text-white' : 'text-muted hover:text-foreground'
            }`}
          >
            Deliberations
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors shrink-0 ${
              activeTab === 'users' ? 'bg-header text-white' : 'text-muted hover:text-foreground'
            }`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('moderation')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors shrink-0 ${
              activeTab === 'moderation' ? 'bg-header text-white' : 'text-muted hover:text-foreground'
            }`}
          >
            Moderation
          </button>
          <button
            onClick={() => setActiveTab('podiums')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors shrink-0 ${
              activeTab === 'podiums' ? 'bg-header text-white' : 'text-muted hover:text-foreground'
            }`}
          >
            Podiums
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors shrink-0 ${
              activeTab === 'groups' ? 'bg-header text-white' : 'text-muted hover:text-foreground'
            }`}
          >
            Groups
          </button>
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            {/* Search & Filter */}
            <div className="bg-background rounded-lg border border-border p-4 mb-6 flex gap-4 items-center flex-wrap">
              <input
                type="text"
                placeholder="Search by name or email..."
                value={usersSearch}
                onChange={(e) => setUsersSearch(e.target.value)}
                className="bg-surface border border-border text-foreground rounded-lg px-3 py-2 flex-1 min-w-[200px] focus:outline-none focus:border-accent"
              />
              <select
                value={usersStatus}
                onChange={(e) => setUsersStatus(e.target.value as '' | UserStatus)}
                className="bg-surface border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="BANNED">Banned</option>
                <option value="DELETED">Deleted</option>
              </select>
              <span className="text-muted text-sm">{usersTotal} users</span>
            </div>

            {/* Users Table */}
            <div className="bg-background rounded-lg border border-border overflow-x-auto mb-6">
              {usersLoading ? (
                <div className="p-8 text-center text-muted">Loading...</div>
              ) : users.length === 0 ? (
                <div className="p-8 text-center text-muted">No users found</div>
              ) : (
                <table className="w-full">
                  <thead className="bg-surface border-b border-border">
                    <tr>
                      <th className="text-left p-4 text-muted font-medium text-sm">User</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Status</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Joined</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Zip</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Ideas</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Votes</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-t border-border hover:bg-surface">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <UserAvatar image={u.image} name={u.name} />
                            <div>
                              <Link href={`/user/${u.id}`} className="text-foreground hover:text-accent font-medium text-sm">
                                {u.name || 'No name'}
                              </Link>
                              <div className="text-muted text-xs">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            u.status === 'ACTIVE' ? 'bg-success-bg text-success' :
                            u.status === 'BANNED' ? 'bg-error-bg text-error' :
                            'bg-surface text-muted'
                          }`}>
                            {u.status}
                          </span>
                          {u.banReason && (
                            <div className="text-xs text-muted mt-1" title={u.banReason}>
                              {u.banReason.length > 30 ? u.banReason.slice(0, 30) + '...' : u.banReason}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-muted text-sm font-mono">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-4 text-muted text-xs">
                          {u.zipCode || <span className="text-subtle">--</span>}
                        </td>
                        <td className="p-4 text-muted font-mono text-sm">{u._count.ideas}</td>
                        <td className="p-4 text-muted font-mono text-sm">{u._count.votes}</td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            {u.status === 'ACTIVE' && (
                              <button
                                onClick={() => handleUserAction(u.id, 'ban')}
                                disabled={userActioning === u.id}
                                className="text-warning hover:text-warning-hover text-sm disabled:opacity-50"
                              >
                                Ban
                              </button>
                            )}
                            {u.status === 'BANNED' && (
                              <button
                                onClick={() => handleUserAction(u.id, 'unban')}
                                disabled={userActioning === u.id}
                                className="text-success hover:text-success-hover text-sm disabled:opacity-50"
                              >
                                Unban
                              </button>
                            )}
                            {u.status !== 'DELETED' && (
                              <button
                                onClick={() => handleUserAction(u.id, 'delete')}
                                disabled={userActioning === u.id}
                                className="text-error hover:text-error-hover text-sm disabled:opacity-50"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {usersTotal > 20 && (
              <div className="flex items-center justify-center gap-4 mb-6">
                <button
                  onClick={() => setUsersPage(p => Math.max(1, p - 1))}
                  disabled={usersPage <= 1}
                  className="px-3 py-1.5 rounded text-sm bg-surface border border-border text-muted hover:text-foreground disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-muted text-sm">
                  Page {usersPage} of {Math.ceil(usersTotal / 20)}
                </span>
                <button
                  onClick={() => setUsersPage(p => p + 1)}
                  disabled={usersPage >= Math.ceil(usersTotal / 20)}
                  className="px-3 py-1.5 rounded text-sm bg-surface border border-border text-muted hover:text-foreground disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {/* Moderation Tab */}
        {activeTab === 'moderation' && (
          <div>
            {/* Flagged Users Section */}
            {(flaggedUsers.length > 0 || bannedUsers.length > 0) && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-foreground mb-3">Flagged Users</h3>
                {flaggedLoading ? (
                  <div className="p-4 text-center text-muted text-sm">Loading...</div>
                ) : (
                  <div className="space-y-3">
                    {flaggedUsers.map(u => (
                      <div key={u.id} className="bg-background rounded-lg border border-warning/30 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <UserAvatar image={u.image} name={u.name} />
                            <div className="min-w-0">
                              <Link href={`/user/${u.id}`} className="text-foreground hover:text-accent font-medium text-sm">
                                {u.name || 'Anonymous'}
                              </Link>
                              <div className="text-muted text-xs">{u.email}</div>
                              <div className="text-muted text-xs font-mono">
                                {u._count.ideas} ideas &middot; {u._count.votes} votes &middot; {u._count.comments} comments
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-mono text-warning">{u.totalReports} report{u.totalReports !== 1 ? 's' : ''}</span>
                            {u.status === 'ACTIVE' ? (
                              <button
                                onClick={() => handleFlagAction(u.id, 'ban')}
                                disabled={flagActioning === u.id}
                                className="text-xs px-3 py-1.5 rounded bg-error/10 text-error border border-error/30 hover:bg-error/20 transition-colors disabled:opacity-50"
                              >
                                Ban
                              </button>
                            ) : u.status === 'BANNED' ? (
                              <button
                                onClick={() => handleFlagAction(u.id, 'unban')}
                                disabled={flagActioning === u.id}
                                className="text-xs px-3 py-1.5 rounded bg-success/10 text-success border border-success/30 hover:bg-success/20 transition-colors disabled:opacity-50"
                              >
                                Unban
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {/* Report reasons */}
                        <div className="mt-3 space-y-1.5">
                          {u.reports.map(r => (
                            <div key={r.id} className="flex items-start gap-2 text-xs">
                              <span className={`shrink-0 px-1.5 py-0.5 rounded font-medium ${
                                r.reason === 'SPAM' ? 'bg-warning/15 text-warning' :
                                r.reason === 'HARASSMENT' || r.reason === 'HATE_SPEECH' ? 'bg-error/15 text-error' :
                                'bg-surface text-muted'
                              }`}>
                                {r.reason.replace('_', ' ')}
                              </span>
                              <span className="text-muted">{r.targetType.toLowerCase()}</span>
                              {r.details && <span className="text-foreground italic truncate">&quot;{r.details}&quot;</span>}
                              <span className="text-muted shrink-0 ml-auto">{new Date(r.createdAt).toLocaleDateString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {bannedUsers.map(u => (
                      <div key={u.id} className="bg-background rounded-lg border border-error/30 p-4 opacity-75">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <UserAvatar image={u.image} name={u.name} />
                            <div className="min-w-0">
                              <Link href={`/user/${u.id}`} className="text-foreground hover:text-accent font-medium text-sm">
                                {u.name || 'Anonymous'}
                              </Link>
                              <div className="text-muted text-xs">{u.email}</div>
                              {u.banReason && <div className="text-error text-xs mt-0.5">{u.banReason}</div>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs px-2 py-0.5 rounded bg-error-bg text-error font-medium">BANNED</span>
                            <button
                              onClick={() => handleFlagAction(u.id, 'unban')}
                              disabled={flagActioning === u.id}
                              className="text-xs px-3 py-1.5 rounded bg-success/10 text-success border border-success/30 hover:bg-success/20 transition-colors disabled:opacity-50"
                            >
                              Unban
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Filter */}
            <div className="bg-background rounded-lg border border-border p-4 mb-6 flex gap-4 items-center flex-wrap">
              <span className="text-muted text-sm">Status:</span>
              {(['PENDING', 'RESOLVED', 'DISMISSED'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => { setReportsFilter(s); setReportsPage(1) }}
                  className={`px-3 py-1.5 rounded text-sm transition-colors ${
                    reportsFilter === s ? 'bg-header text-white' : 'bg-surface text-muted border border-border hover:text-foreground'
                  }`}
                >
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
              <span className="text-muted text-sm ml-auto font-mono">{reportsTotal} report{reportsTotal !== 1 ? 's' : ''}</span>
            </div>

            {/* Reports List */}
            <div className="bg-background rounded-lg border border-border overflow-x-auto">
              {reportsLoading ? (
                <div className="p-8 text-center text-muted">Loading reports...</div>
              ) : reports.length === 0 ? (
                <div className="p-8 text-center text-muted">
                  {reportsFilter === 'PENDING' ? 'No pending reports' : 'No reports found'}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {reports.map(r => (
                    <div key={r.id} className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              r.reason === 'SPAM' ? 'bg-warning/15 text-warning' :
                              r.reason === 'HARASSMENT' || r.reason === 'HATE_SPEECH' ? 'bg-error/15 text-error' :
                              'bg-surface text-muted'
                            }`}>
                              {r.reason.replace('_', ' ')}
                            </span>
                            <span className="text-xs text-muted">
                              {r.targetType.toLowerCase()} &middot; {new Date(r.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm text-foreground mb-1">
                            <span className="text-muted">Reported by:</span>{' '}
                            <Link href={`/user/${r.reporter.id}`} className="text-accent hover:underline">
                              {r.reporter.name || r.reporter.email}
                            </Link>
                          </p>
                          {r.details && (
                            <p className="text-sm text-muted italic">&quot;{r.details}&quot;</p>
                          )}
                          <p className="text-xs text-muted mt-1 font-mono">
                            Target ID: {r.targetId}
                          </p>
                          {r.resolvedBy && (
                            <p className="text-xs text-success mt-1">
                              Resolved by {r.resolvedBy.name || 'Admin'}: {r.resolution || 'No details'}
                            </p>
                          )}
                        </div>

                        {r.status === 'PENDING' && (
                          <div className="flex flex-col gap-1 shrink-0">
                            {r.targetType === 'COMMENT' && (
                              <button
                                onClick={() => handleReportAction(r.id, 'RESOLVED', 'remove_comment')}
                                disabled={reportActioning === r.id}
                                className="text-xs px-3 py-1.5 rounded bg-error/10 text-error border border-error/30 hover:bg-error/20 transition-colors disabled:opacity-50"
                              >
                                Remove Comment
                              </button>
                            )}
                            {r.targetType === 'IDEA' && (
                              <button
                                onClick={() => handleReportAction(r.id, 'RESOLVED', 'remove_idea')}
                                disabled={reportActioning === r.id}
                                className="text-xs px-3 py-1.5 rounded bg-error/10 text-error border border-error/30 hover:bg-error/20 transition-colors disabled:opacity-50"
                              >
                                Remove Idea
                              </button>
                            )}
                            {r.targetType === 'USER' && (
                              <button
                                onClick={() => handleReportAction(r.id, 'RESOLVED', 'ban_user')}
                                disabled={reportActioning === r.id}
                                className="text-xs px-3 py-1.5 rounded bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20 transition-colors disabled:opacity-50"
                              >
                                Ban User
                              </button>
                            )}
                            <button
                              onClick={() => handleReportAction(r.id, 'DISMISSED')}
                              disabled={reportActioning === r.id}
                              className="text-xs px-3 py-1.5 rounded bg-surface text-muted border border-border hover:text-foreground transition-colors disabled:opacity-50"
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            {reportsTotal > 20 && (
              <div className="flex items-center justify-center gap-4 mt-4">
                <button
                  onClick={() => setReportsPage(p => Math.max(1, p - 1))}
                  disabled={reportsPage <= 1}
                  className="px-3 py-1.5 rounded text-sm bg-surface border border-border text-muted hover:text-foreground disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-muted text-sm">
                  Page {reportsPage} of {Math.ceil(reportsTotal / 20)}
                </span>
                <button
                  onClick={() => setReportsPage(p => p + 1)}
                  disabled={reportsPage >= Math.ceil(reportsTotal / 20)}
                  className="px-3 py-1.5 rounded text-sm bg-surface border border-border text-muted hover:text-foreground disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {/* Podiums Tab */}
        {activeTab === 'podiums' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-muted text-sm">{podiums.length} podium posts</span>
              <button
                onClick={() => fetchPodiums()}
                className="bg-surface hover:bg-surface-alt text-muted border border-border px-3 py-1.5 rounded transition-colors text-sm"
              >
                Refresh
              </button>
            </div>

            <div className="bg-background rounded-lg border border-border overflow-x-auto">
              {podiumsLoading && podiums.length === 0 ? (
                <div className="p-8 text-center text-muted">Loading podiums...</div>
              ) : podiums.length === 0 ? (
                <div className="p-8 text-center text-muted">No podium posts yet</div>
              ) : (
                <table className="w-full">
                  <thead className="bg-surface border-b border-border">
                    <tr>
                      <th className="text-left p-4 text-muted font-medium text-sm">Title</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Author</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Linked Chant</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Views</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Date</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {podiums.map(p => (
                      <tr key={p.id} className="border-t border-border hover:bg-surface">
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            {p.pinned && (
                              <span className="text-xs bg-warning-bg text-warning px-1.5 py-0.5 rounded border border-warning">Pinned</span>
                            )}
                            <Link href={`/podium/${p.id}`} className="text-foreground hover:text-accent font-medium text-sm">
                              {p.title.length > 50 ? p.title.slice(0, 50) + '...' : p.title}
                            </Link>
                          </div>
                        </td>
                        <td className="p-4">
                          <Link href={`/user/${p.author.id}`} className="flex items-center gap-2 text-sm text-muted hover:text-accent">
                            <UserAvatar image={p.author.image} name={p.author.name} />
                            <span>{p.author.name || 'Anonymous'}</span>
                            {p.author.isAI && <span className="text-[10px] font-semibold text-purple border border-purple/30 px-1 py-0.5 rounded">AI</span>}
                          </Link>
                        </td>
                        <td className="p-4">
                          {p.deliberation ? (
                            <Link href={`/chants/${p.deliberation.id}`} className="text-accent hover:underline text-sm">
                              {p.deliberation.question.length > 30 ? p.deliberation.question.slice(0, 30) + '...' : p.deliberation.question}
                            </Link>
                          ) : (
                            <span className="text-muted text-sm">--</span>
                          )}
                        </td>
                        <td className="p-4 text-muted font-mono text-sm">{p.views}</td>
                        <td className="p-4 text-muted text-sm font-mono">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handlePodiumPin(p.id, !p.pinned)}
                              disabled={podiumActioning === p.id}
                              className={`text-sm disabled:opacity-50 ${p.pinned ? 'text-warning hover:text-warning-hover' : 'text-muted hover:text-foreground'}`}
                            >
                              {p.pinned ? 'Unpin' : 'Pin'}
                            </button>
                            <button
                              onClick={() => handlePodiumDelete(p.id, p.title)}
                              disabled={podiumActioning === p.id}
                              className="text-error hover:text-error-hover text-sm disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {podiumsHasMore && (
              <div className="text-center mt-4">
                <button
                  onClick={() => fetchPodiums(podiumsCursor)}
                  disabled={podiumsLoading}
                  className="px-4 py-2 rounded text-sm bg-surface border border-border text-muted hover:text-foreground disabled:opacity-50"
                >
                  {podiumsLoading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Groups Tab */}
        {activeTab === 'groups' && (
          <div>
            <div className="bg-background rounded-lg border border-border p-4 mb-6 flex gap-4 items-center flex-wrap">
              <input
                type="text"
                placeholder="Search by name or slug..."
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                className="bg-surface border border-border text-foreground rounded-lg px-3 py-2 flex-1 min-w-[200px] focus:outline-none focus:border-accent"
              />
              <span className="text-muted text-sm">{groups.length} groups</span>
              <button
                onClick={() => fetchGroups()}
                className="bg-surface hover:bg-surface-alt text-muted border border-border px-3 py-1.5 rounded transition-colors text-sm"
              >
                Refresh
              </button>
            </div>

            <div className="bg-background rounded-lg border border-border overflow-x-auto">
              {groupsLoading && groups.length === 0 ? (
                <div className="p-8 text-center text-muted">Loading groups...</div>
              ) : groups.length === 0 ? (
                <div className="p-8 text-center text-muted">No groups yet</div>
              ) : (
                <table className="w-full">
                  <thead className="bg-surface border-b border-border">
                    <tr>
                      <th className="text-left p-4 text-muted font-medium text-sm">Group</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Creator</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Members</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Chants</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Messages</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Access</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Created</th>
                      <th className="text-left p-4 text-muted font-medium text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups
                      .filter(g => {
                        if (!groupSearch) return true
                        const q = groupSearch.toLowerCase()
                        return g.name.toLowerCase().includes(q) || g.slug.toLowerCase().includes(q)
                      })
                      .map(g => (
                      <tr key={g.id} className="border-t border-border hover:bg-surface">
                        <td className="p-4">
                          <Link href={`/groups/${g.slug}`} className="text-foreground hover:text-accent font-medium text-sm">
                            {g.name}
                          </Link>
                          <p className="text-xs text-muted mt-0.5">/{g.slug}</p>
                        </td>
                        <td className="p-4">
                          <Link href={`/user/${g.creator.id}`} className="flex items-center gap-2 text-sm text-muted hover:text-accent">
                            <UserAvatar image={g.creator.image} name={g.creator.name} />
                            <span>{g.creator.name || g.creator.email}</span>
                          </Link>
                        </td>
                        <td className="p-4 text-muted font-mono text-sm">{g._count.members}</td>
                        <td className="p-4 text-muted font-mono text-sm">{g._count.deliberations}</td>
                        <td className="p-4 text-muted font-mono text-sm">{g._count.chatMessages}</td>
                        <td className="p-4">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            g.isPublic ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'
                          }`}>
                            {g.isPublic ? 'Public' : 'Private'}
                          </span>
                          {g._count.bans > 0 && (
                            <span className="text-xs text-error ml-2">{g._count.bans} banned</span>
                          )}
                        </td>
                        <td className="p-4 text-muted text-sm font-mono">
                          {new Date(g.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => handleGroupDelete(g.id, g.name)}
                            disabled={groupDeleting === g.id}
                            className="text-error hover:text-error-hover text-sm disabled:opacity-50"
                          >
                            {groupDeleting === g.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Deliberations Tab */}
        {activeTab === 'deliberations' && (<>

        {/* Test Tools */}
        <div className="bg-background rounded-lg border border-border p-4 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-3">Create Test Deliberation</h2>

          {/* Row 1: Basic settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs text-muted mb-1">Question (optional)</label>
              <input
                type="text"
                value={testQuestion}
                onChange={(e) => setTestQuestion(e.target.value)}
                placeholder="Auto-generated if blank"
                className="w-full bg-surface border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                disabled={creating}
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Start in Phase</label>
              <select
                value={targetPhase}
                onChange={(e) => setTargetPhase(e.target.value as 'SUBMISSION' | 'VOTING' | 'ACCUMULATING')}
                className="w-full bg-surface border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                disabled={creating}
              >
                <option value="SUBMISSION">SUBMISSION (empty)</option>
                <option value="VOTING">VOTING (with test users & ideas)</option>
                <option value="ACCUMULATING">ACCUMULATING (with champion)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Test Users (for VOTING/ACCUM)</label>
              <input
                type="number"
                value={testUsers}
                onChange={(e) => setTestUsers(parseInt(e.target.value) || 20)}
                min={5}
                max={100}
                className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent ${
                  creating || targetPhase === 'SUBMISSION'
                    ? 'bg-surface/50 border-border/50 text-muted cursor-not-allowed'
                    : 'bg-surface border-border text-foreground'
                }`}
                disabled={creating || targetPhase === 'SUBMISSION'}
              />
            </div>
          </div>

          {/* Row 2: Voting trigger settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <div>
              <label className="block text-xs text-muted mb-1">Voting Starts</label>
              <select
                value={votingTrigger}
                onChange={(e) => setVotingTrigger(e.target.value as 'manual' | 'timer' | 'ideas')}
                className="w-full bg-surface border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                disabled={creating || targetPhase !== 'SUBMISSION'}
              >
                <option value="manual">Manual (facilitator)</option>
                <option value="timer">Timer</option>
                <option value="ideas">Idea goal</option>
              </select>
            </div>
            {votingTrigger === 'timer' && (
              <div>
                <label className="block text-xs text-muted mb-1">Submission Time (min)</label>
                <input
                  type="number"
                  value={timerMinutes}
                  onChange={(e) => setTimerMinutes(parseInt(e.target.value) || 60)}
                  min={1}
                  className="w-full bg-surface border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  disabled={creating || targetPhase !== 'SUBMISSION'}
                />
              </div>
            )}
            {votingTrigger === 'ideas' && (
              <div>
                <label className="block text-xs text-muted mb-1">Idea Goal</label>
                <input
                  type="number"
                  value={ideaGoal}
                  onChange={(e) => setIdeaGoal(parseInt(e.target.value) || 20)}
                  min={2}
                  className="w-full bg-surface border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  disabled={creating || targetPhase !== 'SUBMISSION'}
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-muted mb-1">Voting Time/Tier (min)</label>
              <input
                type="number"
                value={votingMinutes}
                onChange={(e) => setVotingMinutes(parseInt(e.target.value) || 5)}
                min={1}
                className="w-full bg-surface border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                disabled={creating}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-muted pb-2">
                <input
                  type="checkbox"
                  checked={enableRolling}
                  onChange={(e) => setEnableRolling(e.target.checked)}
                  className="rounded"
                  disabled={creating}
                />
                Rolling mode
              </label>
            </div>
          </div>

          {createStatus && (
            <div className="mb-4 p-2 bg-surface rounded text-sm text-muted font-mono">
              {createStatus}
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={async () => {
                setCreating(true)
                setCreateStatus('Creating deliberation...')
                try {
                  const question = testQuestion.trim() || `Test ${targetPhase} ${Date.now()}`

                  // Build creation payload with trigger settings
                  // API expects milliseconds, so convert from minutes
                  const createPayload: Record<string, unknown> = {
                    question,
                    description: `Auto-created test deliberation (target: ${targetPhase})`,
                    isPublic: true,
                    tags: ['test'],
                    accumulationEnabled: enableRolling || targetPhase === 'ACCUMULATING',
                    votingTimeoutMs: votingMinutes * 60 * 1000, // Convert minutes to ms
                  }

                  // Add voting trigger based on selection
                  if (votingTrigger === 'timer') {
                    createPayload.submissionDurationMs = timerMinutes * 60 * 1000 // Convert minutes to ms
                  } else if (votingTrigger === 'ideas') {
                    createPayload.ideaGoal = ideaGoal
                  }
                  // 'manual' = no trigger fields set (relies on facilitator starting voting)

                  // Step 1: Create deliberation
                  const createRes = await fetch('/api/deliberations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(createPayload),
                  })

                  if (!createRes.ok) {
                    const err = await createRes.json()
                    throw new Error(err.error || 'Failed to create')
                  }

                  const deliberation = await createRes.json()

                  // Just redirect to admin page - user can manually trigger populate/voting from there
                  router.push(`/admin/deliberation/${deliberation.id}`)

                } catch (err) {
                  setCreateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
                } finally {
                  setCreating(false)
                }
              }}
              disabled={creating}
              className="bg-accent hover:bg-accent-hover disabled:bg-muted text-white px-6 py-2 rounded transition-colors text-sm font-medium"
            >
              {creating ? 'Creating...' : 'Create & Open'}
            </button>
            <button
              onClick={async () => {
                if (targetPhase === 'SUBMISSION') {
                  alert('Select VOTING or ACCUMULATING phase to simulate a mid-progress deliberation')
                  return
                }
                setCreating(true)
                setCreateStatus('Creating deliberation...')
                try {
                  const question = testQuestion.trim() || `Test ${targetPhase} ${Date.now()}`

                  // Build creation payload
                  const createPayload: Record<string, unknown> = {
                    question,
                    description: `Simulated test deliberation (target: ${targetPhase})`,
                    isPublic: true,
                    tags: ['test'],
                    accumulationEnabled: enableRolling || targetPhase === 'ACCUMULATING',
                    votingTimeoutMs: votingMinutes * 60 * 1000,
                  }

                  // Step 1: Create deliberation
                  const createRes = await fetch('/api/deliberations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(createPayload),
                  })

                  if (!createRes.ok) {
                    const err = await createRes.json()
                    throw new Error(err.error || 'Failed to create')
                  }

                  const deliberation = await createRes.json()
                  const delibId = deliberation.id

                  // Step 2: Populate with test users and ideas
                  setCreateStatus('Populating test users and ideas...')
                  const populateRes = await fetch('/api/admin/test/populate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      deliberationId: delibId,
                      userCount: testUsers,
                      ideasPerUser: 1
                    }),
                  })

                  if (!populateRes.ok) {
                    const err = await populateRes.json()
                    throw new Error(err.error || 'Failed to populate')
                  }

                  // Step 3: Start voting
                  setCreateStatus('Starting voting phase...')
                  const startRes = await fetch(`/api/deliberations/${delibId}/start-voting`, {
                    method: 'POST',
                  })

                  if (!startRes.ok) {
                    const err = await startRes.json()
                    throw new Error(err.error || 'Failed to start voting')
                  }

                  // Step 4: If ACCUMULATING, simulate voting through all tiers to get a champion
                  if (targetPhase === 'ACCUMULATING') {
                    setCreateStatus('Simulating votes through tiers...')
                    for (let safety = 0; safety < 20; safety++) {
                      const simRes = await fetch('/api/admin/test/simulate-voting', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ deliberationId: delibId, leaveFinalVote: false }),
                      })

                      if (!simRes.ok) {
                        const err = await simRes.json()
                        throw new Error(err.error || 'Failed to simulate voting')
                      }

                      const simData = await simRes.json()
                      if (simData.isComplete) break
                    }
                  }

                  setCreateStatus('Done! Redirecting...')
                  router.push(`/admin/deliberation/${delibId}`)

                } catch (err) {
                  setCreateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
                  setCreating(false)
                }
              }}
              disabled={creating || targetPhase === 'SUBMISSION'}
              className={`px-6 py-2 rounded transition-colors text-sm font-medium ${
                targetPhase === 'SUBMISSION'
                  ? 'bg-muted/50 text-muted cursor-not-allowed'
                  : 'bg-warning hover:bg-warning-hover text-black disabled:bg-muted'
              }`}
            >
              {creating ? 'Simulating...' : 'Create & Simulate'}
            </button>
            <button
              onClick={async () => {
                if (!confirm('Delete all deliberations with [TEST] in the name?')) return
                try {
                  const res = await fetch('/api/admin/test/cleanup', { method: 'POST' })
                  if (res.ok) {
                    const data = await res.json()
                    alert(`Cleaned up ${data.deleted} test deliberations`)
                    fetchDeliberations()
                  }
                } catch {
                  alert('Cleanup failed')
                }
              }}
              className="bg-error hover:bg-error-hover text-white px-4 py-2 rounded transition-colors text-sm"
            >
              Cleanup [TEST]
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/cron/tick')
                  const data = await res.json()
                  alert(`Timer check: ${data.processed} transitions processed`)
                  fetchDeliberations()
                } catch {
                  alert('Timer check failed')
                }
              }}
              className="bg-surface hover:bg-header hover:text-white text-muted border border-border px-4 py-2 rounded transition-colors text-sm"
            >
              Check Timers
            </button>
            <button
              onClick={async () => {
                setCreating(true)
                setCreateStatus('Creating deliberation with completed cell...')
                try {
                  const res = await fetch('/api/admin/test/create-completed-cell', { method: 'POST' })
                  const data = await res.json()
                  if (res.ok) {
                    setCreateStatus('Done! Redirecting...')
                    router.push(`/admin/deliberation/${data.deliberationId}`)
                  } else {
                    setCreateStatus(`Error: ${data.error}`)
                  }
                } catch {
                  setCreateStatus('Error: Failed to create')
                } finally {
                  setCreating(false)
                }
              }}
              disabled={creating}
              className="bg-success hover:bg-success-hover disabled:bg-muted text-white px-4 py-2 rounded transition-colors text-sm"
            >
              Completed Cell Test
            </button>
            <button
              onClick={async () => {
                setCreating(true)
                setCreateStatus('Creating deliberation in discussion mode...')
                try {
                  const question = testQuestion.trim() || `Discussion Test ${Date.now()}`

                  // Step 1: Create deliberation with manual discussion mode
                  const createRes = await fetch('/api/deliberations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      question,
                      description: 'Test deliberation with cells in DELIBERATING mode (manual advance)',
                      isPublic: true,
                      tags: ['test'],
                      discussionDurationMs: -1, // Manual discussion - no auto-advance
                      votingTimeoutMs: votingMinutes * 60 * 1000,
                    }),
                  })

                  if (!createRes.ok) {
                    const err = await createRes.json()
                    throw new Error(err.error || 'Failed to create')
                  }

                  const deliberation = await createRes.json()
                  const delibId = deliberation.id

                  // Step 2: Populate with test users and ideas
                  setCreateStatus('Populating 20 test users and ideas...')
                  const populateRes = await fetch('/api/admin/test/populate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      deliberationId: delibId,
                      userCount: 20,
                      ideasPerUser: 1
                    }),
                  })

                  if (!populateRes.ok) {
                    const err = await populateRes.json()
                    throw new Error(err.error || 'Failed to populate')
                  }

                  // Step 3: Start voting (cells created as DELIBERATING due to discussionDurationMs)
                  setCreateStatus('Starting discussion phase (cells as DELIBERATING)...')
                  const startRes = await fetch(`/api/deliberations/${delibId}/start-voting`, {
                    method: 'POST',
                  })

                  if (!startRes.ok) {
                    const err = await startRes.json()
                    throw new Error(err.error || 'Failed to start voting')
                  }

                  setCreateStatus('Done! Redirecting...')
                  router.push(`/admin/deliberation/${delibId}`)

                } catch (err) {
                  setCreateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
                } finally {
                  setCreating(false)
                }
              }}
              disabled={creating}
              className="bg-blue hover:bg-blue/80 disabled:bg-muted text-white px-4 py-2 rounded transition-colors text-sm"
            >
              Discussion Test
            </button>
            <button
              onClick={async () => {
                setCreating(true)
                setCreateStatus('Creating private demo deliberation...')
                try {
                  const res = await fetch('/api/admin/test/create-private-demo', { method: 'POST' })
                  const data = await res.json()
                  if (res.ok) {
                    setCreateStatus(`Private demo created! Invite: ${window.location.origin}${data.inviteUrl}`)
                    router.push(`/admin/deliberation/${data.deliberationId}`)
                  } else {
                    setCreateStatus(`Error: ${data.error}`)
                  }
                } catch {
                  setCreateStatus('Error: Failed to create')
                } finally {
                  setCreating(false)
                }
              }}
              disabled={creating}
              className="bg-header hover:bg-header/80 disabled:bg-muted text-white px-4 py-2 rounded transition-colors text-sm"
            >
              Private Demo
            </button>
            <button
              onClick={async () => {
                if (!confirm('Delete ALL test bot users (TestBot, Test User, @test.bot, etc)?')) return
                setCreateStatus('Wiping test bots...')
                try {
                  const res = await fetch('/api/admin/test/wipe-bots', { method: 'POST' })
                  const data = await res.json()
                  if (res.ok) {
                    setCreateStatus(`Wiped ${data.usersDeleted} test users`)
                    fetchDeliberations()
                  } else {
                    setCreateStatus(`Error: ${data.error} - ${data.details || ''}`)
                  }
                } catch {
                  setCreateStatus('Error: Failed to wipe')
                }
              }}
              className="bg-orange hover:bg-orange-hover text-white px-4 py-2 rounded transition-colors text-sm"
            >
              Wipe Bots
            </button>
            <button
              onClick={async () => {
                if (!confirm('Delete duplicate deliberations (keeps oldest, deletes newer copies)?')) return
                setCreateStatus('Wiping duplicates...')
                try {
                  const res = await fetch('/api/admin/test/wipe-duplicates', { method: 'POST' })
                  const data = await res.json()
                  if (res.ok) {
                    setCreateStatus(`Wiped ${data.duplicatesDeleted} duplicate deliberations`)
                    fetchDeliberations()
                  } else {
                    setCreateStatus(`Error: ${data.error} - ${data.details || ''}`)
                  }
                } catch {
                  setCreateStatus('Error: Failed to wipe')
                }
              }}
              className="bg-purple hover:bg-purple-hover text-white px-4 py-2 rounded transition-colors text-sm"
            >
              Wipe Duplicates
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-background rounded-lg border border-border p-4">
            <div className="text-3xl font-bold text-foreground font-mono">{deliberations.length}</div>
            <div className="text-muted text-sm">{isAdmin ? 'All Deliberations' : 'Your Deliberations'}</div>
          </div>
          <div className="bg-background rounded-lg border border-border p-4">
            <div className="text-3xl font-bold text-accent font-mono">
              {deliberations.filter(d => d.phase === 'SUBMISSION').length}
            </div>
            <div className="text-muted text-sm">In Submission</div>
          </div>
          <div className="bg-background rounded-lg border border-border p-4">
            <div className="text-3xl font-bold text-warning font-mono">
              {deliberations.filter(d => d.phase === 'VOTING').length}
            </div>
            <div className="text-muted text-sm">In Voting</div>
          </div>
          <div className="bg-background rounded-lg border border-border p-4">
            <div className="text-3xl font-bold text-success font-mono">
              {deliberations.filter(d => d.phase === 'COMPLETED').length}
            </div>
            <div className="text-muted text-sm">Completed</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-background rounded-lg border border-border p-4 mb-6 flex gap-4 items-center flex-wrap">
          <input
            type="text"
            placeholder="Search deliberations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-surface border border-border text-foreground rounded-lg px-3 py-2 flex-1 min-w-[200px] focus:outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                filter === 'all' ? 'bg-header text-white' : 'bg-surface text-muted border border-border'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('public')}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                filter === 'public' ? 'bg-header text-white' : 'bg-surface text-muted border border-border'
              }`}
            >
              Public
            </button>
            <button
              onClick={() => setFilter('private')}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                filter === 'private' ? 'bg-header text-white' : 'bg-surface text-muted border border-border'
              }`}
            >
              Private
            </button>
          </div>
          <button
            onClick={fetchDeliberations}
            className="bg-surface hover:bg-surface-alt text-muted border border-border px-3 py-2 rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Deliberations Table */}
        <div className="bg-background rounded-lg border border-border overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-muted">Loading...</div>
          ) : filteredDeliberations.length === 0 ? (
            <div className="p-8 text-center text-muted">No deliberations found</div>
          ) : (
            <table className="w-full">
              <thead className="bg-surface border-b border-border">
                <tr>
                  <th className="text-left p-4 text-muted font-medium text-sm">Question</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Phase</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Type</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Members</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Ideas</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Creator</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Created</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeliberations.map((d) => (
                  <tr key={d.id} className="border-t border-border hover:bg-surface">
                    <td className="p-4">
                      <Link href={`/admin/deliberation/${d.id}`} className="text-foreground hover:text-accent font-medium">
                        {d.question.length > 50 ? d.question.slice(0, 50) + '...' : d.question}
                      </Link>
                      {d.organization && (
                        <div className="text-xs text-muted mt-0.5">{d.organization}</div>
                      )}
                      <div className="flex gap-1 mt-1">
                        {!d.isPublic && (
                          <span className="text-xs bg-surface text-muted px-1.5 py-0.5 rounded border border-border">
                            Private
                          </span>
                        )}
                        {d.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="text-xs bg-accent-light text-accent px-1.5 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${phaseStyles[d.phase] || 'bg-surface text-muted'}`}>
                        {d.phase}
                      </span>
                    </td>
                    <td className="p-4 text-muted text-sm">{getVotingType(d)}</td>
                    <td className="p-4 text-muted font-mono">{d._count.members}</td>
                    <td className="p-4 text-muted font-mono">{d._count.ideas}</td>
                    <td className="p-4 text-muted-light text-sm">
                      {getDisplayName(d.creator, d.creator.email.split('@')[0])}
                    </td>
                    <td className="p-4 text-muted-light text-sm font-mono">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-3 items-center">
                        <Link
                          href={`/admin/deliberation/${d.id}`}
                          className="text-accent hover:text-accent-hover text-sm font-medium"
                        >
                          Manage
                        </Link>
                        <Link
                          href={`/chants/${d.id}`}
                          className="text-muted hover:text-foreground text-sm"
                        >
                          View
                        </Link>
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/admin/deliberation/${d.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ isPublic: !d.isPublic }),
                              })
                              if (res.ok) fetchDeliberations()
                            } catch (err) {
                              console.error('Failed to toggle visibility:', err)
                            }
                          }}
                          className={`text-sm ${d.isPublic ? 'text-success' : 'text-error'} hover:opacity-70`}
                        >
                          {d.isPublic ? 'Public' : 'Private'}
                        </button>
                        <button
                          onClick={() => handleDelete(d.id, d.question)}
                          disabled={deleting === d.id}
                          className="text-error hover:text-error-hover text-sm disabled:opacity-50"
                        >
                          {deleting === d.id ? '...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Rate Limits Section */}
        <div className="bg-background rounded-xl p-6 border border-border">
          <h2 className="text-xl font-bold text-foreground mb-4">Rate Limits</h2>
          <p className="text-muted text-sm mb-4">Configure rate limiting for different endpoints. Changes take effect within 60 seconds.</p>

          {rateLimitsLoading ? (
            <div className="text-muted text-sm">Loading rate limits...</div>
          ) : rateLimits.length === 0 ? (
            <div className="text-muted text-sm">No rate limit configs found. They will be created with defaults on first use.</div>
          ) : (
            <div className="space-y-4">
              {rateLimits.map((rl) => (
                <div key={rl.endpoint} className="bg-surface border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-foreground font-semibold">{rl.endpoint}</span>
                      <span className="text-xs text-muted px-2 py-0.5 bg-background rounded">key: {rl.keyType}</span>
                    </div>
                    <button
                      onClick={async () => {
                        setRateLimitsSaving(rl.endpoint)
                        try {
                          const res = await fetch('/api/admin/rate-limits', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ endpoint: rl.endpoint, enabled: !rl.enabled }),
                          })
                          if (res.ok) {
                            setRateLimits(prev => prev.map(r =>
                              r.endpoint === rl.endpoint ? { ...r, enabled: !r.enabled } : r
                            ))
                          }
                        } catch {}
                        setRateLimitsSaving(null)
                      }}
                      disabled={rateLimitsSaving === rl.endpoint}
                      className={`text-sm font-medium px-3 py-1 rounded ${rl.enabled ? 'bg-success-bg text-success' : 'bg-error-bg text-error'}`}
                    >
                      {rl.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted mb-1 block">Max requests</label>
                      <input
                        type="number"
                        value={rl.maxRequests}
                        min={1}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 1
                          setRateLimits(prev => prev.map(r =>
                            r.endpoint === rl.endpoint ? { ...r, maxRequests: val } : r
                          ))
                        }}
                        className="w-full bg-background border border-border rounded px-3 py-1.5 text-foreground text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted mb-1 block">Window (seconds)</label>
                      <input
                        type="number"
                        value={Math.round(rl.windowMs / 1000)}
                        min={1}
                        onChange={e => {
                          const val = (parseInt(e.target.value) || 1) * 1000
                          setRateLimits(prev => prev.map(r =>
                            r.endpoint === rl.endpoint ? { ...r, windowMs: val } : r
                          ))
                        }}
                        className="w-full bg-background border border-border rounded px-3 py-1.5 text-foreground text-sm font-mono"
                      />
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setRateLimitsSaving(rl.endpoint)
                      try {
                        await fetch('/api/admin/rate-limits', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            endpoint: rl.endpoint,
                            maxRequests: rl.maxRequests,
                            windowMs: rl.windowMs,
                            enabled: rl.enabled,
                          }),
                        })
                      } catch {}
                      setRateLimitsSaving(null)
                    }}
                    disabled={rateLimitsSaving === rl.endpoint}
                    className="mt-3 bg-accent hover:bg-accent-hover text-white text-sm px-4 py-1.5 rounded transition-colors disabled:opacity-50"
                  >
                    {rateLimitsSaving === rl.endpoint ? 'Saving...' : 'Save'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        </>)}
      </div>
    </div>
  )
}
