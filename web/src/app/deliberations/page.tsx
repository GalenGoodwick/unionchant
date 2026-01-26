'use client'

import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

type Deliberation = {
  id: string
  question: string
  description: string | null
  phase: string
  createdAt: string
  creator: {
    name: string | null
  }
  _count: {
    members: number
    ideas: number
  }
}

export default function DeliberationsPage() {
  const { data: session } = useSession()
  const [deliberations, setDeliberations] = useState<Deliberation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/deliberations')
      .then(res => res.json())
      .then(data => {
        setDeliberations(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const phaseColors: Record<string, string> = {
    SUBMISSION: 'bg-blue-500',
    VOTING: 'bg-yellow-500',
    COMPLETED: 'bg-green-500',
    ACCUMULATING: 'bg-purple-500',
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <Link href="/" className="text-slate-400 hover:text-slate-300 text-sm mb-2 inline-block">
              &larr; Back to home
            </Link>
            <h1 className="text-3xl font-bold text-white">Deliberations</h1>
          </div>
          {session && (
            <Link
              href="/deliberations/new"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              New Deliberation
            </Link>
          )}
        </div>

        {loading ? (
          <div className="text-slate-400 text-center py-12">Loading...</div>
        ) : deliberations.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-400 mb-4">No deliberations yet.</p>
            {session ? (
              <Link
                href="/deliberations/new"
                className="text-blue-400 hover:text-blue-300"
              >
                Create the first one
              </Link>
            ) : (
              <Link
                href="/auth/signin"
                className="text-blue-400 hover:text-blue-300"
              >
                Sign in to create one
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {deliberations.map((d) => (
              <Link
                key={d.id}
                href={`/deliberations/${d.id}`}
                className="block bg-slate-800 rounded-lg p-6 hover:bg-slate-750 transition-colors border border-slate-700 hover:border-slate-600"
              >
                <div className="flex justify-between items-start mb-2">
                  <h2 className="text-xl font-semibold text-white">{d.question}</h2>
                  <span className={`${phaseColors[d.phase] || 'bg-gray-500'} text-white text-xs px-2 py-1 rounded`}>
                    {d.phase}
                  </span>
                </div>
                {d.description && (
                  <p className="text-slate-400 mb-4 line-clamp-2">{d.description}</p>
                )}
                <div className="flex gap-4 text-sm text-slate-500">
                  <span>by {d.creator.name || 'Anonymous'}</span>
                  <span>{d._count.members} participants</span>
                  <span>{d._count.ideas} ideas</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
