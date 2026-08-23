'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import FollowButton from '@/components/FollowButton'

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
    cellsAssigned: number
    cellsVotedIn: number
    participationRate: number | null
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

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(date).toLocaleDateString()
}

const STATUS_PILL: Record<string, string> = {
  WINNER: 'border-[#4ade80]/40 text-[#4ade80] bg-[#4ade80]/10',
  ADVANCING: 'border-accent/40 text-accent bg-accent/10',
  IN_VOTING: 'border-[#fbbf24]/40 text-[#fbbf24] bg-[#fbbf24]/10',
  ELIMINATED: 'border-border text-subtle bg-surface/50',
  VOTING: 'border-[#fbbf24]/40 text-[#fbbf24] bg-[#fbbf24]/10',
  ACCUMULATING: 'border-[#a78bfa]/40 text-[#a78bfa] bg-[#a78bfa]/10',
  COMPLETED: 'border-[#4ade80]/40 text-[#4ade80] bg-[#4ade80]/10',
}

function Pill({ label }: { label: string }) {
  const cls = STATUS_PILL[label] || 'border-border text-muted bg-surface/50'
  return (
    <span className={`shrink-0 px-1.5 py-0.5 rounded-full border text-[10px] font-mono uppercase tracking-wider ${cls}`}>
      {label.replace('_', ' ')}
    </span>
  )
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-start min-w-0">
      <span className={`text-lg font-bold font-mono leading-tight ${accent ? 'text-accent' : 'text-foreground'}`}>{value}</span>
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted truncate">{label}</span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-mono uppercase tracking-wider text-muted px-1">{children}</h2>
  )
}

