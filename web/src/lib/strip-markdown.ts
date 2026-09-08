// Flatten Markdown to plain text for feed previews / truncation.
// Not a parser — a best-effort scrub of the syntax that shows up in
// synthesized champion text (**bold**, # headings, lists, links, code).
export function stripMarkdown(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|[.,;:!?]|$)/gm, '$1$2')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^[-*_]{3,}\s*$/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Truncate plain text at a word boundary; returns the text plus a flag so
// callers can render their own "read more" affordance.
export function truncateAtWord(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false }
  const cut = s.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return { text: (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…', truncated: true }
}
