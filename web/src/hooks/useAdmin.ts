'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'

export function useAdmin() {
  const { data: session, status } = useSession()
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'loading') return

    if (!session?.user?.email) {
      setIsAdmin(false)
      setLoading(false)
      return
    }

    fetch('/api/admin/check')
      .then(res => res.json())
      .then(data => {
        setIsAdmin(data.isAdmin === true)
        setLoading(false)
      })
      .catch(() => {
        setIsAdmin(false)
        setLoading(false)
      })
  }, [session, status])

  return { isAdmin, loading }
}
