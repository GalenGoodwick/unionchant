'use client'

import { useRef, useState } from 'react'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: string
}

export default function MarkdownEditor({ value, onChange, placeholder, minHeight = '300px' }: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showHelp, setShowHelp] = useState(false)
  const lastActionRef = useRef<number>(0)

  const insertMarkdown = (before: string, after = '', placeholder = 'text') => {
    // Debounce to prevent double-clicks
    const now = Date.now()
    if (now - lastActionRef.current < 200) return
    lastActionRef.current = now

    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = value.substring(start, end)
    const textToInsert = selectedText || placeholder

    const newValue = value.substring(0, start) + before + textToInsert + after + value.substring(end)
    const newCursorPos = start + before.length + (selectedText ? textToInsert.length + after.length : 0)

    onChange(newValue)

    // Set cursor position after React updates
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(newCursorPos, newCursorPos + (selectedText ? 0 : textToInsert.length))
    })
  }

  const insertAtNewLine = (text: string) => {
    // Debounce to prevent double-clicks
    const now = Date.now()
    if (now - lastActionRef.current < 200) return
    lastActionRef.current = now

    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const beforeCursor = value.substring(0, start)
    const afterCursor = value.substring(start)

    // Add newlines if not at start and previous char isn't newline
    const needsPrefix = beforeCursor.length > 0 && !beforeCursor.endsWith('\n')
    const needsSuffix = afterCursor.length > 0 && !afterCursor.startsWith('\n')

    const prefix = needsPrefix ? '\n\n' : ''
    const suffix = needsSuffix ? '\n\n' : ''

    const newValue = beforeCursor + prefix + text + suffix + afterCursor
    const newCursorPos = start + prefix.length + text.length

    onChange(newValue)

    // Set cursor position after React updates
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(newCursorPos, newCursorPos)
    })
  }

  const handleBold = () => insertMarkdown('**', '**')
  const handleItalic = () => insertMarkdown('*', '*')
  const handleCode = () => insertMarkdown('`', '`', 'code')
  const handleH2 = () => insertAtNewLine('## Heading')
  const handleH3 = () => insertAtNewLine('### Subheading')
  const handleBulletList = () => insertAtNewLine('- List item')
  const handleNumberedList = () => insertAtNewLine('1. List item')
  const handleBlockquote = () => insertAtNewLine('> Quote')
  const handleCodeBlock = () => insertAtNewLine('```\ncode\n```')
  const handleHr = () => insertAtNewLine('---')
  const handleLink = () => {
    const url = prompt('Enter URL:')
    if (url) insertMarkdown('[', `](${url})`, 'link text')
  }

  const tools = [
    { label: 'B', title: 'Bold (**text**)', onClick: handleBold, className: 'font-bold' },
    { label: 'I', title: 'Italic (*text*)', onClick: handleItalic, className: 'italic' },
    { label: 'H2', title: 'Heading 2 (## text)', onClick: handleH2 },
    { label: 'H3', title: 'Heading 3 (### text)', onClick: handleH3 },
    { label: '•', title: 'Bullet list (- item)', onClick: handleBulletList },
    { label: '1.', title: 'Numbered list (1. item)', onClick: handleNumberedList },
    { label: '""', title: 'Blockquote (> text)', onClick: handleBlockquote },
    { label: '<>', title: 'Inline code (`code`)', onClick: handleCode, className: 'font-mono text-xs' },
    { label: '{...}', title: 'Code block (```)', onClick: handleCodeBlock, className: 'font-mono text-xs' },
    { label: '🔗', title: 'Link ([text](url))', onClick: handleLink },
    { label: '—', title: 'Horizontal rule (---)', onClick: handleHr },
  ]

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-1 pb-2 border-b border-border flex-wrap">
        {tools.map((tool, i) => (
          <button
            key={i}
            type="button"
            onClick={tool.onClick}
            title={tool.title}
            className={`px-2 py-1 text-xs rounded hover:bg-surface transition-colors text-foreground ${tool.className || ''}`}
          >
            {tool.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="ml-auto px-2 py-1 text-xs rounded hover:bg-surface transition-colors text-muted"
        >
          {showHelp ? 'Hide guide' : 'Formatting guide'}
        </button>
      </div>

      {/* Help guide */}
      {showHelp && (
        <div className="bg-surface border border-border rounded-lg p-3 text-xs space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div><code className="text-accent">**bold**</code> → <strong>bold</strong></div>
            <div><code className="text-accent">*italic*</code> → <em>italic</em></div>
            <div><code className="text-accent">`code`</code> → <code className="bg-border px-1 rounded">code</code></div>
            <div><code className="text-accent">[text](url)</code> → <a className="text-accent underline">link</a></div>
            <div><code className="text-accent">## Heading</code> → Heading 2</div>
            <div><code className="text-accent">### Heading</code> → Heading 3</div>
            <div><code className="text-accent">- item</code> → Bullet list</div>
            <div><code className="text-accent">1. item</code> → Numbered list</div>
            <div><code className="text-accent">&gt; quote</code> → Blockquote</div>
            <div><code className="text-accent">---</code> → Horizontal rule</div>
          </div>
          <div className="pt-1 border-t border-border">
            <div><code className="text-accent">```<br />code block<br />```</code> → Code block</div>
          </div>
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-xs text-muted placeholder-border outline-none leading-relaxed resize-none"
        style={{ minHeight }}
      />

      {/* Character count */}
      <div className="text-xs text-muted">
        {value.length.toLocaleString()} characters
      </div>
    </div>
  )
}
