'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import FrameLayout from '@/components/FrameLayout'


export default function NewCommunityPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    isPublic: true,
  })
  const [userTier, setUserTier] = useState('free')
  const [privateGroupCount, setPrivateGroupCount] = useState(0)
  const [tierLoaded, setTierLoaded] = useState(false)
  const [isUserAdmin, setIsUserAdmin] = useState(false)

  const privateGroupLimits: Record<string, number> = { free: 0, pro: 1, business: 2 }
  const memberCaps: Record<string, string> = { pro: '500', business: '5,000', scale: 'Unlimited' }
  const maxPrivate = isUserAdmin ? Infinity : (userTier in privateGroupLimits ? privateGroupLimits[userTier] : Infinity)
  const canCreatePrivate = privateGroupCount < maxPrivate
  const tierLabel = userTier === 'business' ? 'Org' : userTier === 'pro' ? 'Pro' : userTier === 'scale' ? 'Scale' : 'Free'

  useEffect(() => {
    if (session?.user?.email) {
      Promise.all([
        fetch('/api/user/me').then(r => r.json()),
        fetch('/api/communities/mine').then(r => r.json()),
      ]).then(([userData, communities]) => {
        const u = userData.user || userData
        if (u.subscriptionTier) setUserTier(u.subscriptionTier)
        if (u.isAdmin) setIsUserAdmin(true)
        const privateCount = Array.isArray(communities)
          ? communities.filter((c: { isPublic: boolean; role: string }) => !c.isPublic && c.role === 'OWNER').length
          : 0
        setPrivateGroupCount(privateCount)
        setTierLoaded(true)
      }).catch(() => setTierLoaded(true))
    } else {
      setTierLoaded(true)
    }
  }, [session])

  if (status === 'loading') {
    return (
      <FrameLayout active="groups" showBack>
        <div className="flex items-center justify-center py-16">
          <div className="text-muted text-xs">Loading...</div>
        </div>
      </FrameLayout>
    )
  }

  if (!session) {
    router.push('/auth/signin')
    return null
  }

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50)
  }

  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name,
      // Auto-generate slug from name if user hasn't manually edited it
      slug: formData.slug === generateSlug(formData.name) || formData.slug === ''
        ? generateSlug(name)
        : formData.slug,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!formData.name.trim()) {
      setError('Name is required')
      setLoading(false)
      return
    }

    if (!formData.slug.trim() || formData.slug.length < 3) {
      setError('Slug must be at least 3 characters')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || data.details || 'Failed to create community')
      }

      const community = await res.json()
      router.push(`/groups/${community.slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <FrameLayout active="groups" showBack>
      <div className="pt-4">
        <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-4">
          <h1 className="text-sm font-bold text-foreground mb-4">Create a Group</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-xs font-semibold text-foreground mb-1">
                Group Name *
              </label>
              <input
                type="text"
                id="name"
                required
                maxLength={100}
                placeholder="Minneapolis Teachers Union"
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
                value={formData.name}
                onChange={e => handleNameChange(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="slug" className="block text-xs font-semibold text-foreground mb-1">
                URL Slug *
              </label>
              <div className="flex items-center gap-2">
                <span className="text-muted text-xs">/groups/</span>
                <input
                  type="text"
                  id="slug"
                  required
                  maxLength={50}
                  placeholder="minneapolis-teachers"
                  className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder-muted-light focus:outline-none focus:border-accent font-mono"
                  value={formData.slug}
                  onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                />
              </div>
              <p className="text-muted-light text-[10px] mt-1">Lowercase letters, numbers, and hyphens only. Min 3 characters.</p>
            </div>

            <div>
              <label htmlFor="description" className="block text-xs font-semibold text-foreground mb-1">
                Description (optional)
              </label>
              <textarea
                id="description"
                rows={3}
                maxLength={500}
                placeholder="What is this group about?"
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
              <p className="text-muted-light text-[10px] mt-1 text-right">{formData.description.length}/500</p>
            </div>

            <div className="border-t border-border pt-4">
              <h2 className="text-xs font-semibold text-foreground mb-3">Visibility</h2>
              <div className="space-y-2">
                <label className={`flex items-start gap-3 p-2.5 border rounded-lg cursor-pointer transition-colors ${
                  formData.isPublic ? 'border-accent bg-accent/5' : 'border-border hover:border-accent'
                }`}>
                  <input
                    type="radio"
                    name="visibility"
                    checked={formData.isPublic}
                    onChange={() => setFormData({ ...formData, isPublic: true })}
                    className="mt-0.5 w-3.5 h-3.5 text-accent"
                  />
                  <div>
                    <div className="text-xs font-medium text-foreground">Public</div>
                    <div className="text-muted text-[10px]">Anyone can find and join this group</div>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-2.5 border rounded-lg transition-colors ${
                  !canCreatePrivate
                    ? 'border-border opacity-60 cursor-not-allowed'
                    : !formData.isPublic ? 'border-accent bg-accent/5 cursor-pointer' : 'border-border hover:border-accent cursor-pointer'
                }`}>
                  <input
                    type="radio"
                    name="visibility"
                    checked={!formData.isPublic}
                    disabled={!canCreatePrivate}
                    onChange={() => setFormData({ ...formData, isPublic: false })}
                    className="mt-0.5 w-3.5 h-3.5 text-accent"
                  />
                  <div>
                    <div className="text-xs font-medium text-foreground">Private</div>
                    <div className="text-muted text-[10px]">Only people with an invite link can join</div>
                    {tierLoaded && userTier === 'free' && !isUserAdmin && (
                      <div className="mt-1 text-[10px] text-accent">
                        <a href="/pricing" className="underline hover:no-underline">Upgrade to Pro</a> to create private groups
                      </div>
                    )}
                    {tierLoaded && maxPrivate > 0 && maxPrivate !== Infinity && (
                      <div className="mt-1 text-[10px] text-muted">
                        {privateGroupCount} of {maxPrivate} private group{maxPrivate > 1 ? 's' : ''} used ({tierLabel})
                        {!canCreatePrivate && (
                          <span className="text-accent ml-1">
                            &mdash; <a href="/pricing" className="underline hover:no-underline">Upgrade</a>
                          </span>
                        )}
                      </div>
                    )}
                    {tierLoaded && memberCaps[userTier] && !formData.isPublic && (
                      <div className="mt-1 text-[10px] text-muted">
                        Up to {memberCaps[userTier]} members per group
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {error && (
              <div className="bg-error-bg border border-error-border text-error px-3 py-2 rounded-lg text-xs">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-hover disabled:bg-muted-light disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg text-xs transition-colors"
            >
              {loading ? 'Creating...' : 'Create Group'}
            </button>
          </form>
        </div>
      </div>
    </FrameLayout>
  )
}
