'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'
import AgreementLeaderboard from '@/components/AgreementLeaderboard'

interface UserProfile {
  id: string
  name: string
  image: string | null
  bio: string | null
  joinedAt: string
  totalXP: number
  followersCount: number
  followingCount: number
  isFollowing: boolean
  stats: {
    ideas: number
    votes: number
    comments: number
    deliberationsCreated: number
    deliberationsJoined: number
    deliberationsVotedIn: number
    totalPredictions: number
    correctPredictions: number
    accuracy: number | null
    championPicks: number
    currentStreak: number
    bestStreak: number
    ideasWon: number
    winRate: number | null
    highestTierReached: number
    ideasAdvanced: number
    tierBreakdown: Array<{ tier: number; count: number }>
    highestUpPollinateTier: number
    totalUpvotesReceived: number
    totalCommentUpvotes: number
  }
  recentActivity: Array<{
    deliberationId: string
    question: string
    phase: string
    lastActive: string
  }>
  recentIdeas: Array<{
    id: string
    text: string
    status: string
    deliberationId: string
    question: string
    createdAt: string
  }>
}

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: string }) {
  return (
    <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-muted text-xs mb-0.5">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-lg font-bold text-foreground font-mono">{value}</div>
    </div>
  )
}

function timeAgo(date: string): string {
  const now = new Date()
  const then = new Date(date)
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`
  return then.toLocaleDateString()
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
      return
    }

    async function fetchProfile() {
      try {
        const meRes = await fetch('/api/user/me')
        if (!meRes.ok) {
          const errData = await meRes.json().catch(() => ({}))
          throw new Error(errData.error || `Failed to load profile (${meRes.status})`)
        }
        const meData = await meRes.json()
        const userId = meData.user?.id
        if (!userId) {
          throw new Error('Could not determine user ID')
        }

        const response = await fetch(`/api/user/${userId}`)
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          throw new Error(errData.error || `Failed to load profile (${response.status})`)
        }
        const data = await response.json()
        setProfile(data.user)
      } catch (err) {
        console.error('Profile fetch error:', err)
        setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    }

    if (status === 'authenticated') {
      fetchProfile()
    }
  }, [status, router])

  if (status === 'loading' || loading) {
    return (
      <FrameLayout active="chants" showBack>
        <div className="flex items-center justify-center py-16">
          <div className="text-xs text-muted animate-pulse">Loading profile...</div>
        </div>
      </FrameLayout>
    )
  }

  if (error || !profile) {
    return (
      <FrameLayout active="chants" showBack>
        <div className="text-center py-12">
          <p className="text-xs text-error mb-3">{error || 'Could not load profile'}</p>
        </div>
      </FrameLayout>
    )
  }

  return (
    <FrameLayout active="chants" showBack>
      {/* Profile Header */}
      <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-4 mb-4">
        <div className="flex items-start gap-3">
          {profile.image ? (
            <img
              src={profile.image}
              alt=""
              className="w-14 h-14 rounded-full"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center">
              <span className="text-xl text-accent font-semibold">
                {profile.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">{profile.name}</h1>
              <div className="flex items-center gap-1.5 shrink-0">
                <Link
                  href="/profile/manage"
                  className="text-xs text-muted hover:text-foreground border border-border rounded-lg px-2 py-1 transition-colors"
                >
                  Manage
                </Link>
                <Link
                  href="/billing"
                  className="text-xs text-muted hover:text-foreground border border-border rounded-lg px-2 py-1 transition-colors"
                >
                  Billing
                </Link>
                <Link
                  href="/settings"
                  className="text-xs text-muted hover:text-foreground border border-border rounded-lg px-2 py-1 transition-colors"
                >
                  Settings
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="text-xs text-error hover:text-error-hover border border-error/30 rounded-lg px-2 py-1 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>

            {profile.bio && (
              <p className="text-xs text-muted mt-1">{profile.bio}</p>
            )}

            <div className="flex items-center gap-3 mt-1 text-xs">
              <span className="text-foreground"><strong>{profile.followersCount}</strong> <span className="text-muted">followers</span></span>
              <span className="text-foreground"><strong>{profile.followingCount}</strong> <span className="text-muted">following</span></span>
            </div>

            <p className="text-xs text-subtle mt-0.5">
              Joined {formatDate(profile.joinedAt)}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <h2 className="text-xs font-semibold text-foreground mb-2">Activity</h2>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <StatCard label="Vote Points" value={profile.totalXP || 0} icon="VP" />
        <StatCard label="Ideas" value={profile.stats.ideas} icon="💡" />
        <StatCard label="Comments" value={profile.stats.comments} icon="💬" />
        <StatCard label="Created" value={profile.stats.deliberationsCreated} icon="📝" />
        <StatCard label="Joined" value={profile.stats.deliberationsJoined} icon="👥" />
        <StatCard
          label="Accuracy"
          value={profile.stats.accuracy !== null ? `${profile.stats.accuracy}%` : '-'}
          icon="🎯"
        />
      </div>

      {/* Win Record */}
      {profile.stats.ideasWon > 0 && (
        <>
          <h2 className="text-xs font-semibold text-foreground mb-2">Win Record</h2>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <StatCard label="Ideas Won" value={profile.stats.ideasWon} icon="🏆" />
            <StatCard label="Win Rate" value={profile.stats.winRate !== null ? `${profile.stats.winRate}%` : '-'} icon="📊" />
            <StatCard label="Highest Tier" value={profile.stats.highestTierReached || '-'} icon="⬆️" />
            <StatCard label="Advanced" value={profile.stats.ideasAdvanced} icon="🚀" />
          </div>
          {profile.stats.tierBreakdown.length > 0 && (
            <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3 mb-4">
              <div className="text-xs text-muted mb-1.5">Tier breakdown</div>
              <div className="flex gap-1.5 flex-wrap">
                {profile.stats.tierBreakdown.map(t => (
                  <span key={t.tier} className="bg-surface border border-border rounded px-1.5 py-0.5 text-xs font-mono">
                    T{t.tier}: {t.count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Comment & Up-Pollinate Stats */}
      {profile.stats.comments > 0 && (
        <>
          <h2 className="text-xs font-semibold text-foreground mb-2">Comments</h2>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <StatCard label="Comments" value={profile.stats.comments} icon="💬" />
            <StatCard label="Upvotes" value={profile.stats.totalUpvotesReceived} icon="👍" />
            <StatCard label="Up-Pollinate" value={`Tier ${profile.stats.highestUpPollinateTier}`} icon="🌸" />
          </div>
        </>
      )}

      {/* Prediction Stats */}
      {profile.stats.totalPredictions > 0 && (
        <>
          <h2 className="text-xs font-semibold text-foreground mb-2">Predictions</h2>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <StatCard label="Total" value={profile.stats.totalPredictions} icon="🔮" />
            <StatCard label="Correct" value={profile.stats.correctPredictions} icon="✅" />
            <StatCard label="Priorities" value={profile.stats.championPicks} icon="👑" />
            <StatCard label="Best Streak" value={profile.stats.bestStreak} icon="🔥" />
          </div>
        </>
      )}

      {/* Agreement Leaderboard */}
      <div className="mb-4">
        <AgreementLeaderboard />
      </div>

      {/* Recent Ideas */}
      {profile.recentIdeas.length > 0 && (
        <>
          <h2 className="text-xs font-semibold text-foreground mb-2">Recent Ideas</h2>
          <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg divide-y divide-border mb-4">
            {profile.recentIdeas.map((idea) => (
              <Link
                key={idea.id}
                href={`/chants/${idea.deliberationId}`}
                className="block p-3 hover:bg-surface transition-colors"
              >
                <p className="text-xs text-foreground">{idea.text}</p>
                <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      idea.status === 'WINNER'
                        ? 'bg-success-bg text-success'
                        : idea.status === 'ADVANCING'
                        ? 'bg-accent-light text-accent'
                        : idea.status === 'IN_VOTING'
                        ? 'bg-warning-bg text-warning'
                        : idea.status === 'ELIMINATED'
                        ? 'bg-error-bg text-error'
                        : 'bg-surface text-muted'
                    }`}
                  >
                    {idea.status}
                  </span>
                  <span className="text-muted truncate">{idea.question}</span>
                  <span className="text-subtle">{timeAgo(idea.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Recent Activity */}
      {profile.recentActivity.length > 0 && (
        <>
          <h2 className="text-xs font-semibold text-foreground mb-2">Recent Activity</h2>
          <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg divide-y divide-border">
            {profile.recentActivity.map((activity) => (
              <Link
                key={activity.deliberationId}
                href={`/chants/${activity.deliberationId}`}
                className="block p-3 hover:bg-surface transition-colors"
              >
                <p className="text-xs text-foreground">{activity.question}</p>
                <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      activity.phase === 'VOTING'
                        ? 'bg-warning-bg text-warning'
                        : activity.phase === 'ACCUMULATING'
                        ? 'bg-purple-bg text-purple'
                        : activity.phase === 'COMPLETED'
                        ? 'bg-success-bg text-success'
                        : 'bg-surface text-muted'
                    }`}
                  >
                    {activity.phase}
                  </span>
                  <span className="text-subtle">Active {timeAgo(activity.lastActive)}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Empty State */}
      {profile.recentIdeas.length === 0 && profile.recentActivity.length === 0 && (
        <div className="text-center py-6 text-muted">
          <p className="text-xs">No activity yet</p>
          <Link href="/chants" className="text-xs text-accent hover:underline mt-1.5 inline-block">
            Join a chant to get started
          </Link>
        </div>
      )}
    </FrameLayout>
  )
}
