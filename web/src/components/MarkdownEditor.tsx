'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const MDEditor = dynamic(
  () => import('@uiw/react-md-editor').then((mod) => mod.default),
  { ssr: false }
)

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: string
}

export default function MarkdownEditor({ value, onChange, placeholder, minHeight = '300px' }: MarkdownEditorProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-xs text-muted placeholder-border outline-none leading-relaxed resize-none border border-border rounded-lg p-3"
        style={{ minHeight }}
      />
    )
  }

  return (
    <div data-color-mode="dark">
      <MDEditor
        value={value}
        onChange={(val) => onChange(val || '')}
        preview="preview"
        height={parseInt(minHeight)}
        textareaProps={{
          placeholder: placeholder || 'Write your post...',
        }}
        previewOptions={{
          className: 'markdown-preview',
        }}
      />
      <div className="text-xs text-muted mt-2">
        {value.length.toLocaleString()} characters
      </div>
      <style jsx global>{`
        .w-md-editor {
          background: var(--color-background) !important;
          border: 1px solid var(--color-border) !important;
          border-radius: 0.5rem !important;
          color: var(--color-foreground) !important;
        }
        .w-md-editor-toolbar {
          background: var(--color-surface) !important;
          border-bottom: 1px solid var(--color-border) !important;
        }
        .w-md-editor-toolbar button {
          color: var(--color-foreground) !important;
        }
        .w-md-editor-toolbar button:hover {
          background: var(--color-background) !important;
        }
        .w-md-editor-text-pre,
        .w-md-editor-text-input {
          color: var(--color-muted) !important;
          font-size: 0.75rem !important;
          line-height: 1.5 !important;
        }
        .wmde-markdown {
          background: var(--color-surface) !important;
          color: var(--color-subtle) !important;
          font-size: 0.875rem !important;
        }
        .wmde-markdown h2 {
          font-size: 1.25rem !important;
          font-weight: 700 !important;
          color: var(--color-foreground) !important;
          margin-top: 2rem !important;
          margin-bottom: 0.75rem !important;
        }
        .wmde-markdown h3 {
          font-size: 1.125rem !important;
          font-weight: 600 !important;
          color: var(--color-foreground) !important;
          margin-top: 1.5rem !important;
          margin-bottom: 0.5rem !important;
        }
        .wmde-markdown p {
          margin-bottom: 1rem !important;
          line-height: 1.625 !important;
        }
        .wmde-markdown a {
          color: var(--color-accent) !important;
          text-decoration: underline !important;
        }
        .wmde-markdown code {
          background: var(--color-surface) !important;
          border: 1px solid var(--color-border) !important;
          padding: 0.125rem 0.375rem !important;
          border-radius: 0.25rem !important;
          font-size: 0.75rem !important;
          color: var(--color-foreground) !important;
        }
        .wmde-markdown pre {
          background: var(--color-surface) !important;
          border: 1px solid var(--color-border) !important;
          padding: 1rem !important;
          border-radius: 0.5rem !important;
          margin: 1rem 0 !important;
        }
        .wmde-markdown blockquote {
          border-left: 4px solid var(--color-accent) !important;
          padding-left: 1rem !important;
          margin: 1rem 0 !important;
          opacity: 0.8 !important;
          font-style: italic !important;
        }
        .wmde-markdown ul,
        .wmde-markdown ol {
          margin-bottom: 1rem !important;
          padding-left: 1.5rem !important;
        }
        .wmde-markdown li {
          margin-bottom: 0.25rem !important;
        }
      `}</style>
    </div>
  )
}
