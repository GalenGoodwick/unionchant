'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useCallback, useEffect } from 'react'
import Header from '@/components/Header'
import ReCaptcha from '@/components/ReCaptcha'

export default function NewCommunityPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  const handleCaptchaVerify = useCallback((token: string) => {
    setCaptchaToken(token)
  }, [])

  const handleCaptchaExpire = useCallback(() => {
    setCaptchaToken(null)
  }, [])

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
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
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
        body: JSON.stringify({
          ...formData,
          captchaToken,
        }),
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
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Link href="/groups" className="text-muted hover:text-foreground text-sm mb-4 inline-block">
          &larr; Back to Groups
        </Link>

        <div className="bg-background rounded-xl border border-border p-6">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-6">Create a Group</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-foreground font-medium mb-2">
                Group Name *
              </label>
              <input
                type="text"
                id="name"
                required
                maxLength={100}
                placeholder="Minneapolis Teachers Union"
                className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
                value={formData.name}
                onChange={e => handleNameChange(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="slug" className="block text-foreground font-medium mb-2">
                URL Slug *
              </label>
              <div className="flex items-center gap-2">
                <span className="text-muted text-sm">/groups/</span>
                <input
                  type="text"
                  id="slug"
                  required
                  maxLength={50}
                  placeholder="minneapolis-teachers"
                  className="flex-1 bg-surface border border-border rounded-xl px-4 py-3 text-foreground placeholder-muted-light focus:outline-none focus:border-accent font-mono text-sm"
                  value={formData.slug}
                  onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                />
              </div>
              <p className="text-muted-light text-xs mt-1">Lowercase letters, numbers, and hyphens only. Min 3 characters.</p>
            </div>

            <div>
              <label htmlFor="description" className="block text-foreground font-medium mb-2">
                Description (optional)
              </label>
              <textarea
                id="description"
                rows={3}
                maxLength={500}
                placeholder="What is this group about?"
                className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
              <p className="text-muted-light text-xs mt-1 text-right">{formData.description.length}/500</p>
            </div>

            <div className="border-t border-border pt-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Visibility</h2>
              <div className="space-y-3">
                <label className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                  formData.isPublic ? 'border-accent bg-accent/5' : 'border-border hover:border-accent'
                }`}>
                  <input
                    type="radio"
                    name="visibility"
                    checked={formData.isPublic}
                    onChange={() => setFormData({ ...formData, isPublic: true })}
                    className="mt-1 w-4 h-4 text-accent"
                  />
                  <div>
                    <div className="text-foreground font-medium">Public</div>
                    <div className="text-muted text-sm">Anyone can find and join this group</div>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 border rounded-xl transition-colors ${
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
                    className="mt-1 w-4 h-4 text-accent"
                  />
                  <div>
                    <div className="text-foreground font-medium">Private</div>
                    <div className="text-muted text-sm">Only people with an invite link can join</div>
                    {tierLoaded && userTier === 'free' && !isUserAdmin && (
                      <div className="mt-1 text-xs text-accent">
                        <a href="/pricing" className="underline hover:no-underline">Upgrade to Pro</a> to create private groups
                      </div>
                    )}
                    {tierLoaded && maxPrivate > 0 && maxPrivate !== Infinity && (
                      <div className="mt-1 text-xs text-muted">
                        {privateGroupCount} of {maxPrivate} private group{maxPrivate > 1 ? 's' : ''} used ({tierLabel})
                        {!canCreatePrivate && (
                          <span className="text-accent ml-1">
                            &mdash; <a href="/pricing" className="underline hover:no-underline">Upgrade</a>
                          </span>
                        )}
                      </div>
                    )}
                    {tierLoaded && memberCaps[userTier] && !formData.isPublic && (
                      <div className="mt-1 text-xs text-muted">
                        Up to {memberCaps[userTier]} members per group
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {error && (
              <div className="bg-error-bg border border-error-border text-error px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            {!captchaToken && (
              <ReCaptcha
                onVerify={handleCaptchaVerify}
                onExpire={handleCaptchaExpire}
                className="flex justify-center"
              />
            )}

            <button
              type="submit"
              disabled={loading || !captchaToken}
              className="w-full bg-accent hover:bg-accent-hover disabled:bg-muted-light disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-xl transition-colors"
            >
              {loading ? 'Creating...' : 'Create Group'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
