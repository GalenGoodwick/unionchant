'use client'

import { useState, useRef, useEffect } from 'react'

const GLOSSARY: Record<string, string> = {
  'Deliberation': 'A structured group vote on a question',
  'Cell': 'A small group of 5 people voting on 5 ideas',
  'Tier': 'A round of voting — winners advance to the next tier',
  'Champion': 'The winning idea after all rounds of voting',
  'Defending Champion': 'The current winner being challenged by new ideas',
  'Challenge Round': 'A new vote where challenger ideas compete against the champion',
  'Accumulating': 'Waiting period where new challenger ideas can be submitted',
  'Advancing': 'This idea won its round and moves to the next tier',
  'Up-pollinate': 'When a popular comment spreads to other voting groups',
}

export function GlossaryTerm({ term, children }: { term: string; children?: React.ReactNode }) {
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const definition = GLOSSARY[term]

  useEffect(() => {
    if (!show) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [show])

  if (!definition) return <>{children || term}</>

  return (
    <span
      ref={ref}
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow(prev => !prev)}
    >
      <span className="border-b border-dashed border-muted cursor-help">
        {children || term}
      </span>
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-header text-white text-xs rounded-lg shadow-lg whitespace-nowrap max-w-[250px] text-wrap text-center pointer-events-none">
          {definition}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-header" />
        </span>
      )}
    </span>
  )
}

export { GLOSSARY }
