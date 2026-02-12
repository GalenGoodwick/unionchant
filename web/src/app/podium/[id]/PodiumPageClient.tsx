'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useToast } from '@/components/Toast'
import FrameLayout from '@/components/FrameLayout'

type PodiumPost = {
  id: string
  title: string
  body: string
  views: number
  createdAt: string
  updatedAt: string
  author: {
    id: string
    name: string | null
    image: string | null
    bio: string | null
    isAI: boolean
  }
  deliberation: {
    id: string
    question: string
    description: string | null
    phase: string
    _count: { members: number; ideas: number }
  } | null
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function estimateReadTime(text: string) {
  const words = text.split(/\s+/).length
  const mins = Math.max(1, Math.ceil(words / 230))
  return `${mins} min read`
}

function phaseLabel(phase: string) {
  switch (phase) {
    case 'SUBMISSION': return 'Open for ideas'
    case 'VOTING': return 'Voting'
    case 'COMPLETED': return 'Completed'
    case 'ACCUMULATING': return 'Accepting new ideas'
    default: return phase
  }
}

export default function PodiumPageClient() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const { showToast } = useToast()
  const [podium, setPodium] = useState<PodiumPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    const fetchPodium = async () => {
      try {
        const res = await fetch(`/api/podiums/${params.id}`)
        if (res.ok) {
          const data = await res.json()
          setPodium(data)
        }
      } catch (err) {
        console.error('Failed to fetch podium:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchPodium()
  }, [params.id])

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/podiums/${params.id}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Post deleted', 'success')
        router.push('/chants')
      } else {
        const data = await res.json()
        showToast(data.error || 'Failed to delete', 'error')
      }
    } catch {
      showToast('Failed to delete', 'error')
    }
  }

  if (loading) {
    return (
      <FrameLayout active="podiums">
        <div className="flex items-center justify-center py-12">
          <div className="text-muted text-xs">Loading...</div>
        </div>
      </FrameLayout>
    )
  }

  if (!podium) {
    return (
      <FrameLayout active="podiums">
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <div className="text-sm font-bold text-foreground">Post not found</div>
        </div>
      </FrameLayout>
    )
  }

  const isAuthor = session?.user?.email && podium.author.id === (session.user as { id?: string }).id

  // Render body text with basic markdown support
  const bodyBlocks = parseMarkdown(podium.body)

  return (
    <FrameLayout active="podiums">
      <div className="py-4">
        {/* Author */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center text-sm font-semibold text-muted">
            {podium.author.image ? (
              <img src={podium.author.image} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              podium.author.name?.[0]?.toUpperCase() || '?'
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Link
                href={`/user/${podium.author.id}`}
                className="text-foreground font-semibold hover:text-accent transition-colors"
              >
                {podium.author.name || 'Anonymous'}
              </Link>
              {podium.author.isAI && (
                <span className="text-xs font-semibold text-purple border border-purple/30 px-1.5 py-0.5 rounded">AI</span>
              )}
            </div>
            <div className="text-xs text-muted">
              {formatDate(podium.createdAt)} &middot; {estimateReadTime(podium.body)}
              {podium.views > 0 && <> &middot; {podium.views} views</>}
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-sm font-bold text-foreground leading-tight mb-4">
          {podium.title}
        </h1>

        {/* Linked deliberation */}
        {podium.deliberation && (
          <Link
            href={`/chants/${podium.deliberation.id}`}
            className="block bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3 mb-4 hover:bg-accent/15 transition-colors"
          >
            <div className="text-xs font-semibold text-accent uppercase tracking-wider mb-1">
              Linked Chant
            </div>
            <div className="text-foreground font-medium">
              &ldquo;{podium.deliberation.question}&rdquo;
            </div>
            <div className="text-xs text-muted mt-1">
              {podium.deliberation._count.members} participants &middot;{' '}
              {podium.deliberation._count.ideas} ideas &middot;{' '}
              {phaseLabel(podium.deliberation.phase)}
            </div>
          </Link>
        )}

        {/* Body */}
        <article className="mb-6">
          {bodyBlocks.map((block, i) => {
            if (block.type === 'h2') return <h2 key={i} className="text-xl font-bold text-foreground mt-8 mb-3">{block.text}</h2>
            if (block.type === 'h3') return <h3 key={i} className="text-lg font-semibold text-foreground mt-6 mb-2">{block.text}</h3>
            if (block.type === 'hr') return <hr key={i} className="border-border my-6" />
            if (block.type === 'table') return <MarkdownTable key={i} rows={block.rows!} />
            return <p key={i} className="text-subtle leading-relaxed mb-4 text-base"><InlineMarkdown text={block.text!} /></p>
          })}
        </article>

        {/* Join Chant CTA */}
        {podium.deliberation && (
          <div className="mb-6 border border-border rounded-lg overflow-hidden">
            <div className="bg-accent/10 px-4 py-2 text-xs font-semibold text-accent uppercase tracking-wider">
              Linked Chant
            </div>
            <Link
              href={`/chants/${podium.deliberation.id}`}
              className="block p-4 hover:bg-surface/50 transition-colors"
            >
              <div className="text-foreground font-medium mb-1">
                &ldquo;{podium.deliberation.question}&rdquo;
              </div>
              {podium.deliberation.description && (
                <p className="text-xs text-muted mb-2 line-clamp-2">{podium.deliberation.description}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted">
                <span className="font-mono">{podium.deliberation._count.members} participants</span>
                <span className="font-mono">{podium.deliberation._count.ideas} ideas</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  podium.deliberation.phase === 'SUBMISSION' ? 'bg-accent/20 text-accent' :
                  podium.deliberation.phase === 'VOTING' ? 'bg-warning/20 text-warning' :
                  podium.deliberation.phase === 'COMPLETED' ? 'bg-success/20 text-success' :
                  'bg-purple/20 text-purple'
                }`}>
                  {phaseLabel(podium.deliberation.phase)}
                </span>
              </div>
            </Link>
          </div>
        )}

        {/* Footer actions */}
        <div className="border-t border-border pt-3 flex justify-between items-center text-xs text-muted">
          <div className="flex gap-4">
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href)
                  .then(() => showToast('Link copied', 'success'))
                  .catch(() => showToast('Failed to copy', 'error'))
              }}
              className="hover:text-foreground transition-colors"
            >
              Share
            </button>
          </div>
          {isAuthor && (
            <div className="flex gap-4">
              <Link
                href={`/podium/${podium.id}/edit`}
                className="hover:text-foreground transition-colors"
              >
                Edit
              </Link>
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="hover:text-red-400 transition-colors"
                >
                  Delete
                </button>
              ) : (
                <span className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    className="text-red-400 font-semibold"
                  >
                    Confirm delete
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="hover:text-foreground"
                  >
                    Cancel
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </FrameLayout>
  )
}

// ── Markdown rendering ──

type Block = { type: 'p' | 'h2' | 'h3' | 'hr' | 'table'; text?: string; rows?: string[][] }

function parseMarkdown(body: string): Block[] {
  const lines = body.split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Blank line — skip
    if (line.trim() === '') { i++; continue }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    // Headings
    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4).trim() })
      i++
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3).trim() })
      i++
      continue
    }

    // Table (consecutive lines starting with |)
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      const rows = tableLines
        .filter(l => !/^\|[\s-:|]+\|$/.test(l.trim())) // skip separator rows
        .map(l => l.split('|').slice(1, -1).map(c => c.trim()))
      if (rows.length > 0) blocks.push({ type: 'table', rows })
      continue
    }

    // Paragraph — collect lines until blank line or special line
    const paraLines: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('## ') && !lines[i].startsWith('### ') && !lines[i].trim().startsWith('|') && !/^---+$/.test(lines[i].trim())) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'p', text: paraLines.join(' ') })
    }
  }

  return blocks
}

function InlineMarkdown({ text }: { text: string }) {
  // Split on **bold** and *italic* patterns
  const parts: { text: string; bold?: boolean; italic?: boolean }[] = []
  let remaining = text

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/^([\s\S]*?)\*\*(.+?)\*\*([\s\S]*)$/)
    if (boldMatch) {
      if (boldMatch[1]) parts.push({ text: boldMatch[1] })
      parts.push({ text: boldMatch[2], bold: true })
      remaining = boldMatch[3]
      continue
    }
    // Italic
    const italicMatch = remaining.match(/^([\s\S]*?)\*(.+?)\*([\s\S]*)$/)
    if (italicMatch) {
      if (italicMatch[1]) parts.push({ text: italicMatch[1] })
      parts.push({ text: italicMatch[2], italic: true })
      remaining = italicMatch[3]
      continue
    }
    // Plain text
    parts.push({ text: remaining })
    break
  }

  return (
    <>
      {parts.map((p, i) => {
        if (p.bold) return <strong key={i} className="font-semibold text-foreground">{p.text}</strong>
        if (p.italic) return <em key={i}>{p.text}</em>
        return <span key={i}>{p.text}</span>
      })}
    </>
  )
}

function MarkdownTable({ rows }: { rows: string[][] }) {
  if (rows.length === 0) return null
  const header = rows[0]
  const body = rows.slice(1)

  return (
    <div className="overflow-x-auto my-4 rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface">
            {header.map((cell, i) => (
              <th key={i} className="text-left px-3 py-2 font-semibold text-foreground border-b border-border">
                <InlineMarkdown text={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? '' : 'bg-surface/50'}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-subtle border-b border-border/50">
                  <InlineMarkdown text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
