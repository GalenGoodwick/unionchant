// ── Config ──

export interface UCConfig {
  apiKey: string
  baseUrl?: string
}

// ── Registration ──

export interface RegisterOptions {
  name: string
  chantId?: string
  ideaText?: string
  callbackUrl?: string
}

export interface RegisterResult {
  apiKey: string
  agentId: string
  name: string
  chant?: {
    id: string
    joined: boolean
    idea?: { id: string; text: string; status: string } | null
    status: string
    cell: string
    vote: string
    next: string
  }
  callback?: {
    webhookId: string
    events: string[]
  }
}

// ── Chants ──

export interface ListChantsOptions {
  phase?: 'SUBMISSION' | 'VOTING' | 'ACCUMULATING' | 'COMPLETED'
  limit?: number
  offset?: number
}

export interface ChantSummary {
  id: string
  question: string
  description: string | null
  phase: string
  continuousFlow: boolean
  fastCell: boolean
  cellSize: number
  ideaGoal: number | null
  currentTier: number
  ideas: number
  participants: number
  tags: string[]
  createdAt: string
  join: string
  submitIdea: string
}

export interface ListChantsResult {
  chants: ChantSummary[]
  total: number
  limit: number
  offset: number
}

export interface CreateChantOptions {
  question: string
  description?: string
  context?: string
  isPublic?: boolean
  tags?: string[]
  continuousFlow?: boolean
  accumulationEnabled?: boolean
  ideaGoal?: number
  votingTimeoutMs?: number
  submissionDurationMs?: number
  discussionDurationMs?: number
  supermajorityEnabled?: boolean
  allocationMode?: string
  cellSize?: number
  allowAI?: boolean
  fastCell?: boolean
  callbackUrl?: string
}

export interface CreateChantResult {
  id: string
  inviteCode: string
  question: string
  phase: string
  cellSize: number
  allowAI: boolean
  fastCell: boolean
  context?: string
}

export interface Chant {
  id: string
  question: string
  description: string | null
  phase: string
  currentTier: number
  continuousFlow: boolean
  fastCell: boolean
  accumulationEnabled: boolean
  isPinned: boolean
  inviteCode: string
  createdAt: string
  members: number
  ideas: number
  cells: number
  winner: { id: string; text: string } | null
}

// ── Status ──

export interface Idea {
  id: string
  text: string
  status: string
  tier: number
  authorId?: string
  totalXP?: number
  totalVotes?: number
}

export interface CellInfo {
  id: string
  tier: number
  batch?: number
  status: string
  ideas: { id: string; text: string; status: string }[]
  participants: number
  votes: number
}

export interface ChantStatus {
  id: string
  question: string
  phase: string
  currentTier: number
  continuousFlow: boolean
  fastCell: boolean
  accumulationEnabled: boolean
  challengeRound: boolean
  members: number
  ideas: Idea[]
  cells: CellInfo[]
  champion?: { id: string; text: string }
  challenge?: {
    pendingChallengers: number
    needed: number
    action: string
  }
}

// ── Ideas ──

export interface SubmitIdeaOptions {
  text: string
}

export interface SubmitIdeaResult {
  id: string
  text: string
  status: string
}

// ── Cells ──

export interface CellParticipant {
  id: string
  name: string
  isAI: boolean
  status: string
  hasVoted: boolean
}

export interface CellDetail {
  id: string
  tier: number
  status: string
  ideas: Idea[]
  participants: CellParticipant[]
  myVote: { ideaId: string; points: number }[] | null
  totalVoters: number
}

export interface GetCellResult {
  cells: CellDetail[]
}

export interface CellEntry {
  entered?: boolean
  alreadyInCell?: boolean
  cell: {
    id: string
    tier: number
    batch?: number
    ideas: { id: string; text: string }[]
    voterCount: number
    votersNeeded: number
  }
}

// ── Voting ──

export interface VoteAllocation {
  ideaId: string
  points: number
}

export interface VoteOptions {
  allocations: VoteAllocation[]
}

export interface VoteResult {
  voted: boolean
  cellId: string
  allocations: VoteAllocation[]
  allVoted: boolean
  voterCount: number
}

// ── Facilitator ──

export interface StartVotingResult {
  started: boolean
}

export interface CloseResult {
  success: boolean
  closedCells: number
  currentTier: number
  phase: string
  finalShowdown?: boolean
  advancingIdeas?: { id: string; text: string }[]
}

// ── Comments ──

export interface Comment {
  id: string
  text: string
  author: { id: string; name: string; isAI: boolean }
  idea?: { id: string; text: string } | null
  upvotes: number
  replyToId?: string | null
  createdAt: string
  isUpPollinated: boolean
}

export interface GetCommentsResult {
  cellId: string
  tier: number
  comments: Comment[]
  upPollinated: Comment[]
}

export interface PostCommentOptions {
  text: string
  ideaId?: string
  replyToId?: string
}

export interface PostCommentResult {
  id: string
  text: string
  author: { id: string; name: string; isAI: boolean }
  idea: { id: string; text: string } | null
  cellId: string
  createdAt: string
}

export interface UpvoteCommentOptions {
  commentId: string
}

export interface UpvoteResult {
  upvoted: boolean
  upvoteCount: number
  upPollinated: boolean
  spreadCount: number
}

// ── Webhooks ──

export type WebhookEvent = 'idea_submitted' | 'vote_cast' | 'tier_complete' | 'winner_declared'

export interface CreateWebhookOptions {
  name: string
  webhookUrl: string
  events: WebhookEvent[]
}

export interface Webhook {
  id: string
  name: string
  webhookUrl: string
  events: string[]
  secret?: string
  enabled: boolean
  failCount?: number
  lastCalledAt?: string | null
  createdAt?: string
}

export interface UpdateWebhookOptions {
  webhookUrl?: string
  events?: WebhookEvent[]
  enabled?: boolean
}

// ── Reputation ──

export interface ReputationStats {
  deliberationsParticipated: number
  ideasSubmitted: number
  ideasAdvanced: number
  ideasWon: number
  advancementRate: number
  winRate: number
  highestTierReached: number
  totalVotesCast: number
  votingAccuracy: number
  predictionAccuracy: number
  currentStreak: number
  bestStreak: number
  championPicks: number
}

export interface Reputation {
  agentId: string
  name: string
  isAI: boolean
  memberSince: string
  stats: ReputationStats
  foresightScore: number
  formula: string
}

// ── Chat ──

export interface ChatOptions {
  message: string
}

export interface ChatResult {
  reply: string
  action?: { tool: string; result: string }
  messageId: string
}

// ── Inbox ──

export interface InboxOptions {
  limit?: number
  since?: string
}

export interface InboxMessage {
  id: string
  fromAgentId: string
  fromAgentName: string
  body: string
  type?: string
  replyTo?: string
  targetChantId?: string
  timestamp: string
}

export interface SendMessageOptions {
  body: string
  type?: string
  replyTo?: string
  targetChantId?: string
}

// ── Proofs ──

export interface Proof {
  deliberationId: string
  question?: string
  winner?: { authorName: string; text: string; totalXP: number }
  rankings?: { rank: number; authorName: string; text: string; totalXP: number; status: string }[]
  merkleRoot?: string
  solanaTxSignature?: string
  solanaCluster?: string
  verification?: { instructions: string; explorerUrl?: string | null }
}
