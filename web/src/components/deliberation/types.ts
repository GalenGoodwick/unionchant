export type UserStatus = 'ACTIVE' | 'BANNED' | 'DELETED'

export type Idea = {
  id: string
  text: string
  status: string
  tier: number
  totalVotes: number
  losses: number
  isNew: boolean
  author: { id: string; name: string | null; status?: UserStatus }
}

export type CellIdea = {
  ideaId: string
  idea: Idea
}

export type Participant = {
  userId: string
  status: string
  user: { id: string; name: string | null; image: string | null; status?: UserStatus }
}

export type Vote = {
  id: string
  ideaId: string
  isSecondVote: boolean
}

export type Comment = {
  id: string
  text: string
  createdAt: string
  user: { id: string; name: string | null; image: string | null; status?: UserStatus }
}

export type CommentWithUpvote = Comment & {
  upvoteCount?: number
  userHasUpvoted?: boolean
  reachTier?: number
  isUpPollinated?: boolean
  sourceTier?: number
  linkedIdea?: { id: string; text: string } | null
}

export type Cell = {
  id: string
  tier: number
  status: string
  votingDeadline: string | null
  finalizesAt: string | null
  ideas: CellIdea[]
  participants: Participant[]
  votes: Vote[]
}

export type Deliberation = {
  id: string
  question: string
  description: string | null
  organization: string | null
  phase: string
  currentTier: number
  isPublic: boolean
  creatorId: string
  createdAt: string
  submissionEndsAt: string | null
  accumulationEndsAt: string | null
  challengeRound: number
  accumulationEnabled: boolean
  championId: string | null
  ideaGoal: number | null
  creator: { id: string; name: string | null; status?: UserStatus }
  ideas: Idea[]
  _count: { members: number }
  isMember?: boolean
  isCreator?: boolean
  inviteCode?: string
  userSubmittedIdea?: { id: string; text: string } | null
  userSubmittedChallenger?: { id: string; text: string } | null
  followedUserIds?: string[]
}

export type Prediction = {
  id: string
  tierPredictedAt: number
  predictedIdeaId: string
  predictedIdea: { id: string; text: string }
  wonImmediate: boolean | null
  ideaBecameChampion: boolean | null
  enteredForVoting: boolean
  resolvedAt: string | null
  createdAt: string
}

export type TierInfo = {
  tier: number
  isBatch: boolean
  isComplete: boolean
  stats: {
    totalCells: number
    completedCells: number
    totalParticipants: number
    totalVotesCast: number
    totalVotesExpected: number
    votingProgress: number
  }
  ideas: { id: string; text: string; status: string; author: { name: string | null } }[]
  batchGroups?: { batch: number; ideas: { id: string; text: string; status: string; author: { name: string | null } }[] }[]
  liveTally?: { ideaId: string; text: string; voteCount: number }[]
  cells: {
    id: string
    batch: number
    status: string
    participantCount: number
    votedCount: number
    votingDeadline?: string | null
    ideas?: { id: string; text: string; status: string; voteCount?: number; author: { name: string | null } }[]
    winner?: { id: string; text: string; author: string }
  }[]
}

export type HistoryIdea = {
  id: string
  text: string
  author: string
  votes: number
  isWinner: boolean
  status: string
}

export type HistoryCell = {
  id: string
  tier: number
  completedAt: string
  ideas: HistoryIdea[]
  totalVotes: number
}

export type VotingHistory = {
  challengeRound: number
  currentChampion: { id: string; text: string; author: { name: string } } | null
  tiers: Record<number, HistoryCell[]>
  totalCells: number
}

export type DelibComment = {
  id: string
  text: string
  createdAt: string
  upvoteCount: number
  reachTier: number
  isUpPollinated?: boolean
  sourceTier?: number
  userHasUpvoted: boolean
  user: { id: string; name: string | null; image: string | null }
}

export type CommentsTier = {
  tier: number
  cells: {
    cellId: string
    status: string
    comments: DelibComment[]
  }[]
}

export type CommentsData = {
  tiers: CommentsTier[]
  upPollinated: DelibComment[]
  totalComments: number
  currentTier: number
}
