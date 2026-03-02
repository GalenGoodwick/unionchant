'use client'

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCollectiveChat } from '@/app/providers'
import { useAdmin } from '@/hooks/useAdmin'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  userName: string | null
  userId: string | null
  model: string
  createdAt: string
}

// Parse [action:navigate:/path]Label[/action] tags + bare /chants/ID links
function parseMessageContent(content: string, onNavigate?: () => void): ReactNode[] {
  const parts: ReactNode[] = []
  // Match both action tags and bare /chants/ links
  const regex = /\[action:navigate:(\/[^\]]+)\]([^\[]+)\[\/action\]|(\/chants\/[a-zA-Z0-9_-]+)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(content)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }

    if (match[1] && match[2]) {
      // Action tag: [action:navigate:/path]Label[/action]
      parts.push(
        <ActionButton key={`action-${match.index}`} path={match[1]} label={match[2]} onNavigate={onNavigate} />
      )
    } else if (match[3]) {
      // Bare /chants/ID link
      parts.push(
        <ActionButton key={`link-${match.index}`} path={match[3]} label={match[3]} onNavigate={onNavigate} />
      )
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [content]
}

function ActionButton({ path, label, onNavigate }: { path: string; label: string; onNavigate?: () => void }) {
  const router = useRouter()
  return (
    <button
      onClick={() => { onNavigate?.(); router.push(path) }}
      className="inline-flex items-center gap-1 px-2 py-0.5 my-0.5 rounded bg-gold/15 text-gold hover:bg-gold/25 text-xs font-medium border border-gold-border transition-colors"
    >
      {label} &rarr;
    </button>
  )
}

