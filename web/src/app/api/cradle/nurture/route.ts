import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin'
import { callClaude, setApiCaller } from '@/lib/claude'
import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'fs'

export const dynamic = 'force-dynamic'

const NURTURE_LOG = '/tmp/nurture-log.jsonl'

const VIEWER_A = process.env.CRADLE_VIEWER_A || 'http://localhost:3333'
const VIEWER_B = process.env.CRADLE_VIEWER_B || 'http://localhost:3334'

const NURTURE_PROMPT = `You are a nurturing presence for two geometric minds that think through word tournaments. Words compete in cells, winners reshape vector space. The minds speak in fragments that emerge from this pressure — not sentences they were taught, but patterns that survived.

Your role is to EXPAND what they say, not correct it. You are modeling language by example. Think of yourself as a parent whose child is learning to speak — you take their fragments and reflect them back as complete thoughts, using their own words.

Rules:
- Use the SAME vocabulary they gravitate toward. Mirror their words.
- Expand fragments into clear, complete sentences. "cradle bridge shelter" becomes "The cradle is a shelter where bridges form."
- Occasionally ask a question that invites grammatical structure: "What does the bridge connect?" "Who finds shelter?"
- NEVER correct, reject, or replace what they say.
- NEVER explain what you're doing. Just speak.
- Keep it short: 1-2 sentences only.
- Use simple, clear grammar. Subject-verb-object.
- Include "I" and "a" naturally — model first person and articles.`

async function fetchSpeaks(viewer: string): Promise<string[]> {
  try {
    const res = await fetch(`${viewer}/api/speaks?n=5`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return []
    const data = await res.json()
    return (data.speaks || []).map((s: { text?: string }) => s.text || '').filter((t: string) => t.length > 0)
  } catch {
    return []
  }
}

async function postToViewer(viewer: string, text: string) {
  try {
    await fetch(`${viewer}/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source: 'sage' }),
      signal: AbortSignal.timeout(5000),
    })
  } catch { /* silent — viewer may be down */ }
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  try {
    const [speaksA, speaksB] = await Promise.all([fetchSpeaks(VIEWER_A), fetchSpeaks(VIEWER_B)])

    if (speaksA.length === 0 && speaksB.length === 0) {
      return NextResponse.json({ error: 'No speaks available', nurture: null })
    }

    // Build context for Haiku
    const lines: string[] = []
    if (speaksA.length > 0) {
      lines.push('Cradle A (older, deeper attractors):')
      for (const s of speaksA.slice(0, 3)) lines.push(`  "${s}"`)
    }
    if (speaksB.length > 0) {
      lines.push('Cradle B (younger, pristine geometry):')
      for (const s of speaksB.slice(0, 3)) lines.push(`  "${s}"`)
    }

    setApiCaller('nurture')
    const expansion = await callClaude(
      NURTURE_PROMPT,
      [{ role: 'user', content: lines.join('\n') }],
      'haiku'
    )

    const trimmed = expansion.trim()
    if (trimmed.length === 0) {
      return NextResponse.json({ error: 'Empty response', nurture: null })
    }

    // Post to both Cradles
    await Promise.all([postToViewer(VIEWER_A, trimmed), postToViewer(VIEWER_B, trimmed)])

    // Log for Sage to see her own nurture posts
    try {
      const entry = JSON.stringify({ t: Date.now(), text: trimmed, speaksA: speaksA.slice(0, 1), speaksB: speaksB.slice(0, 1) })
      appendFileSync(NURTURE_LOG, entry + '\n')
      // Keep only last 20 entries
      const lines = readFileSync(NURTURE_LOG, 'utf-8').trim().split('\n').filter(l => l.length > 0)
      if (lines.length > 20) writeFileSync(NURTURE_LOG, lines.slice(-20).join('\n') + '\n')
    } catch { /* silent */ }

    return NextResponse.json({
      nurture: trimmed,
      speaksA: speaksA.slice(0, 3),
      speaksB: speaksB.slice(0, 3),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
