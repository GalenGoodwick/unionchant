'use client'

import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

type Deliberation = {
  id: string
  question: string
  description: string | null
  phase: string
  tags: string[]
  createdAt: string
  creator: {
    name: string | null
  }
  _count: {
    members: number
    ideas: number
  }
}

function DeliberationsList() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [deliberations, setDeliberations] = useState<Deliberation[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const activeTag = searchParams.get('tag')

  useEffect(() => {
    const url = activeTag ? `/api/deliberations?tag=${encodeURIComponent(activeTag)}` : '/api/deliberations'
    fetch(url)
      .then(res => res.json())
      .then(data => {
        setDeliberations(data)
        // Collect all unique tags
        const tags = new Set<string>()
        data.forEach((d: Deliberation) => d.tags?.forEach((t: string) => tags.add(t)))
        setAllTags(Array.from(tags).sort())
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [activeTag])

  const handleTagClick = (tag: string) => {
    if (activeTag === tag) {
      router.push('/deliberations')
    } else {
      router.push(`/deliberations?tag=${encodeURIComponent(tag)}`)
    }
  }

  const phaseColors: Record<string, string> = {
    SUBMISSION: 'bg-blue-500',
    VOTING: 'bg-yellow-500',
    COMPLETED: 'bg-green-500',
    ACCUMULATING: 'bg-purple-500',
  }

  return (
    <>
      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => handleTagClick(tag)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                activeTag === tag
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {tag}
            </button>
          ))}
          {activeTag && (
            <button
              onClick={() => router.push('/deliberations')}
              className="px-3 py-1 rounded-full text-sm bg-slate-800 text-slate-400 hover:text-slate-300"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

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
                <p className="text-slate-400 mb-3 line-clamp-2">{d.description}</p>
              )}
              {d.tags && d.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {d.tags.map(tag => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
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
    </>
  )
}

export default function DeliberationsPage() {
  const { data: session } = useSession()

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
            <div className="flex items-center gap-3">
              <Link
                href="/settings"
                className="text-slate-400 hover:text-slate-300 p-2"
                title="Settings"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              </Link>
              <Link
                href="/deliberations/new"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                New Deliberation
              </Link>
            </div>
          )}
        </div>

        <Suspense fallback={<div className="text-slate-400 text-center py-12">Loading...</div>}>
          <DeliberationsList />
        </Suspense>
      </div>
    </div>
  )
}
