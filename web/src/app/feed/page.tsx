'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { useGuideContext } from '@/app/providers'
import UserGuide from '@/components/UserGuide'
import type { FeedEntry, FeedResponse, PulseStats, ActivityItem } from '@/app/api/feed/route'

type Tab = 'your-turn' | 'activity' | 'results'

const POLL_INTERVALS: Record<Tab, number> = {
  'your-turn': 15_000,
  activity: 30_000,
  results: 60_000,
}

export default function FeedPage() {
  const { data: session, status } = useSession()
  const { showGuide, closeGuide } = useGuideContext()
  const [tab, setTab] = useState<Tab>('your-turn')
  const [loading, setLoading] = useState(true)

  // Per-tab cached data
  const [yourTurnData, setYourTurnData] = useState<{ items: FeedEntry[]; actionableCount: number }>({ items: [], actionableCount: 0 })
  const [activityData, setActivityData] = useState<{ pulse?: PulseStats; activity: ActivityItem[] }>({ activity: [] })
  const [resultsData, setResultsData] = useState<{ items: FeedEntry[] }>({ items: [] })

  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchFeed = useCallback(async (targetTab: Tab) => {
    try {
      const res = await fetch(`/api/feed?tab=${targetTab}`)
      if (res.ok) {
        const data: FeedResponse = await res.json()
        if (targetTab === 'your-turn') {
          setYourTurnData({ items: data.items, actionableCount: data.actionableCount ?? 0 })
        } else if (targetTab === 'activity') {
          setActivityData({ pulse: data.pulse, activity: data.activity ?? [] })
        } else {
          setResultsData({ items: data.items })
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + polling
  useEffect(() => {
    setLoading(true)
    fetchFeed(tab)

    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => fetchFeed(tab), POLL_INTERVALS[tab])

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [tab, fetchFeed])

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab)
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      {showGuide && <UserGuide onClose={closeGuide} />}

      {/* Tab Bar */}
      <div className="sticky top-0 z-30 bg-surface border-b border-border">
        <div className="max-w-xl mx-auto flex">
          <TabButton
            label="Feed"
            active={tab === 'your-turn'}
            badge={yourTurnData.actionableCount || undefined}
            onClick={() => handleTabChange('your-turn')}
          />
          <TabButton
            label="Activity"
            active={tab === 'activity'}
            onClick={() => handleTabChange('activity')}
          />
          <TabButton
            label="Results"
            active={tab === 'results'}
            onClick={() => handleTabChange('results')}
          />
        </div>
      </div>

      <main className="max-w-xl mx-auto px-4 py-4">
        {loading && (tab === 'your-turn' ? yourTurnData.items.length === 0 : tab === 'activity' ? !activityData.pulse : resultsData.items.length === 0) ? (
          <div className="text-center py-20 text-muted">Loading...</div>
        ) : tab === 'your-turn' ? (
          <YourTurnTab items={yourTurnData.items} actionableCount={yourTurnData.actionableCount} authenticated={!!session} />
        ) : tab === 'activity' ? (
          <ActivityTab pulse={activityData.pulse} activity={activityData.activity} />
        ) : (
          <ResultsTab items={resultsData.items} />
        )}
      </main>
    </div>
  )
}

// ── Tab Button ────────────────────────────────────────────────

function TabButton({ label, active, badge, onClick }: { label: string; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2.5 text-center text-xs font-medium transition-colors border-b-2 ${
        active
          ? 'text-foreground border-accent'
          : 'text-muted border-transparent hover:text-foreground'
      }`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1 bg-error text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

// ── Your Turn Tab ─────────────────────────────────────────────

function YourTurnTab({ items, actionableCount, authenticated }: { items: FeedEntry[]; actionableCount: number; authenticated: boolean }) {
  const actionable = items.filter((e) => e.priority >= 40)

  if (actionable.length === 0) return <EmptyFeed authenticated={authenticated} />

  return (
    <div className="flex flex-col gap-3">
      {actionable.map((entry) => (
        <FeedCard key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

// ── Activity Tab ──────────────────────────────────────────────

function ActivityTab({ pulse, activity }: { pulse?: PulseStats; activity: ActivityItem[] }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Platform Pulse */}
      {pulse && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-light font-semibold mb-3">Platform Pulse</div>
          <div className="grid grid-cols-2 gap-3">
            <PulseStat value={pulse.activeVoters} label="Active Voters" color="text-accent" />
            <PulseStat value={pulse.inProgress} label="In Progress" color="text-warning" />
            <PulseStat value={pulse.ideasToday} label="Ideas Today" color="text-success" />
            <PulseStat value={pulse.votesToday} label="Votes Today" color="text-purple" />
          </div>
        </div>
      )}

      {/* Activity Timeline */}
      {activity.length > 0 ? (
        activity.map((item) => (
          <ActivityTimelineItem key={item.id} item={item} />
        ))
      ) : (
        <div className="text-center py-12 text-muted text-sm">No recent activity</div>
      )}
    </div>
  )
}

function PulseStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[9px] text-muted-light">{label}</div>
    </div>
  )
}

const ACTIVITY_ICONS: Record<string, string> = {
  COMMENT_REPLY: '\u{1F4AC}',
  COMMENT_UPVOTE: '\u{1F44D}',
  COMMENT_UP_POLLINATE: '\u{1F338}',
  IDEA_ADVANCING: '\u2B06\uFE0F',
  IDEA_WON: '\u{1F3C6}',
  VOTE_NEEDED: '\u{1F5F3}\uFE0F',
  DELIBERATION_UPDATE: '\u{1F4E2}',
  FOLLOW: '\u{1F464}',
  COMMUNITY_INVITE: '\u{1F4E8}',
  COMMUNITY_NEW_DELIB: '\u{1F195}',
  FOLLOWED_NEW_DELIB: '\u{1F4DD}',
  FOLLOWED_VOTED: '\u{1F5F3}\uFE0F',
  CONTENT_REMOVED: '\u{26A0}\uFE0F',
}

function ActivityTimelineItem({ item }: { item: ActivityItem }) {
  const icon = ACTIVITY_ICONS[item.type] || '\u{1F514}'
  const inner = (
    <div className="bg-surface border border-border rounded-xl p-3">
      <div className="flex gap-3 items-start">
        <div className="text-base flex-shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-foreground leading-relaxed">{item.title}</div>
          {item.body && <div className="text-[10px] text-muted mt-0.5">{item.body}</div>}
          <div className="text-[10px] text-muted-light mt-1">{timeAgo(item.createdAt)}</div>
        </div>
      </div>
    </div>
  )
  return item.deliberationId ? (
    <Link href={`/talks/${item.deliberationId}`} className="block">{inner}</Link>
  ) : (
    inner
  )
}

// ── Results Tab ───────────────────────────────────────────────

function ResultsTab({ items }: { items: FeedEntry[] }) {
  if (items.length === 0) {
    return <div className="text-center py-16 text-muted text-sm">No completed deliberations yet</div>
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((entry) => (
        <ResultCard key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

function ResultCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  return (
    <Card accentColor="var(--color-success)" href={`/talks/${d.id}`}>
      <Badge color="var(--color-success)" bg="var(--color-success-bg)">{'\u{1F451}'} Priority Declared</Badge>
      <Question text={d.question} />
      {entry.champion && (
        <div className="mt-2 bg-success-bg border border-success/20 rounded-lg p-2.5">
          <div className="text-xs text-foreground">&ldquo;{entry.champion.text}&rdquo;</div>
          {entry.winnerVoteCount !== undefined && (
            <div className="text-[10px] text-success mt-1">{entry.winnerVoteCount} votes in final round</div>
          )}
        </div>
      )}
      {entry.myIdea && (
        <div className={`text-[10px] mt-1.5 font-medium ${entry.myIdea.status === 'WINNER' ? 'text-success' : 'text-muted'}`}>
          {entry.myIdea.status === 'WINNER' ? 'Your pick won!' : `Your pick: ${entry.myIdea.status.toLowerCase()}`}
        </div>
      )}
      <Meta>
        <span>{d.participantCount} participants</span>
        <span>&middot;</span>
        <span>{d.ideaCount} ideas</span>
        {entry.tierCount && (
          <>
            <span>&middot;</span>
            <span>{entry.tierCount} tiers</span>
          </>
        )}
        {entry.completedAt && (
          <>
            <span>&middot;</span>
            <span>{timeAgo(entry.completedAt)}</span>
          </>
        )}
      </Meta>
    </Card>
  )
}

// ── Empty state ────────────────────────────────────────────────

function EmptyFeed({ authenticated }: { authenticated: boolean }) {
  return (
    <div className="text-center py-16 px-4">
      <p className="text-muted mb-4">
        {authenticated
          ? 'No talks to vote on right now.'
          : 'Sign in to see your personalized feed.'}
      </p>
      <div className="flex gap-3 justify-center">
        {authenticated ? (
          <>
            <Link href="/talks/new" className="text-accent hover:text-accent-hover font-medium text-sm">
              Create a Talk
            </Link>
            <Link href="/groups" className="text-accent hover:text-accent-hover font-medium text-sm">
              Browse Groups
            </Link>
          </>
        ) : (
          <Link href="/auth/signin" className="bg-accent text-white px-4 py-2 rounded-lg font-medium text-sm">
            Sign In
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Card router ────────────────────────────────────────────────

function FeedCard({ entry }: { entry: FeedEntry }) {
  switch (entry.kind) {
    case 'podiums_summary':
      return <PodiumsSummaryCard entry={entry} />
    case 'vote_now':
      return <VoteNowCard entry={entry} />
    case 'deliberate':
      return <DeliberateCard entry={entry} />
    case 'submit':
      return <SubmitCard entry={entry} />
    case 'join':
      return <JoinCard entry={entry} />
    case 'champion':
      return <ChampionCardInline entry={entry} />
    case 'challenge':
      return <ChallengeCard entry={entry} />
    case 'extra_vote':
      return <ExtraVoteCard entry={entry} />
    case 'completed':
      return <CompletedCard entry={entry} />
    case 'waiting':
      return <WaitingCard entry={entry} />
    case 'advanced':
      return <AdvancedCard entry={entry} />
    case 'podium':
      return <PodiumCard entry={entry} />
    default:
      return null
  }
}

// ── Shared card wrapper ────────────────────────────────────────

function Card({
  accentColor,
  children,
  href,
  pinned,
  className: extraClass,
}: {
  accentColor?: string
  children: React.ReactNode
  href?: string
  pinned?: boolean
  className?: string
}) {
  const inner = (
    <div
      className={`bg-surface border border-border rounded-xl p-4 transition-colors hover:bg-surface-hover ${
        pinned ? 'ring-2 ring-accent/20' : ''
      } ${extraClass || ''}`}
      style={accentColor ? { borderLeft: `4px solid ${accentColor}` } : undefined}
    >
      {children}
    </div>
  )
  return href ? <Link href={href} className="block">{inner}</Link> : inner
}

function Badge({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ color, backgroundColor: bg }}>
      {children}
    </span>
  )
}

function Question({ text }: { text: string }) {
  return <div className="text-base font-serif font-semibold text-foreground mt-2 leading-snug">&ldquo;{text}&rdquo;</div>
}

function Meta({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-muted mt-2 flex flex-wrap gap-1.5">{children}</div>
}

// ── PodiumsSummaryCard ─────────────────────────────────────────

function PodiumsSummaryCard({ entry }: { entry: FeedEntry }) {
  const podiums = entry.podiums || []
  if (podiums.length === 0) return null

  return (
    <Card accentColor="var(--color-muted)" pinned>
      <Link href="/podiums">
        <Badge color="var(--color-muted)" bg="var(--color-muted-light/.1)">{'\u270E'} Podiums</Badge>
      </Link>
      <div className="mt-3 flex flex-col gap-1.5">
        {podiums.map((p) => (
            <Link
              key={p.id}
              href={`/podium/${p.id}`}
              className="flex items-center gap-2"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate text-foreground">
                  {p.title}
                </div>
                <div className="text-[10px] text-muted-light">
                  {p.authorName}
                  {p.isAI && <span className="text-purple text-[8px] ml-1">AI</span>}
                  {' \u00B7 '}{timeAgo(p.createdAt)}
                </div>
              </div>
            </Link>
          ))}
      </div>
    </Card>
  )
}

// ── WaitingCard ────────────────────────────────────────────────

function WaitingCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  const cell = entry.cell
  return (
    <div className="opacity-70">
      <Card accentColor="var(--color-border)" href={`/talks/${d.id}`}>
        <div className="flex justify-between items-center">
          <Badge color="var(--color-muted)" bg="rgba(113,113,122,0.1)">{'\u23F3'} Waiting &middot; Tier {d.tier}</Badge>
          {d.votingDeadline && <span className="text-[11px] font-mono text-muted-light">{timeLeft(d.votingDeadline)}</span>}
        </div>
        <Question text={d.question} />
        <Meta>
          <span>You voted {'\u2713'}</span>
          <span>&middot;</span>
          <span>{cell?.votedCount}/{cell?.memberCount} voted</span>
          {cell && cell.memberCount - cell.votedCount > 0 && (
            <>
              <span>&middot;</span>
              <span>Waiting for {cell.memberCount - cell.votedCount} more</span>
            </>
          )}
        </Meta>
        {/* Member avatars */}
        {cell?.members && (
          <div className="flex gap-1 mt-2">
            {cell.members.map((m, i) => (
              <div
                key={i}
                className="w-[18px] h-[18px] rounded-full text-[7px] font-semibold flex items-center justify-center"
                style={
                  m.voted
                    ? { background: 'var(--color-success)', color: '#fff' }
                    : { background: 'var(--color-border)', color: 'var(--color-muted-light)' }
                }
                title={m.name}
              >
                {m.voted ? '\u2713' : (m.name?.[0] || '?').toUpperCase()}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ── AdvancedCard ───────────────────────────────────────────────

function AdvancedCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  const myIdea = entry.myIdea
  return (
    <Card accentColor="var(--color-success)" href={`/talks/${d.id}`}>
      <Badge color="var(--color-success)" bg="var(--color-success-bg)">{'\u{1F389}'} Your Pick Advanced</Badge>
      <Question text={d.question} />
      {myIdea && (
        <div className="mt-2 bg-success-bg border border-success/20 rounded-lg p-2.5">
          <div className="text-xs text-foreground">&ldquo;{myIdea.text}&rdquo;</div>
          <div className="text-[10px] text-success mt-1">
            Tier {(entry.cell?.tier ?? d.tier) > 1 ? (entry.cell?.tier ?? d.tier) - 1 : 1} &rarr; Tier {entry.cell?.tier ?? d.tier}
            {entry.cell && ` \u00B7 Won with ${entry.cell.votedCount}/${entry.cell.memberCount} votes`}
          </div>
        </div>
      )}
      <Meta><span>{timeAgo(new Date().toISOString())}</span></Meta>
    </Card>
  )
}

// ── Podium card (fallback for individual podium entries) ──────

function PodiumCard({ entry }: { entry: FeedEntry }) {
  const p = entry.podium!
  return (
    <Card href={`/podium/${p.id}`} pinned={entry.pinned}>
      {entry.pinned && (
        <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-2">Pinned</div>
      )}
      <div className="flex items-center gap-2 mb-2">
        {p.authorImage ? (
          <img src={p.authorImage} alt="" className="w-6 h-6 rounded-full" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-accent-light text-accent text-xs font-semibold flex items-center justify-center">
            {(p.authorName || 'A')[0].toUpperCase()}
          </div>
        )}
        <span className="text-sm font-medium text-foreground">{p.authorName}</span>
        {p.isAI && (
          <span className="text-[10px] font-medium text-purple bg-purple-bg px-1.5 py-0.5 rounded">AI</span>
        )}
        <span className="text-xs text-muted ml-auto">{timeAgo(p.createdAt)}</span>
      </div>
      <div className="text-base font-bold text-foreground leading-snug">{p.title}</div>
      <div className="text-sm text-muted mt-1 line-clamp-2">{p.preview}</div>
      {p.deliberationQuestion && (
        <div className="mt-3 text-xs bg-accent-light text-accent px-2 py-1 rounded inline-block">
          Linked: &ldquo;{p.deliberationQuestion}&rdquo;
        </div>
      )}
    </Card>
  )
}

// ── Vote Now ───────────────────────────────────────────────────

function VoteNowCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  const cell = entry.cell
  return (
    <Card accentColor="var(--color-warning)" href={`/talks/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-warning)" bg="var(--color-warning-bg)">Vote Now &middot; Tier {d.tier}</Badge>
        <span className="text-[11px] font-mono font-semibold text-warning">{d.votingDeadline ? timeLeft(d.votingDeadline) : 'Open'}</span>
      </div>
      <Question text={d.question} />
      {cell && cell.ideas.length > 0 && (
        <div className="mt-2 flex flex-col gap-[3px]">
          {cell.ideas.slice(0, 2).map((idea) => (
            <div key={idea.id} className="text-[11px] text-muted px-2 py-[5px] bg-background rounded-md truncate">
              {idea.text}
            </div>
          ))}
          {cell.ideas.length > 2 && (
            <div className="text-[10px] text-muted-light text-center py-0.5">+ {cell.ideas.length - 2} more ideas</div>
          )}
        </div>
      )}
      <Meta>
        <span>{d.participantCount} participants</span>
        <span>&middot;</span>
        {cell && <span>Your cell: {cell.votedCount}/{cell.memberCount} voted</span>}
      </Meta>
      <div className="mt-2 text-sm font-medium text-warning">Pick your favorite &rarr;</div>
    </Card>
  )
}

// ── Deliberate ─────────────────────────────────────────────────

function DeliberateCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  const cell = entry.cell
  return (
    <Card accentColor="var(--color-blue)" href={`/talks/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-blue)" bg="var(--color-blue-bg)">{'\u{1F4AC}'} Deliberate &middot; Tier {d.tier}</Badge>
      </div>
      <Question text={d.question} />
      {cell && cell.ideas.length > 0 && (
        <div className="mt-3 bg-blue-bg border border-blue/15 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-blue font-semibold mb-1">Your cell&rsquo;s ideas</div>
          {cell.ideas.map((idea, i) => (
            <div key={idea.id} className="text-[11px] text-subtle leading-relaxed">
              {i + 1}. {idea.text}
            </div>
          ))}
        </div>
      )}
      {cell?.latestComment && (
        <div className="mt-2 bg-background border border-border rounded-lg p-2.5">
          <div className="text-[10px] text-muted mb-0.5">Latest comment:</div>
          <div className="text-[11px] text-foreground italic leading-relaxed">&ldquo;{cell.latestComment.text}&rdquo;</div>
          <div className="text-[10px] text-muted mt-0.5">&mdash; {cell.latestComment.authorName}</div>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-medium text-blue">Read ideas &amp; discuss &rarr;</span>
        <span className="text-[11px] font-mono text-muted">{cell?.discussionDeadline ? `Voting opens in ${timeLeft(cell.discussionDeadline)}` : 'Facilitator opens voting'}</span>
      </div>
    </Card>
  )
}

// ── Submit Ideas ───────────────────────────────────────────────

function SubmitCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  return (
    <Card accentColor="var(--color-accent)" href={`/talks/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-accent)" bg="var(--color-accent-light)">{'\u{1F4A1}'} Submit Ideas</Badge>
        <span className="text-[11px] text-muted-light">{d.submissionDeadline ? `${timeLeft(d.submissionDeadline)} left` : 'Open'}</span>
      </div>
      <Question text={d.question} />
      <Meta>
        <span>{d.participantCount} participants</span>
        <span>&middot;</span>
        <span>{d.ideaCount} ideas so far</span>
      </Meta>
      <div className="mt-2 text-sm font-medium text-accent">Add your idea &rarr;</div>
    </Card>
  )
}

// ── Join ───────────────────────────────────────────────────────

function JoinCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  return (
    <Card accentColor="var(--color-accent)" href={`/talks/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-accent)" bg="var(--color-accent-light)">
          Join &middot; {d.phase === 'SUBMISSION' ? 'Open' : `Tier ${d.tier}`}
        </Badge>
        {d.submissionDeadline && <span className="text-[11px] text-muted-light">{timeLeft(d.submissionDeadline)} left</span>}
      </div>
      <Question text={d.question} />
      {d.communityName && <div className="text-xs text-muted mt-1">{d.communityName}</div>}
      <Meta>
        <span>{d.participantCount} participants</span>
        <span>&middot;</span>
        <span>{d.ideaCount} ideas</span>
      </Meta>
      {/* Full-width join button */}
      <div className="mt-3">
        <div className="w-full bg-accent text-white text-center py-2 rounded-lg text-xs font-semibold">
          Join This Deliberation
        </div>
      </div>
    </Card>
  )
}

// ── Champion / Accumulating ────────────────────────────────────

function ChampionCardInline({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  return (
    <Card accentColor="var(--color-purple)" href={`/talks/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-purple)" bg="var(--color-purple-bg)">{'\u2605'} Accepting New Ideas</Badge>
        <span className="text-[11px] font-mono font-semibold text-purple">Open</span>
      </div>
      <Question text={d.question} />
      {entry.champion && (
        <div className="mt-3 bg-success-bg border border-success/20 rounded-lg p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-success font-semibold mb-0.5">Current Priority</div>
          <div className="text-sm text-foreground">&ldquo;{entry.champion.text}&rdquo;</div>
        </div>
      )}
      <Meta>
        <span>{d.participantCount} participants</span>
      </Meta>
      <div className="mt-2 text-sm font-medium text-purple">Submit a challenger idea &rarr;</div>
    </Card>
  )
}

