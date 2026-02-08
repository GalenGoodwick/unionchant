'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

interface DiscordInfo {
  communityId: string
  communityName: string
  communitySlug: string
  discordGuildId: string
  discordInviteUrl: string | null
}

export default function DiscordClaimBanner({ deliberationId }: { deliberationId: string }) {
  const { data: session } = useSession()
  const [info, setInfo] = useState<DiscordInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!session?.user?.id) return

    // Check if already dismissed
    const key = `uc:discord-claimed`
    if (localStorage.getItem(key)) {
      setDismissed(true)
      return
    }

    fetch(`/api/deliberations/${deliberationId}/discord-info`)
      .then(res => res.json())
      .then(data => {
        if (data?.communityId) {
          setInfo(data)
          if (data.discordInviteUrl) setInviteUrl(data.discordInviteUrl)
        }
      })
      .catch(() => {})
  }, [session?.user?.id, deliberationId])

  if (!info || dismissed) return null

  const handleDismiss = () => {
    localStorage.setItem(`uc:discord-claimed`, '1')
    setDismissed(true)
  }

  const handleSaveInvite = async () => {
    if (!inviteUrl.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/deliberations/${deliberationId}/discord-info`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordInviteUrl: inviteUrl.trim() }),
      })
      if (res.ok) setSaved(true)
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-[#5865F2]/10 border border-[#5865F2]/30 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <svg className="w-6 h-6 text-[#5865F2] flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
        <div className="flex-1 min-w-0">
          <h3 className="text-foreground font-semibold text-sm mb-1">
            Welcome! You own {info.communityName} on Discord.
          </h3>
          <p className="text-subtle text-sm leading-relaxed mb-3">
            Your Discord server is now a community on Unity Chant. Here&apos;s how it works:
          </p>
          <ul className="text-subtle text-sm leading-relaxed space-y-1.5 mb-3 list-disc list-inside">
            <li>Members who use <code className="text-accent bg-accent-light px-1 rounded text-xs">/chant</code> and <code className="text-accent bg-accent-light px-1 rounded text-xs">/idea</code> in Discord are automatically added here</li>
            <li>Voting happens on this website — Discord members click &ldquo;Open on Web&rdquo; to vote</li>
            <li>You can manage settings, view analytics, and share invite links from the community page</li>
            <li>Your community is currently <strong className="text-foreground">public</strong> — anyone can browse it on unitychant.com</li>
            <li>Want it private? <Link href="/pricing" className="text-accent hover:text-accent-hover underline">Upgrade to Pro</Link></li>
          </ul>

          {/* Discord invite link input */}
          {!info.discordInviteUrl && !saved && (
            <div className="bg-background border border-border rounded-lg p-3 mb-3">
              <label className="text-foreground text-xs font-medium block mb-1.5">
                Paste your permanent Discord invite link (optional)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={inviteUrl}
                  onChange={e => setInviteUrl(e.target.value)}
                  placeholder="https://discord.gg/abc123"
                  className="flex-1 bg-surface border border-border rounded px-3 py-1.5 text-foreground text-sm focus:outline-none focus:border-accent"
                />
                <button
                  onClick={handleSaveInvite}
                  disabled={saving || !inviteUrl.trim()}
                  className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {saving ? '...' : 'Save'}
                </button>
              </div>
              <p className="text-muted text-xs mt-1">This lets web users join your Discord server from the community page.</p>
            </div>
          )}

          {saved && (
            <div className="bg-success-bg border border-success text-success text-xs p-2 rounded mb-3">
              Discord invite link saved!
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleDismiss}
              className="bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
            >
              Got it
            </button>
            <Link
              href={`/groups/${info.communitySlug}/settings`}
              className="text-muted hover:text-foreground text-sm"
            >
              Community Settings →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
