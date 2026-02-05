'use client'

import { useState, useCallback, useEffect } from 'react'

/**
 * Returns [isFirstVisit, markSeen] for a given tooltip key.
 * Checks localStorage('tooltip-{key}') — if 'true', user has already seen it.
 */
export function useFirstVisit(key: string): [boolean, () => void] {
  const [visible, setVisible] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    try {
      const tooltipSeen = localStorage.getItem(`tooltip-${key}`) === 'true'
      setVisible(!tooltipSeen)
    } catch {
      // localStorage unavailable (e.g. private browsing)
      setVisible(false)
    }
  }, [key])

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(`tooltip-${key}`, 'true')
    } catch {
      // ignore
    }
    setChecked(true)
    setVisible(false)
  }, [key])

  return [visible && !checked, markSeen]
}
