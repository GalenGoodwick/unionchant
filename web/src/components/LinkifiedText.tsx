import React from 'react'

// Matches http(s) URLs. Trailing sentence punctuation is trimmed off the href below.
const URL_RE = /(https?:\/\/[^\s]+)/gi

/**
 * Renders plain text with any URLs turned into safe links that open in a new
 * tab. Used for idea/comment text so a link never navigates the user away from
 * their spot in the chant:
 *   - target="_blank" + rel="noopener noreferrer" opens a new tab.
 *   - onClick stopPropagation prevents a click from also firing the parent
 *     card's handler (docking / voting), which would move them off the cell.
 * No dangerouslySetInnerHTML — text is split and rendered as React nodes.
 */
export default function LinkifiedText({ text }: { text: string }) {
  if (!text) return null
  const parts: React.ReactNode[] = []
  const re = new RegExp(URL_RE)
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const matched = m[0]
    const start = m.index
    if (start > last) parts.push(text.slice(last, start))

    // Trim trailing punctuation that's almost never part of the URL.
    let href = matched
    let trailing = ''
    const trail = href.match(/[).,;:!?]+$/)
    if (trail) {
      trailing = trail[0]
      href = href.slice(0, href.length - trailing.length)
    }

    parts.push(
      <a
        key={key++}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-accent underline break-all"
      >
        {href}
      </a>
    )
    if (trailing) parts.push(trailing)
    last = start + matched.length
  }
  if (last < text.length) parts.push(text.slice(last))

  return <>{parts.length ? parts : text}</>
}
