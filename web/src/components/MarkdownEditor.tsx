'use client'

import { useEffect, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: string
}

function ToolbarButton({ active, onClick, disabled, title, children }: {
  active?: boolean
  onClick: () => void
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      disabled={disabled}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded text-xs transition-colors ${
        active
          ? 'bg-accent/20 text-accent'
          : 'text-muted hover:text-foreground hover:bg-surface'
      } disabled:opacity-30`}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null

  const addLink = useCallback(() => {
    const prev = editor.getAttributes('link').href || ''
    const url = window.prompt('URL', prev)
    if (url === null) return
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-surface rounded-t-lg flex-wrap">
      <ToolbarButton
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough"
      >
        <s>S</s>
      </ToolbarButton>

      <div className="w-px h-4 bg-border mx-1" />

      <ToolbarButton
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading 2"
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Heading 3"
      >
        H3
      </ToolbarButton>

      <div className="w-px h-4 bg-border mx-1" />

      <ToolbarButton
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M10 6h11M10 12h11M10 18h11M3 5v2m0 0l1.5-1M3 7l-1 1M4 11H2l2 2-2 2h2" />
        </svg>
      </ToolbarButton>

      <div className="w-px h-4 bg-border mx-1" />

      <ToolbarButton
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Quote"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C9.591 11.69 11 13.19 11 15c0 1.933-1.567 3.5-3.5 3.5-1.172 0-2.292-.527-2.917-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C19.591 11.69 21 13.19 21 15c0 1.933-1.567 3.5-3.5 3.5-1.172 0-2.292-.527-2.917-1.179z" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="Inline code"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="Code block"
      >
        {'</>'}
      </ToolbarButton>

      <div className="w-px h-4 bg-border mx-1" />

      <ToolbarButton
        active={editor.isActive('link')}
        onClick={addLink}
        title="Link"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.556a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.25 8.81" />
        </svg>
      </ToolbarButton>

      <div className="w-px h-4 bg-border mx-1" />

      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal rule"
      >
        ―
      </ToolbarButton>
    </div>
  )
}

export default function MarkdownEditor({ value, onChange, placeholder, minHeight = '300px' }: MarkdownEditorProps) {
  const [mounted, setMounted] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-accent underline' },
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Write your post...',
      }),
      Markdown,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const md = (editor.storage as Record<string, any>).markdown.getMarkdown()
      onChange(md)
    },
    editorProps: {
      attributes: {
        class: 'outline-none prose-editor',
      },
    },
  })

  // Sync external value changes into the editor (e.g. draft restore, reset)
  useEffect(() => {
    if (!editor) return
    const current = (editor.storage as Record<string, any>).markdown.getMarkdown()
    if (value !== current) {
      editor.commands.setContent(value)
    }
  }, [value, editor])

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !editor) {
    return (
      <div
        className="w-full bg-background border border-border rounded-lg p-3"
        style={{ minHeight }}
      >
        <span className="text-xs text-muted">{placeholder || 'Loading editor...'}</span>
      </div>
    )
  }

  return (
    <div>
      <Toolbar editor={editor} />
      <div
        className="border border-t-0 border-border rounded-b-lg bg-background overflow-y-auto px-4 py-3"
        style={{ minHeight }}
      >
        <EditorContent editor={editor} />
      </div>
      <div className="text-xs text-muted mt-2">
        {value.length.toLocaleString()} characters
      </div>
      <style jsx global>{`
        .prose-editor {
          color: var(--color-foreground);
          font-size: 0.875rem;
          line-height: 1.625;
        }
        .prose-editor p {
          margin-bottom: 0.75rem;
        }
        .prose-editor p:last-child {
          margin-bottom: 0;
        }
        .prose-editor h2 {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--color-foreground);
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .prose-editor h3 {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--color-foreground);
          margin-top: 1.25rem;
          margin-bottom: 0.375rem;
        }
        .prose-editor ul,
        .prose-editor ol {
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .prose-editor ul { list-style: disc; }
        .prose-editor ol { list-style: decimal; }
        .prose-editor li { margin-bottom: 0.25rem; }
        .prose-editor li p { margin-bottom: 0.25rem; }
        .prose-editor blockquote {
          border-left: 3px solid var(--color-accent);
          padding-left: 1rem;
          margin: 0.75rem 0;
          color: var(--color-muted);
          font-style: italic;
        }
        .prose-editor code {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          padding: 0.1rem 0.3rem;
          border-radius: 0.25rem;
          font-size: 0.8em;
          font-family: var(--font-mono, monospace);
        }
        .prose-editor pre {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          padding: 0.75rem 1rem;
          border-radius: 0.5rem;
          margin: 0.75rem 0;
          overflow-x: auto;
        }
        .prose-editor pre code {
          background: none;
          border: none;
          padding: 0;
          font-size: 0.8rem;
        }
        .prose-editor a {
          color: var(--color-accent);
          text-decoration: underline;
        }
        .prose-editor hr {
          border: none;
          border-top: 1px solid var(--color-border);
          margin: 1rem 0;
        }
        .prose-editor strong { font-weight: 700; }
        .prose-editor em { font-style: italic; }
        .prose-editor s { text-decoration: line-through; }
        .prose-editor p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: var(--color-muted);
          pointer-events: none;
          float: left;
          height: 0;
        }
        .ProseMirror:focus {
          outline: none;
        }
      `}</style>
    </div>
  )
}
