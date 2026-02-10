import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

export type WebhookEvent =
  | 'idea_submitted'
  | 'vote_cast'
  | 'tier_complete'
  | 'winner_declared'

export async function fireWebhookEvent(event: WebhookEvent, payload: Record<string, unknown>) {
  try {
    const integrations = await prisma.integration.findMany({
      where: {
        enabled: true,
        events: { has: event },
      },
    })

    if (integrations.length === 0) return

    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload })

    for (const integration of integrations) {
      // Fire and forget — don't block core logic
      const signature = crypto
        .createHmac('sha256', integration.secret)
        .update(body)
        .digest('hex')

      fetch(integration.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-UC-Signature': signature,
          'X-UC-Event': event,
        },
        body,
        signal: AbortSignal.timeout(5000),
      })
        .then(async (res) => {
          if (res.ok) {
            // Reset fail count on success
            await prisma.integration.update({
              where: { id: integration.id },
              data: { lastCalledAt: new Date(), failCount: 0 },
            }).catch(() => {})
          } else {
            await incrementFailCount(integration.id, integration.failCount)
          }
        })
        .catch(async () => {
          await incrementFailCount(integration.id, integration.failCount)
        })
    }
  } catch (err) {
    // Never let webhook failures break core logic
    console.error('fireWebhookEvent error:', err)
  }
}

async function incrementFailCount(integrationId: string, currentFailCount: number) {
  const newCount = currentFailCount + 1
  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      failCount: newCount,
      // Auto-disable after 10 consecutive failures
      enabled: newCount >= 10 ? false : undefined,
    },
  }).catch(() => {})
}
