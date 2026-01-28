// Basic content moderation utilities
// This is a simple word filter - not comprehensive, but catches obvious violations

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
  if (normalizedText.length > 2000) {
    return { allowed: false, reason: 'Content too long (max 2000 characters)' }
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
