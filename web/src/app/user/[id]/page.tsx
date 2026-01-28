'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Header from '@/components/Header'

interface UserProfile {
  id: string
  name: string
  image: string | null
  bio: string | null
  joinedAt: string
  stats: {
    ideas: number
    votes: number
    comments: number
    deliberationsCreated: number
    deliberationsJoined: number
    totalPredictions: number
    correctPredictions: number
    accuracy: number | null
    championPicks: number
    currentStreak: number
    bestStreak: number
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
    <div className="bg-surface rounded-lg p-4 border border-border">
      <div className="flex items-center gap-2 text-muted text-sm mb-1">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold text-foreground font-mono">{value}</div>
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

export default function UserProfilePage() {
  const params = useParams()
  const { data: session } = useSession()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const userId = params.id as string
  const isOwnProfile = session?.user?.id === userId

  useEffect(() => {
    async function fetchProfile() {
      try {
        const response = await fetch(`/api/user/${userId}`)
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('User not found')
          }
          throw new Error('Failed to load profile')
        }
        const data = await response.json()
        setProfile(data.user)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    }

    if (userId) {
      fetchProfile()
    }
  }, [userId])

  if (loading) {
    return (
      <div className="min-h-screen bg-surface">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="text-muted">Loading profile...</div>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-surface">
        <Header />
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <p className="text-error mb-4">{error || 'User not found'}</p>
            <Link href="/deliberations" className="text-accent hover:underline">
              Back to deliberations
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Profile Header */}
        <div className="bg-background rounded-xl p-6 border border-border mb-6">
          <div className="flex items-start gap-4">
            {profile.image ? (
              <img
                src={profile.image}
                alt=""
                className="w-20 h-20 rounded-full"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center">
                <span className="text-3xl text-accent font-semibold">
                  {profile.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}

            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">{profile.name}</h1>
                {isOwnProfile && (
                  <Link
                    href="/settings"
                    className="text-muted hover:text-foreground text-sm"
                  >
                    Edit
                  </Link>
                )}
              </div>

              {profile.bio && (
                <p className="text-muted mt-2">{profile.bio}</p>
              )}

              <p className="text-sm text-subtle mt-2">
                Joined {formatDate(profile.joinedAt)}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <h2 className="text-lg font-semibold text-foreground mb-3">Activity</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <StatCard label="Ideas" value={profile.stats.ideas} icon="💡" />
          <StatCard label="Votes" value={profile.stats.votes} icon="✓" />
          <StatCard label="Comments" value={profile.stats.comments} icon="💬" />
          <StatCard label="Created" value={profile.stats.deliberationsCreated} icon="📝" />
          <StatCard label="Joined" value={profile.stats.deliberationsJoined} icon="👥" />
          <StatCard
            label="Accuracy"
            value={profile.stats.accuracy !== null ? `${profile.stats.accuracy}%` : '-'}
            icon="🎯"
          />
        </div>

        {/* Prediction Stats */}
        {profile.stats.totalPredictions > 0 && (
          <>
            <h2 className="text-lg font-semibold text-foreground mb-3">Predictions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <StatCard
                label="Total"
                value={profile.stats.totalPredictions}
                icon="🔮"
              />
              <StatCard
                label="Correct"
                value={profile.stats.correctPredictions}
                icon="✅"
              />
              <StatCard
                label="Champions"
                value={profile.stats.championPicks}
                icon="👑"
              />
              <StatCard
                label="Best Streak"
                value={profile.stats.bestStreak}
                icon="🔥"
              />
            </div>
          </>
        )}

        {/* Recent Ideas */}
        {profile.recentIdeas.length > 0 && (
          <>
            <h2 className="text-lg font-semibold text-foreground mb-3">Recent Ideas</h2>
            <div className="bg-background rounded-xl border border-border divide-y divide-border mb-6">
              {profile.recentIdeas.map((idea) => (
                <Link
                  key={idea.id}
                  href={`/deliberations/${idea.deliberationId}`}
                  className="block p-4 hover:bg-surface transition-colors"
                >
                  <p className="text-foreground">{idea.text}</p>
                  <div className="flex items-center gap-2 mt-2 text-sm">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
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
            <h2 className="text-lg font-semibold text-foreground mb-3">Recent Activity</h2>
            <div className="bg-background rounded-xl border border-border divide-y divide-border">
              {profile.recentActivity.map((activity) => (
                <Link
                  key={activity.deliberationId}
                  href={`/deliberations/${activity.deliberationId}`}
                  className="block p-4 hover:bg-surface transition-colors"
                >
                  <p className="text-foreground">{activity.question}</p>
                  <div className="flex items-center gap-2 mt-2 text-sm">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
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
          <div className="text-center py-8 text-muted">
            <p>No activity yet</p>
            {isOwnProfile && (
              <Link href="/deliberations" className="text-accent hover:underline mt-2 inline-block">
                Join a deliberation to get started
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
