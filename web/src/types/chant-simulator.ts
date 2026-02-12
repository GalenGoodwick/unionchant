/**
 * Originally developed as part of the Common Ground plugin for Unity Chant.
 * Thank you to Common Ground (https://common.ground) for being open source
 * and inspiring the embeddable widget architecture.
 *
 * Adapted for the Unity Chant web application.
 * Original source: https://github.com/GalenGoodwick/unity-chant-cg-plugin
 */

export interface ChantStatus {
  id: string
  question: string
  description?: string | null
  phase: 'SUBMISSION' | 'VOTING' | 'COMPLETED' | 'ACCUMULATING'
  allocationMode: string
  continuousFlow: boolean
  multipleIdeasAllowed: boolean
  submissionsClosed: boolean
  currentTier: number
  memberCount: number
  ideaCount: number
  creator: { id: string; name: string }
  champion: IdeaInfo | null
  ideas: IdeaInfo[]
  cells: CellInfo[]
  fcfsProgress: {
    currentCellIndex: number
    totalCells: number
    currentCellVoters: number
    votersNeeded: number
    completedCells: number
    currentCellIdeas?: { id: string; text: string; author: { id: string; name: string } }[]
  } | null
  hasVoted: boolean
  votedTiers: number[]
  isMember: boolean
  createdAt: string
  inviteCode?: string | null
  accumulationEnabled?: boolean
  ideaGoal?: number | null
  memberGoal?: number | null
}

export interface IdeaInfo {
  id: string
  text: string
  status: string
  tier: number
  totalXP: number
  totalVotes: number
  isChampion: boolean
  author: { id: string; name: string }
}

export interface CellIdea {
  id: string
  text: string
  totalXP: number
  status: string
  author: { name: string }
}

export interface CellInfo {
  id: string
  tier: number
  status: string
  createdAt: string
  _count: { participants: number; votes: number }
  ideas?: CellIdea[]
}

export interface CommentInfo {
  id: string
  text: string
  ideaId: string | null
  createdAt: string
  upvoteCount: number
  userHasUpvoted: boolean
  spreadCount?: number
  user: { id: string; name: string; image: string | null }
}

export interface VoteResult {
  success: boolean
  cellId: string
  cellCompleted: boolean
  voterCount: number
  votersNeeded: number
  progress: {
    completedCells: number
    totalCells: number
    tierComplete: boolean
  }
}
