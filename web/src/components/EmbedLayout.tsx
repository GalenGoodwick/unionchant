'use client'

import { useState, type ReactNode } from 'react'
import { useEmbedAuth } from './EmbedAuthContext'

export default function EmbedLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, userName, login, logout, debugLog } = useEmbedAuth()
  const [showDebug, setShowDebug] = useState(true)

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-border/50 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-accent">Unity Chant</span>
        </div>
        {isAuthenticated ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted truncate max-w-[120px]">{userName}</span>
            <button
              onClick={logout}
              className="text-[10px] text-muted hover:text-foreground transition-colors"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={login}
            className="px-3 py-1 text-xs font-medium rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          >
            Sign In
          </button>
        )}
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="text-[10px] text-muted hover:text-warning transition-colors"
        >
          {showDebug ? 'x' : 'dbg'}
        </button>
      </div>

      {/* Debug Panel */}
      {showDebug && debugLog.length > 0 && (
        <div className="shrink-0 max-h-[200px] overflow-y-auto bg-black/90 text-green-400 p-2 font-mono text-[10px] leading-tight border-b border-green-800/50">
          {debugLog.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-3 py-1.5 border-t border-border/50 text-center">
        <a
          href="https://unionchant.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-muted hover:text-accent transition-colors"
        >
          Powered by Unity Chant
        </a>
      </div>
    </div>
  )
}
