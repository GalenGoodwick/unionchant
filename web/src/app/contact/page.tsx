'use client'

import { useState } from 'react'
import FrameLayout from '@/components/FrameLayout'

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  })
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to send message')
      }

      setStatus('success')
      setFormData({ name: '', email: '', subject: '', message: '' })
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <FrameLayout
      hideFooter
      showBack
      header={<h2 className="text-sm font-semibold text-foreground pb-3">Contact</h2>}
    >
      <div className="space-y-3">
        <p className="text-xs text-muted">Questions, feedback, or partnership inquiries? We'd love to hear from you.</p>

        {status === 'success' && (
          <div className="bg-success-bg border border-success text-success rounded-lg p-3 text-xs font-medium">
            Message sent! We'll get back to you soon.
          </div>
        )}

        {status === 'error' && (
          <div className="bg-error-bg border border-error text-error rounded-lg p-3 text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-3.5 bg-surface/90 border border-border rounded-lg backdrop-blur-sm space-y-3">
          <div>
            <label htmlFor="name" className="block text-foreground font-medium mb-1 text-xs">Name</label>
            <input
              type="text"
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
              placeholder="Your name"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-foreground font-medium mb-1 text-xs">Email</label>
            <input
              type="email"
              id="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="subject" className="block text-foreground font-medium mb-1 text-xs">Subject</label>
            <input
              type="text"
              id="subject"
              required
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
              placeholder="What's this about?"
            />
          </div>

          <div>
            <label htmlFor="message" className="block text-foreground font-medium mb-1 text-xs">Message</label>
            <textarea
              id="message"
              required
              rows={4}
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent resize-none"
              placeholder="Tell us what's on your mind..."
            />
          </div>

          <button
            type="submit"
            disabled={status === 'sending'}
            className="w-full bg-accent hover:bg-accent-hover text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {status === 'sending' ? 'Sending...' : 'Send Message'}
          </button>
        </form>

        <p className="text-center text-[11px] text-muted">
          Or email <a href="mailto:galen.goodwick@gmail.com" className="text-accent hover:underline">galen.goodwick@gmail.com</a>
        </p>
      </div>
    </FrameLayout>
  )
}
