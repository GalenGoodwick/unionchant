'use client'

import { useEffect, useState, useCallback } from 'react'
import { useToast } from '@/components/Toast'
import type { CommentWithUpvote } from '@/components/deliberation/types'

export function useCellComments(cellId: string | null) {
  const { showToast } = useToast()
  const [localComments, setLocalComments] = useState<CommentWithUpvote[]>([])
  const [upPollinatedComments, setUpPollinatedComments] = useState<CommentWithUpvote[]>([])
  const [newComment, setNewComment] = useState('')
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [upvoting, setUpvoting] = useState<string | null>(null)

  const fetchComments = useCallback(async () => {
    if (!cellId) return
    try {
      const res = await fetch(`/api/cells/${cellId}/comments`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setLocalComments(data)
          setUpPollinatedComments([])
        } else {
          setLocalComments(data.local || [])
          setUpPollinatedComments(data.upPollinated || [])
        }
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err)
    } finally {
      setLoading(false)
    }
  }, [cellId])

  useEffect(() => {
    if (!cellId) return
    fetchComments()
    const interval = setInterval(fetchComments, 10000)
    return () => clearInterval(interval)
  }, [cellId, fetchComments])

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!newComment.trim() || !cellId) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/cells/${cellId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newComment,
          ideaId: selectedIdeaId || undefined,
        }),
      })
      if (res.ok) {
        setNewComment('')
        setSelectedIdeaId(null)
        fetchComments()
      } else {
        const data = await res.json()
        showToast(data.error || 'Failed to post comment', 'error')
      }
    } catch {
      showToast('Failed to post comment', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpvote = async (commentId: string) => {
    setUpvoting(commentId)
    try {
      const res = await fetch(`/api/comments/${commentId}/upvote`, {
        method: 'POST',
      })
      if (res.ok) fetchComments()
    } catch (err) {
      console.error('Failed to upvote:', err)
    } finally {
      setUpvoting(null)
    }
  }

  return {
    localComments,
    upPollinatedComments,
    allComments: [...localComments, ...upPollinatedComments],
    newComment,
    setNewComment,
    selectedIdeaId,
    setSelectedIdeaId,
    loading,
    submitting,
    upvoting,
    handleSubmit,
    handleUpvote,
    fetchComments,
  }
}
