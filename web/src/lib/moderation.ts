// Content moderation utilities
// Combines regex word filter + AI scan via Haiku for deeper checks

import Anthropic from '@anthropic-ai/sdk'

const BLOCKED_PATTERNS = [
  // Slurs and hate speech (partial list, regex patterns)
  /\bn[i1]gg[ae3]r?s?\b/i,
  /\bf[a@]gg?[o0]t?s?\b/i,
  /\bk[i1]ke?s?\b/i,
  /\bsp[i1]c?k?s?\b/i,
  /\bch[i1]nk?s?\b/i,
  /\btr[a@]nn(?:y|ies)\b/i,
  /\br[e3]t[a@]rd(?:ed|s)?\b/i,

  // Extreme content
  /\bk[i1]ll\s+(?:yourself|urself|all)\b/i,
  /\bh[e3][i1]l\s+h[i1]tl[e3]r\b/i,
  /\bgas\s+the\b/i,

  // Links - block all URLs
  /https?:\/\/[^\s]+/i,
  /www\.[^\s]+/i,
  /[a-zA-Z0-9-]+\.(com|org|net|io|co|app|dev|xyz|info|biz|me|tv|cc|gg|link|click)\b/i,

  // Spam patterns
  /(.)\1{10,}/i, // Repeated characters (aaaaaaaaaa)
  /\b(?:buy|click|subscribe|follow)\s+(?:now|here|my)\b/i,
]

const SUSPICIOUS_PATTERNS = [
  // Might be problematic, flag for review but don't block
  /\bh[a@]te\b/i,
  /\bst[u]p[i1]d\b/i,
  /\bid[i1][o0]t\b/i,
]

export type ModerationResult = {
  allowed: boolean
  reason?: string
  flagged?: boolean
  flagReason?: string
}

/**
 * Check if content passes basic moderation
 * Returns { allowed: true } if content is OK
 * Returns { allowed: false, reason: "..." } if blocked
 * Returns { allowed: true, flagged: true, flagReason: "..." } if suspicious but allowed
 */
export function moderateContent(text: string): ModerationResult {
  if (!text || typeof text !== 'string') {
    return { allowed: true }
  }

  const normalizedText = text.trim()

  // Check length
  if (normalizedText.length > 5000) {
    return { allowed: false, reason: 'Content too long (max 5000 characters)' }
  }

  if (normalizedText.length < 2) {
    return { allowed: false, reason: 'Content too short' }
  }

  // Check for links first (clearer error message)
  const linkPatterns = [
    /https?:\/\/[^\s]+/i,
    /www\.[^\s]+/i,
    /[a-zA-Z0-9-]+\.(com|org|net|io|co|app|dev|xyz|info|biz|me|tv|cc|gg|link|click)\b/i,
  ]
  for (const pattern of linkPatterns) {
    if (pattern.test(normalizedText)) {
      return { allowed: false, reason: 'Links are not allowed' }
    }
  }

  // Check blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(normalizedText)) {
      return { allowed: false, reason: 'Content violates community guidelines' }
    }
  }

  // Check suspicious patterns (allow but flag)
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(normalizedText)) {
      return {
        allowed: true,
        flagged: true,
        flagReason: 'Content flagged for review'
      }
    }
  }

  return { allowed: true }
}

// ── Moderation strike tracker ──
// After 10 failed moderation attempts, flag for admin review (not auto-lockout)

const moderationStrikes = new Map<string, { count: number; flagged: boolean }>()
const FLAG_THRESHOLD = 10

export function checkModerationLock(userId: string): { locked: boolean; remaining?: number } {
  // No automatic lockout — always allow posting, admin reviews flagged users
  return { locked: false }
}

export function recordModerationStrike(userId: string): void {
  const entry = moderationStrikes.get(userId) || { count: 0, flagged: false }
  entry.count++
  if (entry.count >= FLAG_THRESHOLD && !entry.flagged) {
    entry.flagged = true
    // Flag for admin review — no lockout
    console.warn(`[Moderation] User ${userId} reached ${FLAG_THRESHOLD} strikes — flagged for admin review`)
  }
  moderationStrikes.set(userId, entry)
}

export function resetModerationStrikes(userId: string): void {
  moderationStrikes.delete(userId)
}

export function isFlaggedForReview(userId: string): boolean {
  const entry = moderationStrikes.get(userId)
  return entry?.flagged || false
}

/**
 * Sanitize text for display (basic XSS prevention)
 * Note: React already escapes by default, this is extra safety for edge cases
 */
export function sanitizeText(text: string): string {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

/**
 * Check if text looks like spam
 */
/**
 * AI-powered content moderation using Haiku.
 * Catches profanity, hate speech, gibberish, and nonsense that regex misses.
 * Returns { allowed: true } if clean, { allowed: false, reason } if rejected.
 */
let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _anthropic
}

export async function aiModerateContent(text: string): Promise<ModerationResult> {
  try {
    const res = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: 'You are a content moderator. Respond with ONLY valid JSON. No other text.',
      messages: [{
        role: 'user',
        content: `Check this user-submitted text. Reject if it contains:
- Profanity or swear words (fuck, shit, ass, damn, bitch, etc.)
- Hate speech, slurs, or bigotry
- Gibberish or random characters (e.g. "asdfjkl", "SFwdesFwef")
- Nonsensical text that isn't real language
- Threats or calls to violence

Respond with JSON: {"ok": true} if clean, or {"ok": false, "reason": "brief reason"}.

Text: "${text.slice(0, 5000).replace(/"/g, '\\"')}"`
      }],
    })
    const block = res.content.find(b => b.type === 'text')
    const raw = block && 'text' in block ? block.text : ''
    const match = raw.match(/\{[\s\S]*?\}/)
    if (!match) return { allowed: true } // fail open if parse fails
    const parsed = JSON.parse(match[0])
    if (parsed.ok === false) {
      return { allowed: false, reason: parsed.reason || 'Content rejected by moderation' }
    }
    return { allowed: true }
  } catch (err) {
    console.error('AI moderation error:', err)
    return { allowed: true } // fail open — don't block users if AI is down
  }
}

export function isLikelySpam(text: string): boolean {
  const normalizedText = text.toLowerCase()

  // All caps
  if (text.length > 20 && text === text.toUpperCase()) {
    return true
  }

  // Mostly numbers/symbols
  const alphaCount = (text.match(/[a-zA-Z]/g) || []).length
  if (text.length > 10 && alphaCount / text.length < 0.3) {
    return true
  }

  // Repeated words
  const words = normalizedText.split(/\s+/)
  const uniqueWords = new Set(words)
  if (words.length > 5 && uniqueWords.size / words.length < 0.3) {
    return true
  }

  return false
}
