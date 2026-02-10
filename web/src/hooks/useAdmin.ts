'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect, useCallback } from 'react'

export function useAdmin() {
  const { data: session, status } = useSession()
  const [isAdmin, setIsAdmin] = useState(false)
  const [isAdminVerified, setIsAdminVerified] = useState(false)
  const [hasPasskeys, setHasPasskeys] = useState(false)
  const [loading, setLoading] = useState(true)

  const checkAdmin = useCallback(() => {
    if (!session?.user?.email) {
      setIsAdmin(false)
      setIsAdminVerified(false)
      setHasPasskeys(false)
      setLoading(false)
      return
    }

    fetch('/api/admin/check')
      .then(res => res.json())
      .then(data => {
        setIsAdmin(data.isAdmin === true)
        setIsAdminVerified(data.isAdminVerified === true)
        setHasPasskeys(data.hasPasskeys === true)
        setLoading(false)
      })
      .catch(() => {
        setIsAdmin(false)
        setIsAdminVerified(false)
        setHasPasskeys(false)
        setLoading(false)
      })
  }, [session?.user?.email])

  useEffect(() => {
    if (status === 'loading') return
    checkAdmin()
  }, [status, checkAdmin])

  return { isAdmin, isAdminVerified, hasPasskeys, loading, recheckAdmin: checkAdmin }
}