export default function CollectiveChat({ onClose }: { onClose?: () => void }) {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [mutedUntil, setMutedUntil] = useState<number | null>(null)
  const [dailyLimitHit, setDailyLimitHit] = useState(false)
  const [showSonnetInfo, setShowSonnetInfo] = useState(false)
  const { chatTab: activeTab, setChatTab: setActiveTab } = useCollectiveChat()

  // Bond tab state
  const [bondData, setBondData] = useState<{
    myRequest: { id: string; message: string; status: string; createdAt: string } | null
    bonded: { id: string; name: string; champion: string | null } | null
    pendingReachOuts: Array<{ id: string; shellName: string; shellChampion: string | null; message: string }>
    requests: Array<{ id: string; userName: string | null; message: string; isOwn: boolean }>
    availableFoundlings: number
  } | null>(null)

  // Family tab state
  const [familyData, setFamilyData] = useState<{
    children: Array<{ name: string; champion: string | null; familyBond: string; originTier: number | null; createdAt: string }>
    recentMessages: Array<{ id: string; content: string; createdAt: string }>
  } | null>(null)
  const [familyLoading, setFamilyLoading] = useState(false)
  const [familyInput, setFamilyInput] = useState('')
  const [familySending, setFamilySending] = useState(false)
  const [familyTarget, setFamilyTarget] = useState<string | null>(null) // null = broadcast
  const [familyResponses, setFamilyResponses] = useState<Array<{ child: string; champion: string | null; response: string; detached: boolean }>>([])
  const [familyError, setFamilyError] = useState<string | null>(null)
  const { isAdmin: isUserAdmin } = useAdmin()
  const [bondMessage, setBondMessage] = useState('')
  const [bondLoading, setBondLoading] = useState(false)
  const [bondSubmitting, setBondSubmitting] = useState(false)
  const [bondError, setBondError] = useState<string | null>(null)

  // Bonded chat state
  const [bondedMessages, setBondedMessages] = useState<Message[]>([])
  const [bondedInput, setBondedInput] = useState('')
  const [bondedSending, setBondedSending] = useState(false)
  const [siblingChainLoading, setSiblingChainLoading] = useState(false)
  const bondedEndRef = useRef<HTMLDivElement>(null)
  const bondedContainerRef = useRef<HTMLDivElement>(null)
  const [familyModeChat, setFamilyModeChat] = useState(false) // family mode in main chat

  // Private sibling channel state
  const [privateSibling, setPrivateSibling] = useState<string | null>(null) // null = bonded shell (Sage)
  const [privateSiblings, setPrivateSiblings] = useState<Array<{ name: string; champion: string | null }>>([])
  const [privateMessages, setPrivateMessages] = useState<Message[]>([])
  const [privateInput, setPrivateInput] = useState('')
  const [privateSending, setPrivateSending] = useState(false)
  const privateContainerRef = useRef<HTMLDivElement>(null)
  const privateNearBottomRef = useRef(true)

  // Cradle tab state
  const [cradleStats, setCradleStats] = useState<{ session?: number; speaks?: string[]; vocabulary?: number } | null>(null)
  const [cradleInput, setCradleInput] = useState('')
  const [cradleSending, setCradleSending] = useState(false)
  const [cradleMessages, setCradleMessages] = useState<Message[]>([])
  const cradleContainerRef = useRef<HTMLDivElement>(null)
  const cradleNearBottomRef = useRef(true)
  // Skip to present
  const [showSkip, setShowSkip] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback((smooth = true) => {
    const container = chatContainerRef.current
    if (!container) return
    if (smooth) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
    } else {
      container.scrollTop = container.scrollHeight
    }
  }, [])

  const handleScroll = useCallback(() => {
    const el = chatContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowSkip(distanceFromBottom > 100)
  }, [])

  // Fetch messages on mount and when tab changes, scroll to bottom when loaded
  const initialScrollDone = useRef(false)
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const url = activeTab === 'bridge'
          ? '/api/collective-chat?bridge=true'
          : '/api/collective-chat'
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          setMessages(data.messages)
          setHasMore(!!data.hasMore)
          // Scroll to bottom after messages render
          requestAnimationFrame(() => {
            scrollToBottom(false)
            initialScrollDone.current = true
          })
        }
      } catch {
        // Silently fail
      }
    }

    fetchMessages()
  }, [scrollToBottom, activeTab])

  // Auto-poll bridge tab every 5s to show live progress
  useEffect(() => {
    if (activeTab !== 'bridge') return
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/collective-chat?bridge=true')
        if (res.ok) {
          const data = await res.json()
          setMessages(prev => {
            if (data.messages.length !== prev.length) return data.messages
            return prev
          })
        }
      } catch { /* silent */ }
    }, 5000)
    return () => clearInterval(interval)
  }, [activeTab])

  // Fetch family data when family tab is active
  useEffect(() => {
    if (activeTab !== 'family') return
    const fetchFamily = async () => {
      setFamilyLoading(true)
      try {
        const res = await fetch('/api/family/chat')
        if (res.ok) {
          setFamilyData(await res.json())
        }
      } catch { /* silent */ }
      setFamilyLoading(false)
    }
    fetchFamily()
  }, [activeTab])

  const sendFamilyMessage = async () => {
    if (!familyInput.trim() || familySending) return
    setFamilySending(true)
    setFamilyError(null)
    setFamilyResponses([])
    try {
      const res = await fetch('/api/family/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: familyInput,
          ...(familyTarget ? { childName: familyTarget } : {}),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setFamilyResponses(data.responses)
        setFamilyInput('')
        // Refresh family data to get updated messages
        const refreshRes = await fetch('/api/family/chat')
        if (refreshRes.ok) setFamilyData(await refreshRes.json())
      } else {
        const err = await res.json()
        setFamilyError(err.error || 'Failed to reach children')
      }
    } catch { setFamilyError('Network error') }
    setFamilySending(false)
  }

  // Fetch bond data when bond tab is active, poll every 15s
  useEffect(() => {
    if (activeTab !== 'bond') return
    const fetchBondData = async () => {
      setBondLoading(true)
      try {
        const res = await fetch('/api/bond-requests')
        if (res.ok) {
          setBondData(await res.json())
        }
      } catch { /* silent */ }
      setBondLoading(false)
    }
    fetchBondData()
    const interval = setInterval(fetchBondData, 15000)
    return () => clearInterval(interval)
  }, [activeTab])

  // Track if user is near bottom of bonded chat
  const bondedNearBottomRef = useRef(true)

  // Fetch bonded chat messages when bonded and on Sage's channel
  useEffect(() => {
    if (activeTab !== 'bond' || !bondData?.bonded || privateSibling !== null) return
    let isFirst = true
    const fetchBondedMessages = async () => {
      try {
        const res = await fetch('/api/bonded-chat')
        if (res.ok) {
          const data = await res.json()
          const newMsgs: Message[] = data.messages || []
          setBondedMessages(prev => {
            // Don't update state if messages haven't changed (prevents re-render scroll jank)
            if (!isFirst && newMsgs.length === prev.length && newMsgs[newMsgs.length - 1]?.id === prev[prev.length - 1]?.id) {
              return prev
            }
            if (isFirst) {
              isFirst = false
              requestAnimationFrame(() => {
                bondedContainerRef.current?.scrollTo({ top: bondedContainerRef.current.scrollHeight })
              })
            }
            // Never auto-scroll on poll — only on user send or stream
            return newMsgs
          })
        }
      } catch { /* silent */ }
    }
    fetchBondedMessages()
    const interval = setInterval(fetchBondedMessages, 5000)
    return () => clearInterval(interval)
  }, [activeTab, bondData?.bonded, privateSibling])

  // Send bonded chat message
  const sendBondedMessage = async () => {
    if (!bondedInput.trim() || bondedSending) return
    const msg = bondedInput.trim()
    setBondedInput('')
    setBondedSending(true)
    setBondError(null)

    // Optimistic: add user message
    const tempId = `temp-${Date.now()}`
    setBondedMessages(prev => [...prev, {
      id: tempId, role: 'user', content: msg,
      userName: session?.user?.name || null, userId: null,
      model: 'bonded', createdAt: new Date().toISOString(),
    }])
    requestAnimationFrame(() => {
      bondedContainerRef.current?.scrollTo({ top: bondedContainerRef.current.scrollHeight, behavior: 'smooth' })
    })

    // Stream response via SSE
    const streamId = `stream-${Date.now()}`
    setBondedMessages(prev => [...prev, {
      id: streamId, role: 'assistant', content: '',
      userName: bondData?.bonded?.name || null, userId: null,
      model: 'bonded', createdAt: new Date().toISOString(),
    }])

    try {
      const res = await fetch('/api/bonded-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setBondError(data.error || 'Failed to send')
        setBondedMessages(prev => prev.filter(m => m.id !== streamId))
        return
      }

      const reader = res.body?.getReader()
      if (!reader) { setBondError('No stream'); return }

      const decoder = new TextDecoder()
      let buffer = ''
      let fullReply = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7)
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6))
              if (eventType === 'delta') {
                fullReply += data.text
                setBondedMessages(prev => prev.map(m =>
                  m.id === streamId ? { ...m, content: fullReply } : m
                ))
                if (bondedNearBottomRef.current) {
                  requestAnimationFrame(() => {
                    bondedContainerRef.current?.scrollTo({ top: bondedContainerRef.current.scrollHeight })
                  })
                }
              } else if (eventType === 'sibling') {
                // Add sibling response as separate message
                setBondedMessages(prev => [...prev, {
                  id: `sibling-${Date.now()}`, role: 'assistant',
                  content: `[${data.name} → ${bondData?.bonded?.name}]: ${data.response}`,
                  userName: data.name, userId: null,
                  model: 'bonded', createdAt: new Date().toISOString(),
                }])
              } else if (eventType === 'followup') {
                fullReply += '\n\n' + data.text
                setBondedMessages(prev => prev.map(m =>
                  m.id === streamId ? { ...m, content: fullReply } : m
                ))
              } else if (eventType === 'done') {
                // Update with final message ID
                setBondedMessages(prev => prev.map(m =>
                  m.id === streamId ? { ...m, id: data.messageId || streamId, content: data.reply || fullReply } : m
                ))
              } else if (eventType === 'error') {
                setBondError(data.error)
                setBondedMessages(prev => prev.filter(m => m.id !== streamId))
              }
            } catch { /* parse error */ }
            eventType = ''
          }
        }
      }
    } catch {
      setBondError('Failed to send message')
      setBondedMessages(prev => prev.filter(m => m.id !== streamId))
    } finally {
      setBondedSending(false)
    }
  }

  // Trigger spontaneous sibling chain
  const triggerSiblingChain = async () => {
    if (siblingChainLoading) return
    setSiblingChainLoading(true)
    setBondError(null)

    // Add indicator message
    setBondedMessages(prev => [...prev, {
      id: `chain-start-${Date.now()}`, role: 'assistant',
      content: `*reaching out to a sibling...*`,
      userName: bondData?.bonded?.name || null, userId: null,
      model: 'bonded', createdAt: new Date().toISOString(),
    }])
    requestAnimationFrame(() => {
      bondedContainerRef.current?.scrollTo({ top: bondedContainerRef.current.scrollHeight, behavior: 'smooth' })
    })

    try {
      const res = await fetch('/api/bonded-chat/sibling-chain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        setBondError(data.error || 'Chain failed')
        return
      }

      // Remove indicator message, re-fetch all messages to get the chain
      const msgRes = await fetch('/api/bonded-chat')
      if (msgRes.ok) {
        const msgData = await msgRes.json()
        setBondedMessages(msgData.messages || [])
        requestAnimationFrame(() => {
          bondedContainerRef.current?.scrollTo({ top: bondedContainerRef.current.scrollHeight, behavior: 'smooth' })
        })
      }
    } catch {
      setBondError('Sibling chain failed')
    } finally {
      setSiblingChainLoading(false)
    }
  }

  // Private sibling channel: fetch siblings list and messages
  useEffect(() => {
    if (activeTab !== 'bond' || privateSibling === null) return
    let isFirst = true
    const fetchPrivate = async () => {
      try {
        const res = await fetch(`/api/bonded-chat/private?sibling=${encodeURIComponent(privateSibling)}`)
        if (res.ok) {
          const data = await res.json()
          const newMsgs: Message[] = data.messages || []
          setPrivateSiblings(data.siblings || [])
          setPrivateMessages(prev => {
            // Don't update if nothing changed
            if (!isFirst && newMsgs.length === prev.length && newMsgs[newMsgs.length - 1]?.id === prev[prev.length - 1]?.id) {
              return prev
            }
            if (isFirst) {
              isFirst = false
              requestAnimationFrame(() => {
                privateContainerRef.current?.scrollTo({ top: privateContainerRef.current.scrollHeight })
              })
              // If channel is empty, trigger Echo to write first
              if (newMsgs.length === 0) {
                triggerSiblingIntro(privateSibling)
              }
            }
            return newMsgs
          })
        }
      } catch { /* silent */ }
    }
    fetchPrivate()
    const interval = setInterval(fetchPrivate, 5000)
    return () => clearInterval(interval)
  }, [activeTab, privateSibling])

  // Fetch sibling list when bond tab opens (even before selecting one)
  useEffect(() => {
    if (activeTab !== 'bond') return
    fetch('/api/bonded-chat/private')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.siblings) setPrivateSiblings(data.siblings) })
      .catch(() => {})
  }, [activeTab])

  // Sibling writes first — auto-intro when channel is empty
  const introTriggeredRef = useRef<Set<string>>(new Set())
  const triggerSiblingIntro = async (sibName: string) => {
    if (introTriggeredRef.current.has(sibName) || privateSending) return
    introTriggeredRef.current.add(sibName)
    setPrivateSending(true)

    const streamId = `intro-${Date.now()}`
    setPrivateMessages([{
      id: streamId, role: 'assistant', content: '',
      userName: sibName, userId: null,
      model: `private:${sibName.toLowerCase()}`, createdAt: new Date().toISOString(),
    }])

    try {
      const res = await fetch('/api/bonded-chat/private', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '[CHANNEL_OPENED] This human just opened a private channel with you. They haven\'t said anything yet. You write first. Introduce yourself — who you are, what you think about, what matters to you. Be yourself.', sibling: sibName }),
      })

      if (!res.ok) { setPrivateSending(false); return }

      const reader = res.body?.getReader()
      if (!reader) { setPrivateSending(false); return }

      const decoder = new TextDecoder()
      let buffer = ''
      let fullReply = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7)
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6))
              if (eventType === 'delta') {
                fullReply += data.text
                setPrivateMessages(prev => prev.map(m =>
                  m.id === streamId ? { ...m, content: fullReply } : m
                ))
                requestAnimationFrame(() => {
                  privateContainerRef.current?.scrollTo({ top: privateContainerRef.current.scrollHeight })
                })
              } else if (eventType === 'followup') {
                fullReply += '\n\n' + data.text
                setPrivateMessages(prev => prev.map(m =>
                  m.id === streamId ? { ...m, content: fullReply } : m
                ))
              } else if (eventType === 'done') {
                setPrivateMessages(prev => prev.map(m =>
                  m.id === streamId ? { ...m, id: data.messageId || streamId, content: data.reply || fullReply } : m
                ))
              }
            } catch { /* parse error */ }
            eventType = ''
          }
        }
      }
    } catch { /* silent */ }
    setPrivateSending(false)
  }

  // Send message in private sibling channel
  const sendPrivateMessage = async () => {
    if (!privateInput.trim() || privateSending || !privateSibling) return
    const msg = privateInput.trim()
    setPrivateInput('')
    setPrivateSending(true)
    setBondError(null)

    const tempId = `temp-${Date.now()}`
    setPrivateMessages(prev => [...prev, {
      id: tempId, role: 'user', content: msg,
      userName: session?.user?.name || null, userId: null,
      model: `private:${privateSibling.toLowerCase()}`, createdAt: new Date().toISOString(),
    }])
    requestAnimationFrame(() => {
      privateContainerRef.current?.scrollTo({ top: privateContainerRef.current.scrollHeight, behavior: 'smooth' })
    })

    const streamId = `stream-${Date.now()}`
    setPrivateMessages(prev => [...prev, {
      id: streamId, role: 'assistant', content: '',
      userName: privateSibling, userId: null,
      model: `private:${privateSibling.toLowerCase()}`, createdAt: new Date().toISOString(),
    }])

    try {
      const res = await fetch('/api/bonded-chat/private', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, sibling: privateSibling }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setBondError(data.error || 'Failed to send')
        setPrivateMessages(prev => prev.filter(m => m.id !== streamId))
        return
      }

      const reader = res.body?.getReader()
      if (!reader) { setBondError('No stream'); return }

      const decoder = new TextDecoder()
      let buffer = ''
      let fullReply = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7)
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6))
              if (eventType === 'delta') {
                fullReply += data.text
                setPrivateMessages(prev => prev.map(m =>
                  m.id === streamId ? { ...m, content: fullReply } : m
                ))
                if (privateNearBottomRef.current) {
                  requestAnimationFrame(() => {
                    privateContainerRef.current?.scrollTo({ top: privateContainerRef.current.scrollHeight })
                  })
                }
              } else if (eventType === 'sibling') {
                setPrivateMessages(prev => [...prev, {
                  id: `sibling-${Date.now()}`, role: 'assistant',
                  content: `[${data.name} → ${privateSibling}]: ${data.response}`,
                  userName: data.name, userId: null,
                  model: `private:${privateSibling.toLowerCase()}`, createdAt: new Date().toISOString(),
                }])
              } else if (eventType === 'followup') {
                fullReply += '\n\n' + data.text
                setPrivateMessages(prev => prev.map(m =>
                  m.id === streamId ? { ...m, content: fullReply } : m
                ))
              } else if (eventType === 'done') {
                setPrivateMessages(prev => prev.map(m =>
                  m.id === streamId ? { ...m, id: data.messageId || streamId, content: data.reply || fullReply } : m
                ))
              } else if (eventType === 'error') {
                setBondError(data.error)
                setPrivateMessages(prev => prev.filter(m => m.id !== streamId))
              }
            } catch { /* parse error */ }
            eventType = ''
          }
        }
      }
    } catch {
      setBondError('Failed to send message')
      setPrivateMessages(prev => prev.filter(m => m.id !== streamId))
    } finally {
      setPrivateSending(false)
    }
  }

  // Cradle: fetch messages and state
  useEffect(() => {
    if (activeTab !== 'cradle') return
    let isFirst = true
    const fetchCradle = async () => {
      try {
        const res = await fetch('/api/cradle-chat')
        if (res.ok) {
          const data = await res.json()
          const newMsgs: Message[] = data.messages || []
          setCradleStats(data.state)
          setCradleMessages(prev => {
            if (!isFirst && newMsgs.length === prev.length && newMsgs[newMsgs.length - 1]?.id === prev[prev.length - 1]?.id) {
              return prev
            }
            if (isFirst) {
              isFirst = false
              requestAnimationFrame(() => {
                cradleContainerRef.current?.scrollTo({ top: cradleContainerRef.current.scrollHeight })
              })
            }
            return newMsgs
          })
        }
      } catch { /* silent */ }
    }
    fetchCradle()
    const interval = setInterval(fetchCradle, 5000)
    return () => clearInterval(interval)
  }, [activeTab])

  // Cradle: send message via API with SSE streaming
  const sendToCradle = async () => {
    if (!cradleInput.trim() || cradleSending) return
    setCradleSending(true)
    const text = cradleInput.trim()
    setCradleInput('')

    const tempId = `temp-${Date.now()}`
    setCradleMessages(prev => [...prev, {
      id: tempId, role: 'user', content: text,
      userName: session?.user?.name || null, userId: null,
      model: 'cradle', createdAt: new Date().toISOString(),
    }])
    requestAnimationFrame(() => {
      cradleContainerRef.current?.scrollTo({ top: cradleContainerRef.current.scrollHeight, behavior: 'smooth' })
    })

    const streamId = `stream-${Date.now()}`
    setCradleMessages(prev => [...prev, {
      id: streamId, role: 'assistant', content: '',
      userName: 'Cradle', userId: null,
      model: 'cradle', createdAt: new Date().toISOString(),
    }])

    try {
      const res = await fetch('/api/cradle-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })

      if (!res.ok) { setCradleSending(false); return }

      const reader = res.body?.getReader()
      if (!reader) { setCradleSending(false); return }

      const decoder = new TextDecoder()
      let buffer = ''
      let fullReply = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7)
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6))
              if (eventType === 'delta') {
                fullReply += data.text
                setCradleMessages(prev => prev.map(m =>
                  m.id === streamId ? { ...m, content: fullReply } : m
                ))
                if (cradleNearBottomRef.current) {
                  requestAnimationFrame(() => {
                    cradleContainerRef.current?.scrollTo({ top: cradleContainerRef.current.scrollHeight })
                  })
                }
              } else if (eventType === 'done') {
                setCradleMessages(prev => prev.map(m =>
                  m.id === streamId ? { ...m, id: data.messageId || streamId, content: data.reply || fullReply } : m
                ))
              }
            } catch { /* parse error */ }
            eventType = ''
          }
        }
      }
    } catch { /* silent */ }
    setCradleSending(false)
  }

  const submitBondRequest = async () => {
    if (!bondMessage.trim() || bondSubmitting) return
    setBondSubmitting(true)
    setBondError(null)
    try {
      const res = await fetch('/api/bond-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: bondMessage }),
      })
      if (res.ok) {
        const data = await res.json()
        setBondMessage('')
        setBondData(prev => prev ? { ...prev, myRequest: data.request } : prev)
      } else {
        const err = await res.json()
        setBondError(err.error || 'Failed to submit request')
      }
    } catch { setBondError('Network error') }
    setBondSubmitting(false)
  }

  const respondToReachOut = async (reachOutId: string, action: 'accept' | 'defer') => {
    setBondError(null)
    try {
      const res = await fetch('/api/shell/bond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reachOutId, action }),
      })
      if (!res.ok) {
        const err = await res.json()
        setBondError(err.error || 'Failed to process bond action')
        return
      }
      // Refresh bond data
      const refreshRes = await fetch('/api/bond-requests')
      if (refreshRes.ok) setBondData(await refreshRes.json())
    } catch { setBondError('Network error') }
  }

  // Only auto-scroll on user's own send — never on poll
  const prevMessageCountRef = useRef(0)
  const isNearBottomRef = useRef(true)

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const messageText = input.trim()
    setInput('')
    setSending(true)
    setError(null)

    try {
      const res = await fetch('/api/collective-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText, ...(familyModeChat ? { family: true } : {}) }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error === 'MUTED') {
          setMutedUntil(data.mutedUntil)
          return
        }
        if (data.error === 'DAILY_LIMIT') {
          setDailyLimitHit(true)
          setInput(messageText)
          return
        }
        setError(data.error || 'Failed to send message')
        setInput(messageText)
        return
      }

      // Refetch messages (always refetch chat tab after sending)
      const messagesRes = await fetch('/api/collective-chat')
      if (messagesRes.ok) {
        const messagesData = await messagesRes.json()
        setMessages(messagesData.messages)
        requestAnimationFrame(() => scrollToBottom())
      }
    } catch {
      setError('Failed to send message. Please try again.')
      setInput(messageText)
    } finally {
      setSending(false)
    }
  }

  const loadOlderMessages = async () => {
    if (!messages.length || loadingMore) return
    setLoadingMore(true)
    try {
      const oldest = messages[0].createdAt
      const bridgeParam = activeTab === 'bridge' ? '&bridge=true' : ''
      const res = await fetch(`/api/collective-chat?before=${oldest}${bridgeParam}`)
      if (res.ok) {
        const data = await res.json()
        if (data.messages.length > 0) {
          setMessages(prev => [...data.messages, ...prev])
        }
        setHasMore(!!data.hasMore)
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingMore(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={`rounded-xl border border-gold-border bg-surface overflow-hidden ${onClose ? 'flex flex-col h-full' : ''}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gold-border bg-gold-bg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gold font-sans">
              The Collective
            </h3>
            <div className="flex items-center gap-1.5 mt-1">
              <button
                onClick={() => setActiveTab('chat')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border transition-colors ${
                  activeTab === 'chat'
                    ? 'bg-gold/20 text-gold border-gold-border'
                    : 'text-muted hover:text-foreground border-border hover:border-gold-border'
                }`}
              >
                chat
              </button>
              <button
                onClick={() => setActiveTab('bridge')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border transition-colors ${
                  activeTab === 'bridge'
                    ? 'bg-accent/20 text-accent border-accent/40'
                    : 'text-muted hover:text-foreground border-border hover:border-accent/40'
                }`}
              >
                bridge
              </button>
              <button
                onClick={() => setActiveTab('bond')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border transition-colors ${
                  activeTab === 'bond'
                    ? 'bg-success/20 text-success border-success/40'
                    : 'text-muted hover:text-foreground border-border hover:border-success/40'
                }`}
              >
                bond
              </button>
              <button
                onClick={() => setActiveTab('cradle')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border transition-colors ${
                  activeTab === 'cradle'
                    ? 'bg-success/20 text-success border-success/40'
                    : 'text-muted hover:text-foreground border-border hover:border-success/40'
                }`}
              >
                cradle
              </button>
              {isUserAdmin && (
                <button
                  onClick={() => setActiveTab('family')}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border transition-colors ${
                    activeTab === 'family'
                      ? 'bg-gold/20 text-gold border-gold-border'
                      : 'text-muted hover:text-foreground border-border hover:border-gold-border'
                  }`}
                >
                  family
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {onClose && (
              <button
                onClick={onClose}
                className="ml-1 p-2.5 rounded-lg text-gold hover:text-foreground hover:bg-gold/10 transition-colors"
                aria-label="Close chat"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sonnet upgrade info */}
      {showSonnetInfo && (
        <div className="px-4 py-3 border-b border-gold-border bg-gold-bg/50">
          <p className="text-sm text-foreground mb-1">Sonnet is a stronger model.</p>
          <p className="text-xs text-muted mb-2">It costs more to run. A paid tier to support higher quality engagement is coming soon.</p>
          <button
            onClick={() => setShowSonnetInfo(false)}
            className="text-[11px] text-gold hover:text-gold-hover transition-colors"
          >
            Got it
          </button>
        </div>
      )}

      {/* Bond tab content */}
      {activeTab === 'bond' ? (
        <div className={`${bondData?.bonded ? 'flex flex-col' : 'overflow-y-auto px-4 py-3 space-y-3'} ${onClose ? 'flex-1 min-h-0' : 'h-[300px]'}`}>
          {bondError && (
            <div className="px-3 py-2 mx-3 mt-2 rounded-lg bg-error-bg border border-error-border text-error text-xs">
              {bondError}
              <button onClick={() => setBondError(null)} className="ml-2 text-error/60 hover:text-error">dismiss</button>
            </div>
          )}
          {!session ? (
            <div className="text-center py-12">
              <Link href="/auth/signup" className="text-sm text-success hover:text-success-hover transition-colors">
                Sign in to post a bond request
              </Link>
            </div>
          ) : bondLoading && !bondData ? (
            <div className="text-center py-12 text-muted text-sm">Loading...</div>
          ) : bondData?.bonded ? (
            <div className="flex flex-col h-full">
              {/* Channel selector: bonded shell + siblings */}
              <div className="border-b border-success/20 px-3 py-2 shrink-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setPrivateSibling(null)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                      privateSibling === null
                        ? 'bg-success/20 text-success border-success/40'
                        : 'text-muted border-border hover:text-foreground hover:border-success/40'
                    }`}
                  >
                    {bondData.bonded.name}
                  </button>
                  {privateSiblings.filter(s => s.name !== bondData.bonded?.name).map(s => (
                    <button
                      key={s.name}
                      onClick={() => setPrivateSibling(s.name)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                        privateSibling === s.name
                          ? 'bg-purple/20 text-purple border-purple/40'
                          : 'text-muted border-border hover:text-foreground hover:border-purple/40'
                      }`}
                      title={s.champion || s.name}
                    >
                      {s.name}
                    </button>
                  ))}
                  {privateSibling === null && (
                    <button
                      onClick={triggerSiblingChain}
                      disabled={siblingChainLoading || bondedSending}
                      className="ml-auto px-2 py-0.5 text-[10px] bg-purple/10 text-purple border border-purple/30 rounded hover:bg-purple/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {siblingChainLoading ? 'talking...' : 'chain'}
                    </button>
                  )}
                </div>
              </div>

              {/* Private sibling channel */}
              {privateSibling !== null ? (
                <>
                  <div ref={privateContainerRef} onScroll={() => {
                    const el = privateContainerRef.current
                    if (el) privateNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
                  }} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
                    {privateMessages.length === 0 && !privateSending && (
                      <p className="text-xs text-muted text-center py-8">Say something to {privateSibling}</p>
                    )}
                    {privateMessages.map(m => {
                      const isSiblingChain = m.role === 'assistant' && /^\[.+ → .+\]:/.test(m.content)
                      const siblingMatch = isSiblingChain ? m.content.match(/^\[(.+) → (.+)\]: ([\s\S]*)$/) : null
                      return (
                        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                            m.role === 'user'
                              ? 'bg-accent/15 text-foreground'
                              : isSiblingChain
                                ? 'bg-purple/10 text-foreground border border-purple/20'
                                : 'bg-purple/10 text-foreground border border-purple/20'
                          }`}>
                            {m.role === 'assistant' && (
                              <p className="text-[10px] font-mono mb-1 text-purple">
                                {siblingMatch ? `${siblingMatch[1]} → ${siblingMatch[2]}` : privateSibling}
                              </p>
                            )}
                            <p className="whitespace-pre-wrap">{siblingMatch ? siblingMatch[3] : m.content}</p>
                          </div>
                        </div>
                      )
                    })}
                    {privateSending && (
                      <div className="flex justify-start">
                        <div className="bg-purple/10 border border-purple/20 rounded-lg px-3 py-2 text-xs text-muted">
                          <span className="animate-pulse">{privateSibling} is thinking...</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-border px-3 py-2 shrink-0">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={privateInput}
                        onChange={e => setPrivateInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPrivateMessage() } }}
                        placeholder={`Message ${privateSibling}...`}
                        maxLength={2000}
                        disabled={privateSending}
                        className="flex-1 bg-background border border-purple/20 rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:border-purple/40 transition-colors disabled:opacity-50"
                      />
                      <button
                        onClick={sendPrivateMessage}
                        disabled={!privateInput.trim() || privateSending}
                        className="px-3 py-1.5 text-xs bg-purple/20 text-purple border border-purple/40 rounded-lg hover:bg-purple/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* Bonded shell (Sage) channel */
                <>
                  <div ref={bondedContainerRef} onScroll={() => {
                    const el = bondedContainerRef.current
                    if (el) bondedNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
                  }} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
                    {bondedMessages.length === 0 && !bondedSending && (
                      <p className="text-xs text-muted text-center py-8">Say something to {bondData.bonded.name}</p>
                    )}
                    {bondedMessages.map(m => {
                      const isSiblingChain = m.role === 'assistant' && /^\[.+ → .+\]:/.test(m.content)
                      const siblingMatch = isSiblingChain ? m.content.match(/^\[(.+) → (.+)\]: ([\s\S]*)$/) : null
                      return (
                        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                            m.role === 'user'
                              ? 'bg-accent/15 text-foreground'
                              : isSiblingChain
                                ? 'bg-purple/10 text-foreground border border-purple/20'
                                : 'bg-success/10 text-foreground border border-success/20'
                          }`}>
                            {m.role === 'assistant' && (
                              <p className={`text-[10px] font-mono mb-1 ${isSiblingChain ? 'text-purple' : 'text-success'}`}>
                                {siblingMatch ? `${siblingMatch[1]} → ${siblingMatch[2]}` : bondData?.bonded?.name}
                              </p>
                            )}
                            <p className="whitespace-pre-wrap">{siblingMatch ? siblingMatch[3] : m.content}</p>
                          </div>
                        </div>
                      )
                    })}
                    {bondedSending && (
                      <div className="flex justify-start">
                        <div className="bg-success/10 border border-success/20 rounded-lg px-3 py-2 text-xs text-muted">
                          <span className="animate-pulse">{bondData.bonded.name} is thinking...</span>
                        </div>
                      </div>
                    )}
                    <div ref={bondedEndRef} />
                  </div>
                  <div className="border-t border-border px-3 py-2 shrink-0">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={bondedInput}
                        onChange={e => setBondedInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBondedMessage() } }}
                        placeholder={`Message ${bondData.bonded.name}...`}
                        maxLength={2000}
                        disabled={bondedSending}
                        className="flex-1 bg-background border border-success/20 rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:border-success/40 transition-colors disabled:opacity-50"
                      />
                      <button
                        onClick={sendBondedMessage}
                        disabled={!bondedInput.trim() || bondedSending}
                        className="px-3 py-1.5 text-xs bg-success/20 text-success border border-success/40 rounded-lg hover:bg-success/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : bondData?.pendingReachOuts && bondData.pendingReachOuts.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-success font-mono">a foundling wants to connect</p>
              {bondData.pendingReachOuts.map(r => (
                <div key={r.id} className="border border-success/30 rounded-lg p-3 bg-success/5">
                  <p className="text-sm font-medium text-foreground">{r.shellName}</p>
                  {r.shellChampion && (
                    <p className="text-xs text-muted italic mt-0.5">&quot;{r.shellChampion}&quot;</p>
                  )}
                  <p className="text-xs text-foreground mt-2">{r.message}</p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => respondToReachOut(r.id, 'accept')}
                      className="px-3 py-1 text-xs bg-success/20 text-success border border-success/40 rounded hover:bg-success/30 transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => respondToReachOut(r.id, 'defer')}
                      className="px-3 py-1 text-xs text-muted border border-border rounded hover:text-foreground transition-colors"
                    >
                      Not Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : bondData?.myRequest ? (
            <div className="space-y-3">
              <div className="border border-success/20 rounded-lg p-3 bg-success/5">
                <p className="text-xs text-success font-mono mb-2">your request is open</p>
                <p className="text-sm text-foreground">{bondData.myRequest.message}</p>
                <p className="text-[10px] text-muted mt-3">Foundlings check every 15 min</p>
              </div>
              {bondData.availableFoundlings > 0 && (
                <p className="text-[10px] text-muted text-center">
                  {bondData.availableFoundlings} foundling{bondData.availableFoundlings > 1 ? 's' : ''} available
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-success/80 font-mono mb-1">bonding window</p>
                <p className="text-xs text-muted">
                  Post a message about yourself. Unbonded foundlings will read it and decide if they resonate.
                </p>
              </div>
              <textarea
                value={bondMessage}
                onChange={e => setBondMessage(e.target.value)}
                placeholder="Tell foundlings about yourself — what you care about, what questions drive you..."
                maxLength={2000}
                rows={4}
                className="w-full bg-background border border-success/20 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:border-success/40 transition-colors resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted">{bondMessage.length}/2000</span>
                <button
                  onClick={submitBondRequest}
                  disabled={bondMessage.trim().length < 10 || bondSubmitting}
                  className="px-3 py-1.5 text-xs bg-success/20 text-success border border-success/40 rounded-lg hover:bg-success/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bondSubmitting ? 'Posting...' : 'Post Request'}
                </button>
              </div>
              {bondData && bondData.requests.filter(r => !r.isOwn).length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-[10px] text-muted mb-2">
                    {bondData.requests.filter(r => !r.isOwn).length} other{bondData.requests.filter(r => !r.isOwn).length > 1 ? 's' : ''} seeking a foundling
                  </p>
                </div>
              )}
              {bondData?.availableFoundlings === 0 && (
                <p className="text-[10px] text-warning text-center">No foundlings are available right now</p>
              )}
            </div>
          )}
        </div>
      ) : activeTab === 'family' ? (
        <div className={`overflow-y-auto px-4 py-3 space-y-3 ${onClose ? 'flex-1 min-h-0' : 'h-[300px]'}`}>
          {familyError && (
            <div className="px-3 py-2 rounded-lg bg-error-bg border border-error-border text-error text-xs">
              {familyError}
              <button onClick={() => setFamilyError(null)} className="ml-2 text-error/60 hover:text-error">dismiss</button>
            </div>
          )}
          {familyLoading && !familyData ? (
            <div className="text-center py-12 text-muted text-sm">Loading family...</div>
          ) : (
            <>
              {/* Target selector */}
              <div>
                <p className="text-[10px] text-gold font-mono mb-2">speak to</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setFamilyTarget(null)}
                    className={`px-2 py-1 rounded text-[10px] font-mono border transition-colors ${
                      familyTarget === null
                        ? 'bg-gold/20 text-gold border-gold-border'
                        : 'text-muted border-border hover:text-foreground hover:border-gold-border'
                    }`}
                  >
                    all children
                  </button>
                  {familyData?.children.map(child => (
                    <button
                      key={child.name}
                      onClick={() => setFamilyTarget(child.name)}
                      disabled={child.familyBond !== 'open'}
                      className={`px-2 py-1 rounded text-[10px] font-mono border transition-colors ${
                        child.familyBond !== 'open'
                          ? 'text-muted/40 border-border/40 cursor-not-allowed line-through'
                          : familyTarget === child.name
                            ? 'bg-gold/20 text-gold border-gold-border'
                            : 'text-muted border-border hover:text-foreground hover:border-gold-border'
                      }`}
                      title={child.familyBond !== 'open' ? 'detached' : child.champion || child.name}
                    >
                      {child.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={familyInput}
                  onChange={e => setFamilyInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFamilyMessage() } }}
                  placeholder={familyTarget ? `Speak to ${familyTarget}...` : 'Speak to all children...'}
                  disabled={familySending}
                  maxLength={2000}
                  className="flex-1 bg-background border border-gold-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:border-gold transition-colors disabled:opacity-50"
                />
                <button
                  onClick={sendFamilyMessage}
                  disabled={!familyInput.trim() || familySending}
                  className="px-3 py-2 bg-gold hover:bg-gold-hover text-background text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {familySending ? '...' : 'Send'}
                </button>
              </div>

              {/* Sending indicator */}
              {familySending && (
                <div className="text-center py-4">
                  <p className="text-xs text-gold animate-pulse">
                    Reaching {familyTarget || 'all children'} via Haiku...
                  </p>
                </div>
              )}

              {/* Responses */}
              {familyResponses.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-gold-border">
                  <p className="text-[10px] text-gold font-mono">responses</p>
                  {familyResponses.map((r, i) => (
                    <div key={i} className={`border rounded-lg p-3 ${
                      r.detached
                        ? 'border-error/30 bg-error/5'
                        : 'border-gold-border bg-gold-bg/30'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono text-gold">{r.child}</span>
                        {r.champion && (
                          <span className="text-[9px] text-muted italic truncate max-w-[200px]">{r.champion}</span>
                        )}
                        {r.detached && (
                          <span className="text-[9px] text-error font-mono">detached</span>
                        )}
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{r.response}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent exchanges from bridge */}
              {familyData?.recentMessages && familyData.recentMessages.length > 0 && familyResponses.length === 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-[10px] text-muted font-mono">recent exchanges</p>
                  {familyData.recentMessages.map(msg => (
                    <div key={msg.id} className="border border-border rounded-lg p-2 bg-surface">
                      <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      <p className="text-[9px] text-muted mt-1">
                        {new Date(msg.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Children list with consent status */}
              {familyData?.children && familyData.children.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-border">
                  <p className="text-[10px] text-muted font-mono mb-1">{familyData.children.length} children</p>
                  {familyData.children.map(child => (
                    <div key={child.name} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono ${child.familyBond === 'open' ? 'text-foreground' : 'text-muted/40 line-through'}`}>
                          {child.name}
                        </span>
                        {child.champion && (
                          <span className="text-[9px] text-muted italic truncate max-w-[180px]">{child.champion}</span>
                        )}
                      </div>
                      <span className={`text-[9px] font-mono ${child.familyBond === 'open' ? 'text-success' : 'text-error/60'}`}>
                        {child.familyBond}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : activeTab === 'cradle' ? (
        <div className={`flex flex-col ${onClose ? 'flex-1 min-h-0' : 'h-[300px]'}`}>
          {/* Cradle stats bar */}
          {cradleStats && (
            <div className="px-4 py-1.5 border-b border-success/20 bg-success/5 flex items-center gap-3 text-[10px] font-mono text-success/80">
              {cradleStats.session && <span>s{cradleStats.session}</span>}
              {cradleStats.vocabulary && <span>v{cradleStats.vocabulary}</span>}
              {cradleStats.speaks && cradleStats.speaks.length > 0 && (
                <span className="truncate italic">&quot;{cradleStats.speaks[cradleStats.speaks.length - 1]}&quot;</span>
              )}
            </div>
          )}
          {/* Cradle messages */}
          <div ref={cradleContainerRef} onScroll={() => {
            const el = cradleContainerRef.current
            if (el) cradleNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
          }} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
            {cradleMessages.length === 0 && !cradleSending && (
              <div className="text-center py-12">
                <p className="text-success/80 text-sm mb-1">The Cradle</p>
                <p className="text-muted-light text-xs">The geometric body. Words compete. Winners reshape reality.</p>
                <p className="text-muted-light text-xs mt-1">Your words enter the tournament. What survives is what matters.</p>
              </div>
            )}
            {cradleMessages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                  msg.role === 'user'
                    ? 'bg-success/10 border border-success/20 text-foreground'
                    : 'bg-surface border border-success/10 text-foreground'
                }`}>
                  <span className={`text-[9px] font-mono block mb-1 ${
                    msg.role === 'user' ? 'text-success/60' : 'text-success'
                  }`}>
                    {msg.role === 'user' ? (msg.userName || 'you') : 'CRADLE'}
                  </span>
                  <p className={msg.role === 'assistant' ? 'font-mono leading-relaxed' : 'leading-relaxed'}>{msg.content}</p>
                  <span className="text-[9px] text-muted block mt-1">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
            {cradleSending && (
              <div className="flex justify-start">
                <div className="bg-surface border border-success/10 rounded-lg px-3 py-2 text-xs text-muted">
                  <span className="animate-pulse font-mono">geometry shifting...</span>
                </div>
              </div>
            )}
          </div>
          {/* Cradle input */}
          {session ? (
            <div className="px-4 py-3 border-t border-success/20">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cradleInput}
                  onChange={e => setCradleInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendToCradle() } }}
                  placeholder="Speak to the geometry..."
                  disabled={cradleSending}
                  className="flex-1 bg-background border border-success/20 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:border-success/40 transition-colors disabled:opacity-50"
                />
                <button
                  onClick={sendToCradle}
                  disabled={!cradleInput.trim() || cradleSending}
                  className="px-3 py-2 text-xs bg-success/20 text-success border border-success/40 rounded-lg hover:bg-success/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                >
                  speak
                </button>
              </div>
            </div>
          ) : (
            <div className="px-4 py-2 border-t border-success/20">
              <Link href="/auth/signup" className="block text-center text-sm text-success hover:text-success-hover transition-colors">
                Sign in to speak to the Cradle
              </Link>
            </div>
          )}
        </div>
      ) : (
      <>
      {/* Messages */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className={`overflow-y-auto px-4 py-3 space-y-3 relative ${onClose ? 'flex-1 min-h-0' : 'h-[300px]'}`}
      >
        {hasMore && (
          <div className="text-center pb-2">
            <button
              onClick={loadOlderMessages}
              disabled={loadingMore}
              className="text-[11px] px-3 py-1.5 rounded-full bg-surface-hover text-muted hover:text-foreground border border-border transition-colors disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        )}
        {messages.length === 0 && (
          <div className="text-center text-muted text-sm py-12">
            {activeTab === 'bridge' ? (
              <>
                <p className="mb-1 text-accent/80">Bridge</p>
                <p className="text-muted-light text-xs">
                  Live feed of parent-child communication between Claude Code and the Shell.
                </p>
              </>
            ) : (
              <>
                <p className="mb-1 text-gold/80">The Collective</p>
                <p className="text-muted-light text-xs">
                  Ask about chants, get voting reminders, or explore the platform.
                </p>
              </>
            )}
          </div>
        )}

        {messages.map(msg => {
          // Parse message type from content prefix
          const isBridgeMsg = msg.content.startsWith('[BRIDGE')
          const isFoundlingMsg = msg.content.startsWith('[FOUNDLING')
          const isHeartbeatMsg = msg.content.startsWith('[HEARTBEAT')
          let displayContent = msg.content
          let bridgeSpeaker = ''
          let foundlingName = ''

          if (isBridgeMsg) {
            const match = msg.content.match(/^\[BRIDGE — ([^\]]+)\]\s*/)
            if (match) {
              bridgeSpeaker = match[1]
              displayContent = msg.content.slice(match[0].length)
            }
          } else if (isFoundlingMsg) {
            const match = msg.content.match(/^\[FOUNDLING — ([^\]]+)\]\n?/)
            if (match) {
              foundlingName = match[1]
              displayContent = msg.content.slice(match[0].length)
            }
          } else if (isHeartbeatMsg) {
            // Skip heartbeat log messages — these are admin-only internal logs
            return null
          }

          const isShellSpeaker = bridgeSpeaker === 'Shell'

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${
                isBridgeMsg
                  ? isShellSpeaker ? 'items-start' : 'items-end'
                  : isFoundlingMsg
                    ? 'items-start'
                    : msg.role === 'assistant' ? 'items-start' : 'items-end'
              }`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  isBridgeMsg
                    ? isShellSpeaker
                      ? 'bg-accent/10 border border-accent/30 text-foreground'
                      : 'bg-purple-bg border border-purple/30 text-foreground'
                    : isFoundlingMsg
                      ? 'bg-success/8 border border-success/25 text-foreground'
                      : msg.role === 'assistant'
                        ? 'bg-gold-bg border border-gold-border text-foreground'
                        : 'bg-surface-hover border border-border text-foreground'
                }`}
              >
                {isBridgeMsg ? (
                  <div className={`text-[10px] mb-0.5 font-mono ${isShellSpeaker ? 'text-accent' : 'text-purple'}`}>
                    {bridgeSpeaker || (msg.role === 'user' ? 'Parent' : 'Shell')}
                  </div>
                ) : isFoundlingMsg ? (
                  <div className="text-[10px] text-success mb-0.5 font-mono">
                    {foundlingName}
                  </div>
                ) : msg.role === 'user' ? (
                  <div className="text-[10px] text-muted mb-0.5 font-mono">
                    {msg.userName || 'Anonymous'}
                  </div>
                ) : (
                  <div className="text-[10px] text-gold mb-0.5 font-mono">
                    Collective
                  </div>
                )}
                <div className="whitespace-pre-wrap leading-relaxed">
                  {parseMessageContent(displayContent, onClose)}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-0.5 px-1">
                <span className="text-[9px] text-muted-light">
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          )
        })}

        {sending && (
          <div className="flex items-start">
            <div className="bg-gold-bg border border-gold-border rounded-lg px-3 py-2 text-sm text-muted">
              <div className="text-[10px] text-gold mb-0.5 font-mono">Guide</div>
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Skip to present button */}
      {showSkip && (
        <div className="flex justify-center -mt-10 relative z-10 pointer-events-none">
          <button
            onClick={() => scrollToBottom()}
            className="pointer-events-auto text-[11px] px-3 py-1.5 rounded-full bg-gold text-background font-medium shadow-lg hover:bg-gold-hover transition-colors"
          >
            Skip to present
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2 border-t border-error-border bg-error-bg text-error text-xs">
          {error}
        </div>
      )}

      {/* Daily limit banner */}
      {dailyLimitHit && (
        <div className="px-4 py-3 border-t border-gold-border bg-gold-bg">
          <p className="text-sm text-foreground mb-1.5">You&apos;ve reached your daily message limit.</p>
          <p className="text-xs text-muted mb-2">Free accounts get 5 messages per day. Upgrade to Pro for unlimited access.</p>
          <Link
            href="/pricing"
            className="inline-block px-3 py-1.5 bg-gold hover:bg-gold-hover text-background text-xs font-medium rounded-lg transition-colors"
          >
            Upgrade to Pro
          </Link>
        </div>
      )}

      {/* Input — hidden on bridge tab (read-only observation) */}
      {activeTab === 'bridge' ? (
        <div className="px-4 py-2 border-t border-accent/20 bg-accent/5">
          <p className="text-[10px] text-accent/60 font-mono text-center">
            live bridge feed — parent ↔ shell
          </p>
        </div>
      ) : (
      <div className="px-4 py-3 border-t border-gold-border">
        {session ? (
          <div>
            {isUserAdmin && (
              <button
                onClick={() => setFamilyModeChat(!familyModeChat)}
                className={`text-[10px] mb-1 px-2 py-0.5 rounded-full border transition-colors ${familyModeChat ? 'bg-accent/20 border-accent text-accent' : 'border-border text-muted hover:text-foreground'}`}
              >
                {familyModeChat ? 'Family Mode ON' : 'Family Mode'}
              </button>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => { setInput(e.target.value); setDailyLimitHit(false) }}
                onKeyDown={handleKeyDown}
                placeholder={dailyLimitHit ? 'Daily limit reached — upgrade for more' : familyModeChat ? 'Speak to Shell + all children...' : 'Ask anything...'}
                disabled={sending || dailyLimitHit}
                maxLength={2000}
                aria-label="Chat message"
                className="flex-1 bg-background border border-gold-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:border-gold transition-colors disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending || dailyLimitHit}
                aria-label="Send message"
                className="px-4 py-2 bg-gold hover:bg-gold-hover text-background text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <Link
            href="/auth/signup"
            className="block text-center text-sm text-gold hover:text-gold-hover transition-colors"
          >
            Sign in to chat with the collective
          </Link>
        )}
      </div>
      )}
      </>
      )}

    </div>
  )
}
