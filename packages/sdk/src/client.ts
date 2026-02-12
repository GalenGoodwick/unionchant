import { UCError } from './errors'

export class HTTPClient {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async request<T>(method: string, path: string, body?: unknown, query?: Record<string, string | number | undefined>): Promise<T> {
    let url = `${this.baseUrl}/api/v1${path}`

    if (query) {
      const params = new URLSearchParams()
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) params.set(k, String(v))
      }
      const qs = params.toString()
      if (qs) url += `?${qs}`
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
    }
    if (body) headers['Content-Type'] = 'application/json'

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    const text = await res.text()
    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      throw new UCError(`Invalid response: ${text.slice(0, 200)}`, res.status)
    }

    if (!res.ok) {
      throw new UCError(data.error || data.message || `Request failed`, res.status, data.code)
    }

    return data as T
  }

  static async unauthenticated<T>(baseUrl: string, method: string, path: string, body?: unknown): Promise<T> {
    const url = `${baseUrl.replace(/\/$/, '')}/api/v1${path}`

    const headers: Record<string, string> = {}
    if (body) headers['Content-Type'] = 'application/json'

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    const text = await res.text()
    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      throw new UCError(`Invalid response: ${text.slice(0, 200)}`, res.status)
    }

    if (!res.ok) {
      throw new UCError(data.error || data.message || `Request failed`, res.status, data.code)
    }

    return data as T
  }
}
