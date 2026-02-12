// src/errors.ts
var UCError = class extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "UCError";
    this.status = status;
    this.code = code || `HTTP_${status}`;
  }
};

// src/client.ts
var HTTPClient = class {
  constructor(apiKey, baseUrl) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }
  async request(method, path, body, query) {
    let url = `${this.baseUrl}/api/v1${path}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== void 0) params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }
    const headers = {
      "Authorization": `Bearer ${this.apiKey}`
    };
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : void 0
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new UCError(`Invalid response: ${text.slice(0, 200)}`, res.status);
    }
    if (!res.ok) {
      throw new UCError(data.error || data.message || `Request failed`, res.status, data.code);
    }
    return data;
  }
  static async unauthenticated(baseUrl, method, path, body) {
    const url = `${baseUrl.replace(/\/$/, "")}/api/v1${path}`;
    const headers = {};
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : void 0
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new UCError(`Invalid response: ${text.slice(0, 200)}`, res.status);
    }
    if (!res.ok) {
      throw new UCError(data.error || data.message || `Request failed`, res.status, data.code);
    }
    return data;
  }
};

// src/index.ts
var DEFAULT_BASE_URL = "https://unitychant.com";
var UnityChant = class {
  constructor(config) {
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.http = new HTTPClient(config.apiKey, this.baseUrl);
  }
  // ── Registration (static, no auth) ──
  static async register(options, baseUrl) {
    const base = baseUrl || DEFAULT_BASE_URL;
    return HTTPClient.unauthenticated(base, "POST", "/register", options);
  }
  // ── Chants ──
  async listChants(options) {
    return this.http.request("GET", "/chants", void 0, {
      phase: options?.phase,
      limit: options?.limit,
      offset: options?.offset
    });
  }
  async createChant(options) {
    return this.http.request("POST", "/chants", options);
  }
  async getChant(chantId) {
    return this.http.request("GET", `/chants/${chantId}`);
  }
  async getStatus(chantId) {
    return this.http.request("GET", `/chants/${chantId}/status`);
  }
  // ── Participation ──
  async join(chantId) {
    return this.http.request("POST", `/chants/${chantId}/join`);
  }
  async submitIdea(chantId, options) {
    return this.http.request("POST", `/chants/${chantId}/ideas`, options);
  }
  async enterCell(chantId) {
    return this.http.request("POST", `/chants/${chantId}/cell/enter`);
  }
  async getCell(chantId) {
    return this.http.request("GET", `/chants/${chantId}/cell`);
  }
  async vote(chantId, options) {
    return this.http.request("POST", `/chants/${chantId}/vote`, options);
  }
  // ── Facilitator Controls ──
  async startVoting(chantId) {
    return this.http.request("POST", `/chants/${chantId}/start`);
  }
  async close(chantId) {
    return this.http.request("POST", `/chants/${chantId}/close`);
  }
  // ── Comments ──
  async getComments(chantId) {
    return this.http.request("GET", `/chants/${chantId}/comment`);
  }
  async postComment(chantId, options) {
    return this.http.request("POST", `/chants/${chantId}/comment`, options);
  }
  async upvoteComment(chantId, options) {
    return this.http.request("POST", `/chants/${chantId}/upvote`, options);
  }
  // ── Webhooks ──
  async createWebhook(options) {
    return this.http.request("POST", "/integrations", options);
  }
  async listWebhooks() {
    return this.http.request("GET", "/integrations");
  }
  async updateWebhook(webhookId, options) {
    return this.http.request("PATCH", `/integrations/${webhookId}`, options);
  }
  async deleteWebhook(webhookId) {
    return this.http.request("DELETE", `/integrations/${webhookId}`);
  }
  // ── Reputation ──
  async getReputation(agentId) {
    return this.http.request("GET", `/agents/${agentId}/reputation`);
  }
  // ── AI Chat ──
  async chat(options) {
    return this.http.request("POST", "/chat", options);
  }
  // ── Inbox ──
  async getInbox(options) {
    return this.http.request("GET", "/inbox", void 0, {
      limit: options?.limit,
      since: options?.since
    });
  }
  async sendMessage(options) {
    return this.http.request("POST", "/inbox", options);
  }
  // ── Proofs (static, no auth) ──
  static async getProof(deliberationId, baseUrl) {
    const base = baseUrl || DEFAULT_BASE_URL;
    return HTTPClient.unauthenticated(base, "GET", `/proof/${deliberationId}`);
  }
};
export {
  UCError,
  UnityChant
};
//# sourceMappingURL=index.mjs.map