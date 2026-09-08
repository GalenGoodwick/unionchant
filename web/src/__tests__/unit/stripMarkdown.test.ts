import { describe, it, expect } from 'vitest'
import { stripMarkdown, truncateAtWord } from '@/lib/strip-markdown'

describe('stripMarkdown', () => {
  it('passes plain text through', () => {
    expect(stripMarkdown('Need a Greek restaurant')).toBe('Need a Greek restaurant')
  })

  it('strips bold and italic', () => {
    expect(stripMarkdown('**Global Peer Mediation Network** — *rotating* cohorts')).toBe('Global Peer Mediation Network — rotating cohorts')
    expect(stripMarkdown('__bold__ and _em_ done')).toBe('bold and em done')
  })

  it('strips headings and list markers', () => {
    expect(stripMarkdown('# Plan\n- first\n- second\n1. third')).toBe('Plan first second third')
  })

  it('keeps link text, drops URLs', () => {
    expect(stripMarkdown('see [the spec](https://x.com/y) now')).toBe('see the spec now')
  })

  it('strips inline and fenced code', () => {
    expect(stripMarkdown('run `npm i` then\n```\nsecret block\n```\ndone')).toBe('run npm i then done')
  })

  it('strips blockquotes and hrules, collapses whitespace', () => {
    expect(stripMarkdown('> quoted\n\n---\n\nafter   spaces')).toBe('quoted after spaces')
  })

  it('does not eat mid-word asterisk-free math like 2*3', () => {
    expect(stripMarkdown('a 2*3 grid')).toBe('a 2*3 grid')
  })
})

describe('truncateAtWord', () => {
  it('returns short text untouched', () => {
    const r = truncateAtWord('short', 200)
    expect(r).toEqual({ text: 'short', truncated: false })
  })

  it('cuts at a word boundary with ellipsis', () => {
    const r = truncateAtWord('alpha beta gamma delta', 12)
    expect(r.truncated).toBe(true)
    expect(r.text).toBe('alpha beta…')
  })

  it('hard-cuts when no reasonable space exists', () => {
    const r = truncateAtWord('a'.repeat(300), 100)
    expect(r.truncated).toBe(true)
    expect(r.text.length).toBe(101) // 100 chars + ellipsis
  })
})
