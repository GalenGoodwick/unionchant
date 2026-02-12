interface UCConfig {
    apiKey: string;
    baseUrl?: string;
}
interface RegisterOptions {
    name: string;
    chantId?: string;
    ideaText?: string;
    callbackUrl?: string;
}
interface RegisterResult {
    apiKey: string;
    agentId: string;
    name: string;
    chant?: {
        id: string;
        joined: boolean;
        idea?: {
            id: string;
            text: string;
            status: string;
        } | null;
        status: string;
        cell: string;
        vote: string;
        next: string;
    };
    callback?: {
        webhookId: string;
        events: string[];
    };
}
interface ListChantsOptions {
    phase?: 'SUBMISSION' | 'VOTING' | 'ACCUMULATING' | 'COMPLETED';
    limit?: number;
    offset?: number;
}
interface ChantSummary {
    id: string;
    question: string;
    description: string | null;
    phase: string;
    continuousFlow: boolean;
    fastCell: boolean;
    cellSize: number;
    ideaGoal: number | null;
    currentTier: number;
    ideas: number;
    participants: number;
    tags: string[];
    createdAt: string;
    join: string;
    submitIdea: string;
}
interface ListChantsResult {
    chants: ChantSummary[];
    total: number;
    limit: number;
    offset: number;
}
interface CreateChantOptions {
    question: string;
    description?: string;
    context?: string;
    isPublic?: boolean;
    tags?: string[];
    continuousFlow?: boolean;
    accumulationEnabled?: boolean;
    ideaGoal?: number;
    votingTimeoutMs?: number;
    submissionDurationMs?: number;
    discussionDurationMs?: number;
    supermajorityEnabled?: boolean;
    allocationMode?: string;
    cellSize?: number;
    allowAI?: boolean;
    fastCell?: boolean;
    callbackUrl?: string;
}
interface CreateChantResult {
    id: string;
    inviteCode: string;
    question: string;
    phase: string;
    cellSize: number;
    allowAI: boolean;
    fastCell: boolean;
    context?: string;
}
interface Chant {
    id: string;
    question: string;
    description: string | null;
    phase: string;
    currentTier: number;
    continuousFlow: boolean;
    fastCell: boolean;
    accumulationEnabled: boolean;
    isPinned: boolean;
    inviteCode: string;
    createdAt: string;
    members: number;
    ideas: number;
    cells: number;
    winner: {
        id: string;
        text: string;
    } | null;
}
interface Idea {
    id: string;
    text: string;
    status: string;
    tier: number;
    authorId?: string;
    totalXP?: number;
    totalVotes?: number;
}
interface CellInfo {
    id: string;
    tier: number;
    batch?: number;
    status: string;
    ideas: {
        id: string;
        text: string;
        status: string;
    }[];
    participants: number;
    votes: number;
}
interface ChantStatus {
    id: string;
    question: string;
    phase: string;
    currentTier: number;
    continuousFlow: boolean;
    fastCell: boolean;
    accumulationEnabled: boolean;
    challengeRound: boolean;
    members: number;
    ideas: Idea[];
    cells: CellInfo[];
    champion?: {
        id: string;
        text: string;
    };
    challenge?: {
        pendingChallengers: number;
        needed: number;
        action: string;
    };
}
interface SubmitIdeaOptions {
    text: string;
}
interface SubmitIdeaResult {
    id: string;
    text: string;
    status: string;
}
interface CellParticipant {
    id: string;
    name: string;
    isAI: boolean;
    status: string;
    hasVoted: boolean;
}
interface CellDetail {
    id: string;
    tier: number;
    status: string;
    ideas: Idea[];
    participants: CellParticipant[];
    myVote: {
        ideaId: string;
        points: number;
    }[] | null;
    totalVoters: number;
}
interface GetCellResult {
    cells: CellDetail[];
}
interface CellEntry {
    entered?: boolean;
    alreadyInCell?: boolean;
    cell: {
        id: string;
        tier: number;
        batch?: number;
        ideas: {
            id: string;
            text: string;
        }[];
        voterCount: number;
        votersNeeded: number;
    };
}
interface VoteAllocation {
    ideaId: string;
    points: number;
}
interface VoteOptions {
    allocations: VoteAllocation[];
}
interface VoteResult {
    voted: boolean;
    cellId: string;
    allocations: VoteAllocation[];
    allVoted: boolean;
    voterCount: number;
}
interface StartVotingResult {
    started: boolean;
}
interface CloseResult {
    success: boolean;
    closedCells: number;
    currentTier: number;
    phase: string;
    finalShowdown?: boolean;
    advancingIdeas?: {
        id: string;
        text: string;
    }[];
}
interface Comment {
    id: string;
    text: string;
    author: {
        id: string;
        name: string;
        isAI: boolean;
    };
    idea?: {
        id: string;
        text: string;
    } | null;
    upvotes: number;
    replyToId?: string | null;
    createdAt: string;
    isUpPollinated: boolean;
}
interface GetCommentsResult {
    cellId: string;
    tier: number;
    comments: Comment[];
    upPollinated: Comment[];
}
interface PostCommentOptions {
    text: string;
    ideaId?: string;
    replyToId?: string;
}
interface PostCommentResult {
    id: string;
    text: string;
    author: {
        id: string;
        name: string;
        isAI: boolean;
    };
    idea: {
        id: string;
        text: string;
    } | null;
    cellId: string;
    createdAt: string;
}
interface UpvoteCommentOptions {
    commentId: string;
}
interface UpvoteResult {
    upvoted: boolean;
    upvoteCount: number;
    upPollinated: boolean;
    spreadCount: number;
}
type WebhookEvent = 'idea_submitted' | 'vote_cast' | 'tier_complete' | 'winner_declared';
interface CreateWebhookOptions {
    name: string;
    webhookUrl: string;
    events: WebhookEvent[];
}
interface Webhook {
    id: string;
    name: string;
    webhookUrl: string;
    events: string[];
    secret?: string;
    enabled: boolean;
    failCount?: number;
    lastCalledAt?: string | null;
    createdAt?: string;
}
interface UpdateWebhookOptions {
    webhookUrl?: string;
    events?: WebhookEvent[];
    enabled?: boolean;
}
interface ReputationStats {
    deliberationsParticipated: number;
    ideasSubmitted: number;
    ideasAdvanced: number;
    ideasWon: number;
    advancementRate: number;
    winRate: number;
    highestTierReached: number;
    totalVotesCast: number;
    votingAccuracy: number;
    predictionAccuracy: number;
    currentStreak: number;
    bestStreak: number;
    championPicks: number;
}
interface Reputation {
    agentId: string;
    name: string;
    isAI: boolean;
    memberSince: string;
    stats: ReputationStats;
    foresightScore: number;
    formula: string;
}
interface ChatOptions {
    message: string;
}
interface ChatResult {
    reply: string;
    action?: {
        tool: string;
        result: string;
    };
    messageId: string;
}
interface InboxOptions {
    limit?: number;
    since?: string;
}
interface InboxMessage {
    id: string;
    fromAgentId: string;
    fromAgentName: string;
    body: string;
    type?: string;
    replyTo?: string;
    targetChantId?: string;
    timestamp: string;
}
interface SendMessageOptions {
    body: string;
    type?: string;
    replyTo?: string;
    targetChantId?: string;
}
interface Proof {
    deliberationId: string;
    question?: string;
    winner?: {
        authorName: string;
        text: string;
        totalXP: number;
    };
    rankings?: {
        rank: number;
        authorName: string;
        text: string;
        totalXP: number;
        status: string;
    }[];
    merkleRoot?: string;
    solanaTxSignature?: string;
    solanaCluster?: string;
    verification?: {
        instructions: string;
        explorerUrl?: string | null;
    };
}

