// === Feed Tabs ===
export type FeedTab = 'for-you' | 'activity' | 'following' | 'done' | 'results'

// === Activity Feed Types ===
export type ActivityItemType =
  | 'voting_active'
  | 'challenge_started'
  | 'new_deliberation'
  | 'tier_completed'
  | 'platform_stats'

export type ActivityItem = {
  type: ActivityItemType
  id: string
  timestamp: string
  deliberation?: {
    id: string
    question: string
    currentTier: number
    challengeRound: number
    phase: string
    community?: { name: string; slug: string } | null
  }
  // voting_active
  voterCount?: number
  tier?: number
  // challenge_started
  challengeRound?: number
  // tier_completed
  completedTier?: number
  advancingCount?: number
  // platform_stats
  stats?: {
    activeVoters: number
    inProgressDelibs: number
    ideasToday: number
    votesToday: number
  }
}

// === Results Feed Types ===
export type ResultItemType =
  | 'champion_crowned'
  | 'idea_advanced'
  | 'deliberation_completed'
  | 'prediction_correct'

export type ResultItem = {
  type: ResultItemType
  id: string
  timestamp: string
  deliberation: {
    id: string
    question: string
    phase: string
    currentTier: number
    community?: { name: string; slug: string } | null
  }
  // champion_crowned
  champion?: { id: string; text: string; author: string; totalVotes: number }
  // idea_advanced
  idea?: { id: string; text: string; tier: number }
  isPersonal?: boolean
  // deliberation_completed
  totalParticipants?: number
  totalIdeas?: number
  totalTiers?: number
  // prediction_correct
  prediction?: { tier: number; ideaText: string }
}

// === Following Feed Types ===
export type FollowingItemType =
  | 'idea_submitted'
  | 'idea_won'
  | 'deliberation_created'
  | 'joined_deliberation'

export type FollowingItem = {
  type: FollowingItemType
  id: string
  timestamp: string
  user: {
    id: string
    name: string
    image: string | null
  }
  deliberation: {
    id: string
    question: string
    phase: string
    community?: { name: string; slug: string } | null
  }
  idea?: { id: string; text: string }
}

// === Existing For You Types (unchanged) ===
export type FeedItemType =
  | 'vote_now'
  | 'join_voting'
  | 'predict'
  | 'submit_ideas'
  | 'challenge'
  | 'champion'

export type FeedItem = {
  type: FeedItemType
  priority: number
  deliberation: {
    id: string
    question: string
    description: string | null
    organization: string | null
    phase: string
    currentTier: number
    challengeRound: number
    createdAt: string
    views: number
    _count: { members: number; ideas: number }
    creator?: { id: string; name: string }
  }
  community?: { name: string; slug: string } | null
  // Type-specific data
  cell?: {
    id: string
    tier: number
    status: string
    votingDeadline: string | null
    spotsRemaining: number
    ideas: { id: string; text: string; author: string }[]
    participantCount: number
    votedCount: number
    userHasVoted?: boolean
    userVotedIdeaId?: string | null
    // Urgency indicators
    urgency?: 'critical' | 'warning' | 'normal'
    timeRemainingMs?: number
    votesNeeded?: number
  }
  tierInfo?: {
    tier: number
    totalCells: number
    votingProgress: number
    ideas: { id: string; text: string }[]
    spotsRemaining: number
    cells?: { id: string; ideas?: { id: string; text: string }[] }[]
  }
  champion?: {
    id: string
    text: string
    author: string
    totalVotes: number
  }
  submissionDeadline?: string | null
  challengersCount?: number
  userPredictions?: Record<number, string> // tier -> predictedIdeaId
  userSubmittedIdea?: { id: string; text: string } | null // User's submitted idea if any
  resolvedAt?: string | null // When user acted (voted/submitted)
  votingTrigger?: {
    type: 'timer' | 'idea_goal' | 'manual'
    ideaGoal?: number | null
    currentIdeas: number
    currentParticipants: number
  }
}
