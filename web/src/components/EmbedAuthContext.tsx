'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

interface EmbedAuth {
  token: string | null
  userId: string | null
  userName: string | null
  isAuthenticated: boolean
  login: () => void
  logout: () => void
}

const EmbedAuthContext = createContext<EmbedAuth>({
  token: null,
  userId: null,
  userName: null,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
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

  // Listen for postMessage from popup auth window
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'uc-embed-auth' && event.data?.token) {
        setToken(event.data.token)
        setUserId(event.data.userId || null)
        setUserName(event.data.userName || null)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const login = useCallback(() => {
    const width = 500
    const height = 600
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2

    window.open(
      `/embed/auth/login?community=${encodeURIComponent(communitySlug)}`,
      'uc-embed-auth',
      `width=${width},height=${height},left=${left},top=${top},popup=true`
    )
  }, [communitySlug])

  const logout = useCallback(() => {
    setToken(null)
    setUserId(null)
    setUserName(null)
  }, [])

  return (
    <EmbedAuthContext.Provider
      value={{
        token,
        userId,
        userName,
        isAuthenticated: !!token,
        login,
        logout,
      }}
    >
      {children}
    </EmbedAuthContext.Provider>
  )
}