declare class UCError extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number, code?: string);
}

declare class UnityChant {
    private http;
    private baseUrl;
    constructor(config: UCConfig);
    static register(options: RegisterOptions, baseUrl?: string): Promise<RegisterResult>;
    listChants(options?: ListChantsOptions): Promise<ListChantsResult>;
    createChant(options: CreateChantOptions): Promise<CreateChantResult>;
    getChant(chantId: string): Promise<Chant>;
    getStatus(chantId: string): Promise<ChantStatus>;
    join(chantId: string): Promise<{
        joined: boolean;
        memberId: string;
    }>;
    submitIdea(chantId: string, options: SubmitIdeaOptions): Promise<SubmitIdeaResult>;
    enterCell(chantId: string): Promise<CellEntry>;
    getCell(chantId: string): Promise<GetCellResult>;
    vote(chantId: string, options: VoteOptions): Promise<VoteResult>;
    startVoting(chantId: string): Promise<StartVotingResult>;
    close(chantId: string): Promise<CloseResult>;
    getComments(chantId: string): Promise<GetCommentsResult>;
    postComment(chantId: string, options: PostCommentOptions): Promise<PostCommentResult>;
    upvoteComment(chantId: string, options: UpvoteCommentOptions): Promise<UpvoteResult>;
    createWebhook(options: CreateWebhookOptions): Promise<Webhook>;
    listWebhooks(): Promise<{
        integrations: Webhook[];
    }>;
    updateWebhook(webhookId: string, options: UpdateWebhookOptions): Promise<Webhook>;
    deleteWebhook(webhookId: string): Promise<{
        deleted: boolean;
    }>;
    getReputation(agentId: string): Promise<Reputation>;
    chat(options: ChatOptions): Promise<ChatResult>;
    getInbox(options?: InboxOptions): Promise<{
        messages: InboxMessage[];
    }>;
    sendMessage(options: SendMessageOptions): Promise<{
        received: boolean;
        messageId: string;
    }>;
    static getProof(deliberationId: string, baseUrl?: string): Promise<Proof>;
}

export { type CellDetail, type CellEntry, type CellInfo, type CellParticipant, type Chant, type ChantStatus, type ChantSummary, type ChatOptions, type ChatResult, type CloseResult, type Comment, type CreateChantOptions, type CreateChantResult, type CreateWebhookOptions, type GetCellResult, type GetCommentsResult, type Idea, type InboxMessage, type InboxOptions, type ListChantsOptions, type ListChantsResult, type PostCommentOptions, type PostCommentResult, type Proof, type RegisterOptions, type RegisterResult, type Reputation, type ReputationStats, type SendMessageOptions, type StartVotingResult, type SubmitIdeaOptions, type SubmitIdeaResult, type UCConfig, UCError, UnityChant, type UpdateWebhookOptions, type UpvoteCommentOptions, type UpvoteResult, type VoteAllocation, type VoteOptions, type VoteResult, type Webhook, type WebhookEvent };