// ── Challenge / Round 2 ────────────────────────────────────────

function ChallengeCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  return (
    <Card accentColor="var(--color-orange)" href={`/talks/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-orange)" bg="var(--color-orange-bg)">Challenge Vote &middot; Round {d.challengeRound + 1} &middot; Tier {d.tier}</Badge>
        <span className="text-[11px] font-mono font-semibold text-orange">{d.votingDeadline ? `${timeLeft(d.votingDeadline)} left` : 'Open'}</span>
      </div>
      <Question text={d.question} />
      <Meta>
        <span>{d.participantCount} participants</span>
      </Meta>
      {entry.champion && (
        <div className="mt-3 bg-orange-bg border border-orange/20 rounded-lg p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-orange font-semibold mb-0.5">Defending Priority</div>
          <div className="text-sm text-foreground">&ldquo;{entry.champion.text}&rdquo;</div>
        </div>
      )}
      <div className="mt-2 text-sm font-medium text-orange">Vote &rarr;</div>
    </Card>
  )
}

// ── Extra Vote ────────────────────────────────────────────────

function ExtraVoteCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  return (
    <Card accentColor="var(--color-accent)" href={`/talks/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-accent)" bg="var(--color-accent-light)">Extra Vote &middot; Tier {d.tier}</Badge>
        {entry.secondVoteDeadline && (
          <span className="text-[11px] font-mono font-semibold text-accent">{timeLeft(entry.secondVoteDeadline)} left</span>
        )}
      </div>
      <Question text={d.question} />
      <div className="mt-2 bg-accent-light border border-accent/20 rounded-lg p-2.5">
        <div className="text-xs text-muted">You already voted. The facilitator opened a window for you to vote in a second cell with different ideas.</div>
      </div>
      <div className="mt-2 text-sm font-medium text-accent">Cast extra vote &rarr;</div>
    </Card>
  )
}

// ── Completed ──────────────────────────────────────────────────

function CompletedCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  return (
    <Card href={`/talks/${d.id}`}>
      <Badge color="var(--color-success)" bg="var(--color-success-bg)">Priority Declared</Badge>
      <Question text={d.question} />
      {entry.champion && (
        <div className="mt-3 bg-success-bg border border-success/20 rounded-lg p-2.5">
          <div className="text-sm text-foreground">&ldquo;{entry.champion.text}&rdquo;</div>
        </div>
      )}
      <Meta>
        <span>{d.participantCount} participants</span>
        <span>&middot;</span>
        <span>{d.ideaCount} ideas</span>
      </Meta>
    </Card>
  )
}

// ── Utils ──────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function timeLeft(deadlineStr: string): string {
  const diff = new Date(deadlineStr).getTime() - Date.now()
  if (diff <= 0) return 'ending'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
