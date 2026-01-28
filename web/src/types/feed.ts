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
  }
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
  votingTrigger?: {
    type: 'timer' | 'idea_goal' | 'manual'
    ideaGoal?: number | null
    currentIdeas: number
    currentParticipants: number
  }
}
