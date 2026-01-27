import webpush from 'web-push'
import { prisma } from './prisma'

// Lazy configure web-push with VAPID keys (only at runtime, not build time)
let vapidConfigured = false
function ensureVapidConfigured() {
  if (vapidConfigured) return
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:galen.goodwick@icloud.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    )
    vapidConfigured = true
  }
}

interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  deliberationId?: string
  cellId?: string
  actions?: Array<{ action: string; title: string }>
}

/**
 * Send a push notification to a specific user
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  })

  const results = await Promise.allSettled(
    subscriptions.map((sub) => sendPush(sub, payload))
  )

  // Clean up invalid subscriptions
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      const error = (results[i] as PromiseRejectedResult).reason
      if (error?.statusCode === 410 || error?.statusCode === 404) {
        // Subscription expired or invalid, remove it
        await prisma.pushSubscription.delete({
          where: { id: subscriptions[i].id },
        }).catch(() => {})
      }
    }
  }

  return results
}

/**
 * Send a push notification to all users in a cell
 */
export async function sendPushToCell(cellId: string, payload: PushPayload) {
  const cell = await prisma.cell.findUnique({
    where: { id: cellId },
    include: {
      participants: {
        where: { status: 'ACTIVE' },
        select: { userId: true },
      },
      deliberation: {
        select: { question: true },
      },
    },
  })

  if (!cell) return []

  const userIds = cell.participants.map((p) => p.userId)

  const results = await Promise.allSettled(
    userIds.map((userId) =>
      sendPushToUser(userId, {
        ...payload,
        cellId,
        deliberationId: cell.deliberationId,
      })
    )
  )

  return results
}

/**
 * Send a push notification to all users in a deliberation
 */
export async function sendPushToDeliberation(
  deliberationId: string,
  payload: PushPayload
) {
  const members = await prisma.deliberationMember.findMany({
    where: { deliberationId },
    select: { userId: true },
  })

  const results = await Promise.allSettled(
    members.map((m) =>
      sendPushToUser(m.userId, {
        ...payload,
        deliberationId,
      })
    )
  )

  return results
}

/**
 * Send push to a specific subscription
 */
async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string; id: string },
  payload: PushPayload
) {
  ensureVapidConfigured()

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  }

  await webpush.sendNotification(pushSubscription, JSON.stringify(payload))

  // Update last used timestamp
  await prisma.pushSubscription.update({
    where: { id: subscription.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {})
}

/**
 * Pre-built notification templates
 */
export const notifications = {
  votingStarted: (deliberationQuestion: string, deliberationId: string) => ({
    title: 'Time to Vote!',
    body: `Voting has started for: "${deliberationQuestion.slice(0, 50)}${deliberationQuestion.length > 50 ? '...' : ''}"`,
    url: `/deliberations/${deliberationId}`,
    tag: `voting-${deliberationId}`,
  }),

  cellReady: (deliberationQuestion: string, deliberationId: string, cellId: string) => ({
    title: 'Your Cell is Ready',
    body: `Join your group to deliberate: "${deliberationQuestion.slice(0, 40)}..."`,
    url: `/deliberations/${deliberationId}`,
    tag: `cell-${cellId}`,
    actions: [
      { action: 'vote', title: 'Vote Now' },
      { action: 'dismiss', title: 'Later' },
    ],
  }),

  spotExpiring: (minutesLeft: number, deliberationId: string) => ({
    title: `${minutesLeft} Minutes Left!`,
    body: 'Your voting spot will expire soon. Vote now to participate!',
    url: `/deliberations/${deliberationId}`,
    tag: `expiring-${deliberationId}`,
  }),

  newTier: (tierNumber: number, deliberationId: string) => ({
    title: `Tier ${tierNumber} Started`,
    body: 'A new round of voting has begun. Check if you have a cell to vote in!',
    url: `/deliberations/${deliberationId}`,
    tag: `tier-${deliberationId}`,
  }),

  championDeclared: (deliberationQuestion: string, deliberationId: string) => ({
    title: 'Champion Declared!',
    body: `The deliberation "${deliberationQuestion.slice(0, 40)}..." has concluded`,
    url: `/deliberations/${deliberationId}`,
    tag: `champion-${deliberationId}`,
  }),

  accumulationStarted: (deliberationQuestion: string, deliberationId: string) => ({
    title: 'Champion Crowned - Submit Challengers!',
    body: `A champion has emerged for "${deliberationQuestion.slice(0, 35)}...". Submit ideas to challenge!`,
    url: `/deliberations/${deliberationId}`,
    tag: `accumulation-${deliberationId}`,
  }),

  challengeRoundStarting: (deliberationQuestion: string, deliberationId: string, round: number) => ({
    title: `Challenge Round ${round} Starting!`,
    body: `New challengers are competing in "${deliberationQuestion.slice(0, 35)}..."`,
    url: `/deliberations/${deliberationId}`,
    tag: `challenge-${deliberationId}-${round}`,
  }),

  votingExpiring: (minutesLeft: number, deliberationId: string, cellId: string) => ({
    title: `${minutesLeft} Minutes to Vote!`,
    body: 'Your cell voting deadline is approaching. Cast your vote now!',
    url: `/deliberations/${deliberationId}`,
    tag: `vote-expiring-${cellId}`,
  }),
}
