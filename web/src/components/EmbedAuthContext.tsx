'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'

interface EmbedAuth {
  token: string | null
  userId: string | null
  userName: string | null
  isAuthenticated: boolean
  login: () => void
  logout: () => void
  debugLog: string[]
}

const EmbedAuthContext = createContext<EmbedAuth>({
  token: null,
  userId: null,
  userName: null,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
  debugLog: [],
})

export function useEmbedAuth() {
  return useContext(EmbedAuthContext)
}

export function EmbedAuthProvider({
  communitySlug,
  children,
}: {
  communitySlug: string
  children: ReactNode
}) {
  const [token, setToken] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [debugLog, setDebugLog] = useState<string[]>([])
  const logRef = useRef<string[]>([])

  const log = useCallback((msg: string) => {
    const entry = `[${new Date().toISOString().slice(11, 23)}] ${msg}`
    logRef.current = [...logRef.current, entry]
    setDebugLog([...logRef.current])
    console.log('[EmbedAuth]', msg)
  }, [])

  // Log mount info
  useEffect(() => {
    log(`mounted — slug=${communitySlug}`)
    log(`href=${window.location.href}`)
    const url = new URL(window.location.href)
    log(`params: iframeUid=${url.searchParams.get('iframeUid')}, pluginToken=${url.searchParams.get('pluginToken') ? 'YES' : 'no'}, cgToken=${url.searchParams.get('cgToken') ? 'YES' : 'no'}`)
    log(`NEXT_PUBLIC_CG_PLUGIN_PUBLIC_KEY=${process.env.NEXT_PUBLIC_CG_PLUGIN_PUBLIC_KEY ? 'SET (' + process.env.NEXT_PUBLIC_CG_PLUGIN_PUBLIC_KEY.length + ' chars)' : 'NOT SET'}`)
    log(`window.parent === window: ${window.parent === window}`)
    log(`ancestorOrigins: ${window.location.ancestorOrigins ? Array.from(window.location.ancestorOrigins).join(', ') : 'N/A'}`)
  }, [communitySlug, log])

  // Listen for postMessage from popup auth window
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      log(`postMessage from ${event.origin}: type=${event.data?.type}`)
      if (event.data?.type === 'uc-embed-auth' && event.data?.token) {
        log('got uc-embed-auth token from popup')
        setToken(event.data.token)
        setUserId(event.data.userId || null)
        setUserName(event.data.userName || null)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [log])

  // Path A: Auto-exchange pluginToken (or cgToken) from URL query param
  useEffect(() => {
    if (token) return

    const url = new URL(window.location.href)
    const pluginToken = url.searchParams.get('pluginToken') || url.searchParams.get('cgToken')
    if (!pluginToken) return

    log('Path A: exchanging pluginToken/cgToken...')
    fetch('/api/embed/plugin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pluginToken, communitySlug }),
    })
      .then(r => {
        log(`Path A: response ${r.status}`)
        return r.ok ? r.json() : r.text().then(t => { log(`Path A error: ${t}`); return null })
      })
      .then(data => {
        if (data?.token) {
          log(`Path A: got token for ${data.userName}`)
          setToken(data.token)
          setUserId(data.userId || null)
          setUserName(data.userName || null)
        }
      })
      .catch(err => log(`Path A: fetch error: ${err}`))
  }, [communitySlug, token, log])

  // Path B: CG Plugin Library — detect iframeUid param and init CGPluginLib
  useEffect(() => {
    if (token) return

    const url = new URL(window.location.href)
    const iframeUid = url.searchParams.get('iframeUid')
    if (!iframeUid) {
      log('Path B: no iframeUid — skipping CG plugin init')
      return
    }

    log(`Path B: iframeUid=${iframeUid}`)

    const publicKey = process.env.NEXT_PUBLIC_CG_PLUGIN_PUBLIC_KEY
    if (!publicKey) {
      log('Path B: NEXT_PUBLIC_CG_PLUGIN_PUBLIC_KEY NOT SET — aborting')
      return
    }

    log(`Path B: publicKey length=${publicKey.length}`)

    let cancelled = false

    async function initCgPlugin() {
      try {
        log('Path B: importing @common-ground-dao/cg-plugin-lib...')
        const { CgPluginLib } = await import('@common-ground-dao/cg-plugin-lib')
        log('Path B: imported OK, calling initialize...')

        const plugin = await CgPluginLib.initialize(
          iframeUid!,
          '/api/embed/cg/sign',
          publicKey!.replace(/\\n/g, '\n'),
        )

        log('Path B: CGPluginLib initialized OK')
        if (cancelled) { log('Path B: cancelled after init'); return }

        const ctx = plugin.getContextData()
        log(`Path B: contextData — pluginId=${ctx.pluginId}, userId=${ctx.userId}`)

        log('Path B: calling getUserInfo...')
        const userInfo = await plugin.getUserInfo()
        log(`Path B: userInfo — id=${userInfo.data.id}, name=${userInfo.data.name}`)
        log(`Path B: rawResponse length=${userInfo.__rawResponse?.length || 0}`)
        if (cancelled) { log('Path B: cancelled after getUserInfo'); return }

        log('Path B: exchanging for embed token...')
        const res = await fetch('/api/embed/cg/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawResponse: userInfo.__rawResponse,
            communitySlug,
          }),
        })

        if (cancelled) { log('Path B: cancelled after exchange'); return }

        log(`Path B: exchange response ${res.status}`)
        if (res.ok) {
          const data = await res.json()
          if (data?.token) {
            log(`Path B: authenticated as ${data.userName}`)
            setToken(data.token)
            setUserId(data.userId || null)
            setUserName(data.userName || null)
          } else {
            log(`Path B: no token in response: ${JSON.stringify(data)}`)
          }
        } else {
          const errText = await res.text()
          log(`Path B: exchange failed: ${errText}`)
        }
      } catch (err) {
        if (!cancelled) log(`Path B: ERROR: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    initCgPlugin()
    return () => { cancelled = true }
  }, [communitySlug, token, log])

  const login = useCallback(() => {
    log('login popup opening...')
    const width = 500
    const height = 600
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2

    window.open(
      `/embed/auth/login?community=${encodeURIComponent(communitySlug)}`,
      'uc-embed-auth',
      `width=${width},height=${height},left=${left},top=${top},popup=true`
    )
  }, [communitySlug, log])

  const logout = useCallback(() => {
    log('logout')
    setToken(null)
    setUserId(null)
    setUserName(null)
  }, [log])

  return (
    <EmbedAuthContext.Provider
      value={{
        token,
        userId,
        userName,
        isAuthenticated: !!token,
        login,
        logout,
        debugLog,
      }}
    >
      {children}
    </EmbedAuthContext.Provider>
  )
}
