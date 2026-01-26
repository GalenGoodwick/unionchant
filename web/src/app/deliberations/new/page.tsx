'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'

export default function NewDeliberationPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    question: '',
    description: '',
    isPublic: true,
    tagsInput: '',
    // Timer settings
    submissionHours: 24,
    votingMinutes: 60,
    accumulationEnabled: true,
    accumulationDays: 1,
  })

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    )
  }

  if (!session) {
    router.push('/auth/signin')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const tags = formData.tagsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)

      const res = await fetch('/api/deliberations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: formData.question,
          description: formData.description,
          isPublic: formData.isPublic,
          tags,
          // Timer settings
          submissionDurationMs: formData.submissionHours * 60 * 60 * 1000,
          votingTimeoutMs: formData.votingMinutes * 60 * 1000,
          accumulationEnabled: formData.accumulationEnabled,
          accumulationTimeoutMs: formData.accumulationDays * 24 * 60 * 60 * 1000,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create deliberation')
      }

      const deliberation = await res.json()
      router.push(`/deliberations/${deliberation.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/deliberations" className="text-slate-400 hover:text-slate-300 text-sm mb-4 inline-block">
          &larr; Back to deliberations
        </Link>

        <h1 className="text-3xl font-bold text-white mb-8">Start a New Deliberation</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="question" className="block text-white font-medium mb-2">
              Question *
            </label>
            <input
              type="text"
              id="question"
              required
              placeholder="What should we decide on?"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              value={formData.question}
              onChange={(e) => setFormData({ ...formData, question: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-white font-medium mb-2">
              Description (optional)
            </label>
            <textarea
              id="description"
              rows={4}
              placeholder="Provide more context about this deliberation..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="tags" className="block text-white font-medium mb-2">
              Tags (optional)
            </label>
            <input
              type="text"
              id="tags"
              placeholder="climate, policy, local (comma separated, max 5)"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              value={formData.tagsInput}
              onChange={(e) => setFormData({ ...formData, tagsInput: e.target.value })}
            />
            <p className="text-slate-500 text-sm mt-1">Help others find your deliberation</p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isPublic"
              checked={formData.isPublic}
              onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
              className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="isPublic" className="text-slate-300">
              Make this deliberation public (anyone can join)
            </label>
          </div>

          {/* Timer Settings */}
          <div className="border-t border-slate-700 pt-6 mt-6">
            <h2 className="text-lg font-semibold text-white mb-4">Timer Settings</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="submissionHours" className="block text-slate-300 text-sm mb-2">
                  Submission Period (hours)
                </label>
                <input
                  type="number"
                  id="submissionHours"
                  min={1}
                  max={168}
                  value={formData.submissionHours}
                  onChange={(e) => setFormData({ ...formData, submissionHours: parseInt(e.target.value) || 24 })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-slate-500 text-xs mt-1">How long to accept new ideas</p>
              </div>

              <div>
                <label htmlFor="votingMinutes" className="block text-slate-300 text-sm mb-2">
                  Voting Timeout (minutes)
                </label>
                <input
                  type="number"
                  id="votingMinutes"
                  min={5}
                  max={1440}
                  value={formData.votingMinutes}
                  onChange={(e) => setFormData({ ...formData, votingMinutes: parseInt(e.target.value) || 60 })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-slate-500 text-xs mt-1">Time limit for each cell vote</p>
              </div>
            </div>
          </div>

          {/* Rolling Mode Settings */}
          <div className="border-t border-slate-700 pt-6 mt-2">
            <div className="flex items-center gap-3 mb-4">
              <input
                type="checkbox"
                id="accumulationEnabled"
                checked={formData.accumulationEnabled}
                onChange={(e) => setFormData({ ...formData, accumulationEnabled: e.target.checked })}
                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-purple-600 focus:ring-purple-500"
              />
              <label htmlFor="accumulationEnabled" className="text-slate-300">
                Enable Rolling Mode (continuous challenge rounds)
              </label>
            </div>

            {formData.accumulationEnabled && (
              <div className="ml-7">
                <label htmlFor="accumulationDays" className="block text-slate-300 text-sm mb-2">
                  Accumulation Period (days)
                </label>
                <input
                  type="number"
                  id="accumulationDays"
                  min={1}
                  max={30}
                  value={formData.accumulationDays}
                  onChange={(e) => setFormData({ ...formData, accumulationDays: parseInt(e.target.value) || 1 })}
                  className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                />
                <p className="text-slate-500 text-xs mt-1">
                  Time to collect challengers before each challenge round
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            {loading ? 'Creating...' : 'Create Deliberation'}
          </button>
        </form>
      </div>
    </div>
  )
}
