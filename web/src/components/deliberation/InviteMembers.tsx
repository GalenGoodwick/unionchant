'use client'

import Section from './Section'

export default function InviteMembers({
  inviteCode,
  inviteEmails,
  setInviteEmails,
  sendingInvites,
  inviteResult,
  copiedInviteLink,
  onSendInvites,
  onCopyInviteLink,
}: {
  inviteCode?: string
  inviteEmails: string
  setInviteEmails: (v: string) => void
  sendingInvites: boolean
  inviteResult: { sent: number; failed: number } | null
  copiedInviteLink: boolean
  onSendInvites: (e: React.FormEvent) => void
  onCopyInviteLink: () => void
}) {
  return (
    <Section title="Invite Members" defaultOpen={false}>
      {inviteCode && (
        <div className="mb-3">
          <label className="text-xs text-muted block mb-1">Invite link</label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={`${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${inviteCode}`}
              className="flex-1 bg-background border border-border rounded px-3 py-1.5 text-sm text-muted"
            />
            <button
              onClick={onCopyInviteLink}
              className="border border-border hover:border-accent text-foreground px-3 py-1.5 rounded text-sm"
            >
              {copiedInviteLink ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={onSendInvites}>
        <label className="text-xs text-muted block mb-1">Send email invites</label>
        <textarea
          placeholder="Enter emails, separated by commas or newlines"
          value={inviteEmails}
          onChange={(e) => setInviteEmails(e.target.value)}
          rows={3}
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent mb-2"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={sendingInvites || !inviteEmails.trim()}
            className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
          >
            {sendingInvites ? 'Sending...' : 'Send Invites'}
          </button>
          {inviteResult && (
            <span className="text-sm text-success">
              {inviteResult.sent} sent{inviteResult.failed > 0 ? `, ${inviteResult.failed} failed` : ''}
            </span>
          )}
        </div>
      </form>
    </Section>
  )
}
