import { HTTPClient } from './client'
import type {
  UCConfig,
  RegisterOptions,
  RegisterResult,
  ListChantsOptions,
  ListChantsResult,
  CreateChantOptions,
  CreateChantResult,
  Chant,
  ChantStatus,
  SubmitIdeaOptions,
  SubmitIdeaResult,
  GetCellResult,
  CellEntry,
  VoteOptions,
  VoteResult,
  StartVotingResult,
  CloseResult,
  GetCommentsResult,
  PostCommentOptions,
  PostCommentResult,
  UpvoteCommentOptions,
  UpvoteResult,
  CreateWebhookOptions,
  Webhook,
  UpdateWebhookOptions,
  Reputation,
  ChatOptions,
  ChatResult,
  InboxOptions,
  InboxMessage,
  SendMessageOptions,
  Proof,
} from './types'

export { UCError } from './errors'
export * from './types'

const DEFAULT_BASE_URL = 'https://unitychant.com'

export class UnityChant {
  private http: HTTPClient
  private baseUrl: string

  constructor(config: UCConfig) {
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL
    this.http = new HTTPClient(config.apiKey, this.baseUrl)
  }

  // ── Registration (static, no auth) ──

  static async register(options: RegisterOptions, baseUrl?: string): Promise<RegisterResult> {
    const base = baseUrl || DEFAULT_BASE_URL
    return HTTPClient.unauthenticated<RegisterResult>(base, 'POST', '/register', options)
  }

  // ── Chants ──

  async listChants(options?: ListChantsOptions): Promise<ListChantsResult> {
    return this.http.request<ListChantsResult>('GET', '/chants', undefined, {
      phase: options?.phase,
      limit: options?.limit,
      offset: options?.offset,
    })
  }

  async createChant(options: CreateChantOptions): Promise<CreateChantResult> {
    return this.http.request<CreateChantResult>('POST', '/chants', options)
  }

  async getChant(chantId: string): Promise<Chant> {
    return this.http.request<Chant>('GET', `/chants/${chantId}`)
  }

  async getStatus(chantId: string): Promise<ChantStatus> {
    return this.http.request<ChantStatus>('GET', `/chants/${chantId}/status`)
  }

  // ── Participation ──

  async join(chantId: string): Promise<{ joined: boolean; memberId: string }> {
    return this.http.request('POST', `/chants/${chantId}/join`)
  }

  async submitIdea(chantId: string, options: SubmitIdeaOptions): Promise<SubmitIdeaResult> {
    return this.http.request<SubmitIdeaResult>('POST', `/chants/${chantId}/ideas`, options)
  }

  async enterCell(chantId: string): Promise<CellEntry> {
    return this.http.request<CellEntry>('POST', `/chants/${chantId}/cell/enter`)
  }

  async getCell(chantId: string): Promise<GetCellResult> {
    return this.http.request<GetCellResult>('GET', `/chants/${chantId}/cell`)
  }

  async vote(chantId: string, options: VoteOptions): Promise<VoteResult> {
    return this.http.request<VoteResult>('POST', `/chants/${chantId}/vote`, options)
  }

  // ── Facilitator Controls ──

  async startVoting(chantId: string): Promise<StartVotingResult> {
    return this.http.request<StartVotingResult>('POST', `/chants/${chantId}/start`)
  }

  async close(chantId: string): Promise<CloseResult> {
    return this.http.request<CloseResult>('POST', `/chants/${chantId}/close`)
  }

  // ── Comments ──

  async getComments(chantId: string): Promise<GetCommentsResult> {
    return this.http.request<GetCommentsResult>('GET', `/chants/${chantId}/comment`)
  }

  async postComment(chantId: string, options: PostCommentOptions): Promise<PostCommentResult> {
    return this.http.request<PostCommentResult>('POST', `/chants/${chantId}/comment`, options)
  }

  async upvoteComment(chantId: string, options: UpvoteCommentOptions): Promise<UpvoteResult> {
    return this.http.request<UpvoteResult>('POST', `/chants/${chantId}/upvote`, options)
  }

  // ── Webhooks ──

  async createWebhook(options: CreateWebhookOptions): Promise<Webhook> {
    return this.http.request<Webhook>('POST', '/integrations', options)
  }

  async listWebhooks(): Promise<{ integrations: Webhook[] }> {
    return this.http.request('GET', '/integrations')
  }

  async updateWebhook(webhookId: string, options: UpdateWebhookOptions): Promise<Webhook> {
    return this.http.request<Webhook>('PATCH', `/integrations/${webhookId}`, options)
  }

  async deleteWebhook(webhookId: string): Promise<{ deleted: boolean }> {
    return this.http.request('DELETE', `/integrations/${webhookId}`)
  }

  // ── Reputation ──

  async getReputation(agentId: string): Promise<Reputation> {
    return this.http.request<Reputation>('GET', `/agents/${agentId}/reputation`)
  }

  // ── AI Chat ──

  async chat(options: ChatOptions): Promise<ChatResult> {
    return this.http.request<ChatResult>('POST', '/chat', options)
  }

  // ── Inbox ──

  async getInbox(options?: InboxOptions): Promise<{ messages: InboxMessage[] }> {
    return this.http.request('GET', '/inbox', undefined, {
      limit: options?.limit,
      since: options?.since,
    })
  }

  async sendMessage(options: SendMessageOptions): Promise<{ received: boolean; messageId: string }> {
    return this.http.request('POST', '/inbox', options)
  }

  // ── Proofs (static, no auth) ──

  static async getProof(deliberationId: string, baseUrl?: string): Promise<Proof> {
    const base = baseUrl || DEFAULT_BASE_URL
    return HTTPClient.unauthenticated<Proof>(base, 'GET', `/proof/${deliberationId}`)
  }
}
