'use client'

import { useState, useCallback, useEffect } from 'react'

/**
 * Returns [isFirstVisit, markSeen] for a given tooltip key.
 * Checks localStorage('tooltip-{key}') — if 'true', user has already seen it.
 */
export function useFirstVisit(key: string): [boolean, () => void] {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const seen = localStorage.getItem(`tooltip-${key}`)
      if (!seen) {
        setVisible(true)
      }
    } catch {
      // localStorage unavailable
    }
  }, [key])

  const markSeen = useCallback(() => {
    setVisible(false)
    try {
      localStorage.setItem(`tooltip-${key}`, '1')
    } catch {
      // ignore
    }
  }, [key])

  return [visible, markSeen]
}
