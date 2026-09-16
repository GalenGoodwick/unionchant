import { prisma } from './prisma'

/**
 * Record a funnel event. Fire-and-forget: analytics must never break or
 * slow the action being measured.
 */
export function trackEvent(type: 'join' | 'idea_submit' | 'vote_cast' | 'email_click', params: {
  userId?: string
  deliberationId?: string
  tier?: number
  source?: string
} = {}): void {
  prisma.funnelEvent.create({
    data: {
      type,
      userId: params.userId ?? null,
      deliberationId: params.deliberationId ?? null,
      tier: params.tier ?? null,
      source: params.source ?? null,
    },
  }).catch(err => console.error('[funnel]', type, err?.message || err))
}
