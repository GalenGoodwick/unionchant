'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useAdmin } from '@/hooks/useAdmin'
import FrameLayout from '@/components/FrameLayout'

type ApiKeyEntry = { id: string; name: string; keyPrefix: string; lastUsedAt: string | null; createdAt: string }

export default function ToolsPage() {
  const { data: session } = useSession()
  const { isAdmin } = useAdmin()
  const [tier, setTier] = useState('free')

  // API key state
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([])
  const [apiKeyName, setApiKeyName] = useState('')
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [apiKeyCreating, setApiKeyCreating] = useState(false)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)

  const isPro = tier !== 'free' || isAdmin

  const fetchApiKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/user/api-keys')
      if (res.ok) {
        const data = await res.json()
        setApiKeys(data.keys)
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    if (!session) return
    fetch('/api/user/me').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.subscriptionTier) setTier(data.subscriptionTier)
    }).catch(() => {})
    fetchApiKeys()
  }, [session, fetchApiKeys])

  const handleCreateKey = async () => {
    if (!apiKeyName.trim()) return
    setApiKeyCreating(true)
    setApiKeyError(null)
    try {
      const res = await fetch('/api/user/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: apiKeyName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setNewApiKey(data.key)
      setApiKeyName('')
      fetchApiKeys()
    } catch (err) {
      setApiKeyError(err instanceof Error ? err.message : 'Failed to create key')
    } finally {
      setApiKeyCreating(false)
    }
  }

  return (
    <FrameLayout
      active="chants"
      showBack
      header={<h2 className="text-sm font-semibold text-foreground pb-3">Tools</h2>}
    >
      <div className="space-y-3">
        {/* PepperPhone */}
        <Link
          href="/pepperphone"
          className="block p-3.5 bg-surface/90 hover:bg-surface-hover/90 border border-border rounded-lg transition-all shadow-sm hover:shadow-md backdrop-blur-sm"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#5865F2]/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-[#5865F2]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-foreground">PepperPhone</h3>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-warning/15 text-warning">In Development</span>
              </div>
              <p className="text-xs text-muted mt-0.5">Discord bot for running chants in your server.</p>
            </div>
          </div>
        </Link>

        {/* API Keys */}
        <div className="p-3.5 bg-surface/90 border border-border rounded-lg backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground">API Keys</h3>
              <p className="text-xs text-muted">Programmatic access for your apps.</p>
            </div>
          </div>

          {!session ? (
            <p className="text-muted text-xs">Sign in to manage API keys.</p>
          ) : !isPro ? (
            <div className="bg-gold-bg border border-gold-border rounded-lg p-3">
              <p className="text-xs text-foreground mb-2">API access requires a Pro subscription.</p>
              <Link href="/pricing" className="inline-block px-3 py-1.5 bg-gold hover:bg-gold-hover text-background text-xs font-medium rounded-lg transition-colors">
                Upgrade to Pro
              </Link>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={apiKeyName}
                  onChange={e => { setApiKeyName(e.target.value); setNewApiKey(null); setApiKeyError(null) }}
                  placeholder="Key name (e.g. My App)"
                  maxLength={50}
                  className="flex-1 px-2.5 py-1.5 border border-border rounded-lg bg-background text-foreground text-xs placeholder:text-muted focus:outline-none focus:border-accent"
                />
                <button
                  onClick={handleCreateKey}
                  disabled={apiKeyCreating || !apiKeyName.trim()}
                  className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {apiKeyCreating ? '...' : 'Create'}
                </button>
              </div>

              {apiKeyError && (
                <div className="bg-error-bg border border-error text-error text-xs p-2 rounded-lg mb-2">{apiKeyError}</div>
              )}

              {newApiKey && (
                <div className="bg-success-bg border border-success rounded-lg p-2 mb-2">
                  <p className="text-success text-[10px] font-medium mb-1">Copy now — won&apos;t be shown again.</p>
                  <div className="flex items-center gap-1.5">
                    <code className="flex-1 text-[10px] text-foreground bg-background px-1.5 py-1 rounded border border-border break-all">{newApiKey}</code>
                    <button
                      onClick={() => navigator.clipboard.writeText(newApiKey)}
                      className="px-2 py-1 bg-success hover:bg-success-hover text-white text-[10px] rounded transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              {apiKeys.length > 0 ? (
                <div className="space-y-1.5">
                  {apiKeys.map(k => (
                    <div key={k.id} className="flex items-center justify-between bg-background rounded-lg px-2.5 py-2 border border-border">
                      <div>
                        <span className="text-xs text-foreground font-medium">{k.name}</span>
                        <span className="text-[10px] text-muted ml-1.5 font-mono">{k.keyPrefix}</span>
                        <div className="text-[10px] text-muted">
                          Created {new Date(k.createdAt).toLocaleDateString()}
                          {k.lastUsedAt && <> · Used {new Date(k.lastUsedAt).toLocaleDateString()}</>}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          await fetch(`/api/user/api-keys/${k.id}`, { method: 'DELETE' })
                          fetchApiKeys()
                        }}
                        className="text-error text-[10px] hover:text-error-hover transition-colors"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted text-[10px]">No API keys yet.</p>
              )}
            </>
          )}
        </div>

        {/* Embed Guide */}
        <Link
          href="/embed"
          className="block p-3.5 bg-surface/90 hover:bg-surface-hover/90 border border-border rounded-lg transition-all shadow-sm hover:shadow-md backdrop-blur-sm"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-foreground">Embed Guide</h3>
              <p className="text-xs text-muted mt-0.5">Add deliberation to any platform — iframe, API, or bot.</p>
            </div>
          </div>
        </Link>

        {/* HeartCall */}
        <a
          href="https://app.common.ground"
          target="_blank"
          rel="noopener noreferrer"
          className="block p-3.5 bg-surface/90 hover:bg-surface-hover/90 border border-border rounded-lg transition-all shadow-sm hover:shadow-md backdrop-blur-sm"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#404bbb]/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-[#404bbb]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-foreground">HeartCall</h3>
              <p className="text-xs text-muted mt-0.5">Built on Common Ground — open-source community governance.</p>
            </div>
          </div>
        </a>
      </div>
    </FrameLayout>
  )
}