export default function UserProfilePage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [podiums, setPodiums] = useState<Array<{
    id: string; title: string; views: number; pinned: boolean; createdAt: string
    deliberation: { id: string; question: string } | null
  }>>([])

  const userId = params.id as string
  const isOwnProfile = session?.user?.id === userId

  useEffect(() => {
    if (!userId) return
    fetch(`/api/user/${userId}`)
      .then(res => {
        if (!res.ok) throw new Error(res.status === 404 ? 'User not found' : 'Failed to load profile')
        return res.json()
      })
      .then(data => setProfile(data.user))
      .catch(err => setError(err instanceof Error ? err.message : 'Something went wrong'))
      .finally(() => setLoading(false))
    fetch(`/api/podiums?authorId=${userId}&limit=10`)
      .then(res => res.ok ? res.json() : { items: [] })
      .then(data => setPodiums(data.items || []))
      .catch(() => {})
  }, [userId])

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar — modern chrome */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-2xl mx-auto px-3 h-12 flex items-center gap-3">
          <button
            onClick={() => (window.history.length > 1 ? router.back() : router.push('/chants'))}
            className="shrink-0 w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
            title="Back"
          >
            <span className="text-sm leading-none">&larr;</span>
          </button>
          <span className="text-xs font-mono uppercase tracking-wider text-muted truncate">
            {profile ? profile.name : 'Profile'}
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-3 py-4 space-y-5">
        {loading ? (
          <div className="py-16 text-center text-muted text-sm font-mono animate-pulse">Loading...</div>
        ) : error || !profile ? (
          <div className="py-16 text-center">
            <p className="text-error text-xs mb-4 font-mono">{error || 'User not found'}</p>
            <Link href="/chants" className="text-accent hover:underline text-xs font-mono">Back to feed</Link>
          </div>
        ) : (
          <>
            {/* Identity */}
            <div className="flex items-start gap-4">
              {profile.image ? (
                <img src={profile.image} alt="" className="w-16 h-16 rounded-full border-2 border-accent/40" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-accent/15 border-2 border-accent/40 flex items-center justify-center">
                  <span className="text-2xl text-accent font-bold">{profile.name.charAt(0).toUpperCase()}</span>
                </div>
              )}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center justify-between gap-2">
                  <h1 className="text-base font-bold text-foreground truncate">{profile.name}</h1>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isOwnProfile && (
                      <FollowButton userId={userId} initialFollowing={profile.isFollowing} />
                    )}
                    {isOwnProfile && (
                      <>
                        <Link href="/profile/manage" className="px-2.5 py-1 rounded-full border border-border text-xs font-mono text-muted hover:text-foreground hover:border-foreground/30 transition-colors">Manage</Link>
                        <Link href="/settings" className="px-2.5 py-1 rounded-full border border-border text-xs font-mono text-muted hover:text-foreground hover:border-foreground/30 transition-colors">Settings</Link>
                        <button onClick={() => signOut({ callbackUrl: '/' })} className="px-2.5 py-1 rounded-full border border-error/30 text-xs font-mono text-error hover:bg-error/10 transition-colors">Sign out</button>
                      </>
                    )}
                  </div>
                </div>
                {profile.bio && <p className="text-xs text-muted mt-1 leading-relaxed">{profile.bio}</p>}
                <div className="flex items-center gap-3 mt-1.5 text-xs font-mono">
                  <span><strong className="text-foreground">{profile.followersCount}</strong> <span className="text-muted">followers</span></span>
                  <span><strong className="text-foreground">{profile.followingCount}</strong> <span className="text-muted">following</span></span>
                  <span className="text-subtle">joined {new Date(profile.joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                </div>
              </div>
            </div>

            {/* Signal strip */}
            <div className="bg-surface/50 backdrop-blur-sm border border-border rounded-xl px-4 py-3 grid grid-cols-4 gap-3">
              <Stat label="Vote pts" value={profile.totalXP || 0} accent />
              <Stat label="Ideas" value={profile.stats.ideas} />
              <Stat label="Wins" value={profile.stats.ideasWon} />
              <Stat label="Top tier" value={profile.stats.highestTierReached || '-'} />
            </div>

            {/* Participation */}
            <div className="space-y-2">
              <SectionLabel>Participation</SectionLabel>
              <div className="bg-surface/50 backdrop-blur-sm border border-border rounded-xl px-4 py-3 grid grid-cols-4 gap-3">
                <Stat label="Created" value={profile.stats.deliberationsCreated} />
                <Stat label="Joined" value={profile.stats.deliberationsJoined} />
                <Stat label="Comments" value={profile.stats.comments} />
                <Stat label="Attend" value={profile.stats.participationRate !== null ? `${profile.stats.participationRate}%` : '-'} />
              </div>
            </div>

            {/* Win record */}
            {profile.stats.ideasWon > 0 && (
              <div className="space-y-2">
                <SectionLabel>Win record</SectionLabel>
                <div className="bg-surface/50 backdrop-blur-sm border border-border rounded-xl px-4 py-3">
                  <div className="grid grid-cols-3 gap-3">
                    <Stat label="Win rate" value={profile.stats.winRate !== null ? `${profile.stats.winRate}%` : '-'} accent />
                    <Stat label="Advanced" value={profile.stats.ideasAdvanced} />
                    <Stat label="Upvotes" value={profile.stats.totalUpvotesReceived} />
                  </div>
                  {profile.stats.tierBreakdown.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mt-3 pt-3 border-t border-border/50">
                      {profile.stats.tierBreakdown.map(t => (
                        <span key={t.tier} className="px-2 py-0.5 rounded-full border border-accent/30 bg-accent/5 text-[10px] font-mono text-accent">
                          T{t.tier} &times;{t.count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Podiums */}
            {podiums.length > 0 && (
              <div className="space-y-2">
                <SectionLabel>Podium posts</SectionLabel>
                <div className="bg-surface/50 backdrop-blur-sm border border-border rounded-xl divide-y divide-border/50 overflow-hidden">
                  {podiums.map(p => (
                    <Link key={p.id} href={`/podium/${p.id}`} className="block px-4 py-3 hover:bg-surface transition-colors">
                      <div className="flex items-center gap-2">
                        {p.pinned && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded-full border border-[#fbbf24]/40 text-[#fbbf24] bg-[#fbbf24]/10 text-[10px] font-mono uppercase tracking-wider">Pinned</span>
                        )}
                        <p className="text-foreground text-xs font-medium truncate">{p.title}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-muted">
                        <span>{p.views} views</span>
                        {p.deliberation && <span className="truncate">re: {p.deliberation.question}</span>}
                        <span className="shrink-0 text-subtle">{timeAgo(p.createdAt)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Recent ideas */}
            {profile.recentIdeas.length > 0 && (
              <div className="space-y-2">
                <SectionLabel>Recent ideas</SectionLabel>
                <div className="bg-surface/50 backdrop-blur-sm border border-border rounded-xl divide-y divide-border/50 overflow-hidden">
                  {profile.recentIdeas.map(idea => (
                    <Link key={idea.id} href={`/chants/${idea.deliberationId}`} className="block px-4 py-3 hover:bg-surface transition-colors">
                      <p className="text-foreground text-xs leading-relaxed">{idea.text}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                        <Pill label={idea.status} />
                        <span className="text-muted font-mono truncate">{idea.question}</span>
                        <span className="text-subtle font-mono shrink-0">{timeAgo(idea.createdAt)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Recent activity */}
            {profile.recentActivity.length > 0 && (
              <div className="space-y-2">
                <SectionLabel>Recent activity</SectionLabel>
                <div className="bg-surface/50 backdrop-blur-sm border border-border rounded-xl divide-y divide-border/50 overflow-hidden">
                  {profile.recentActivity.map(activity => (
                    <Link key={activity.deliberationId} href={`/chants/${activity.deliberationId}`} className="block px-4 py-3 hover:bg-surface transition-colors">
                      <p className="text-foreground text-xs leading-relaxed">{activity.question}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                        <Pill label={activity.phase} />
                        <span className="text-subtle font-mono">active {timeAgo(activity.lastActive)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {profile.recentIdeas.length === 0 && profile.recentActivity.length === 0 && (
              <div className="text-center py-10">
                <p className="text-xs text-muted font-mono">No activity yet</p>
                {isOwnProfile && (
                  <Link href="/chants" className="inline-block mt-2 px-3 py-1.5 rounded-full border border-accent/40 bg-accent/10 text-accent text-xs font-mono uppercase tracking-wider hover:bg-accent/20 transition-colors">
                    Join a chant
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
