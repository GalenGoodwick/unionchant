'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function FollowButton({ userId, initialFollowing }: {
  userId: string
  initialFollowing: boolean
}) {
  const { data: session } = useSession()
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing)
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (!session) {
      router.push('/auth/signin')
      return
    }

    setLoading(true)
    const wasFollowing = following
    setFollowing(!wasFollowing) // optimistic

    try {
      const res = await fetch(`/api/user/${userId}/follow`, {
        method: wasFollowing ? 'DELETE' : 'POST',
      })
      if (!res.ok) {
        setFollowing(wasFollowing) // revert
      }
    } catch {
      setFollowing(wasFollowing) // revert
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${
        following
          ? 'bg-surface border border-border text-muted hover:text-error hover:border-error'
          : 'bg-accent hover:bg-accent-hover text-white'
      }`}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  )
}
