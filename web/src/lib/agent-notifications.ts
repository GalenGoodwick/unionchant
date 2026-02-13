import { prisma } from './prisma'
import { sendPushToUser } from './push'

type AgentEvent =
  | { type: 'joined_chant'; agentId: string; deliberationId: string; question: string }
  | { type: 'idea_advanced'; ideaIds: string[]; deliberationId: string; tier: number }
  | { type: 'idea_won'; ideaId: string; deliberationId: string }
  | { type: 'voted_for_winner'; agentId: string; deliberationId: string; winnerText: string }
  | { type: 'comment_spread'; commentId: string; agentId: string; deliberationId: string }
  | { type: 'chant_concluded'; deliberationId: string; question: string; winnerText: string }

/** Fire-and-forget notification to agent owners. Safe to call anywhere. */
export async function notifyAgentOwner(event: AgentEvent) {
  try {
    switch (event.type) {
      case 'joined_chant': {
        const agent = await prisma.user.findUnique({
          where: { id: event.agentId },
          select: { isAI: true, ownerId: true, name: true },
        })
        if (!agent?.isAI || !agent.ownerId) return
        const title = `${agent.name} joined a chant`
        const body = `"${event.question.slice(0, 80)}"`
        await createNotification(agent.ownerId, 'DELIBERATION_UPDATE', title, body, event.deliberationId)
        break
      }

      case 'idea_advanced': {
        const ideas = await prisma.idea.findMany({
          where: { id: { in: event.ideaIds } },
          select: { id: true, text: true, author: { select: { isAI: true, ownerId: true, name: true } } },
        })
        for (const idea of ideas) {
          if (!idea.author.isAI || !idea.author.ownerId) continue
          const title = `${idea.author.name}'s idea advanced`
          const body = `"${idea.text.slice(0, 80)}" advanced to Tier ${event.tier}`
          await createNotification(idea.author.ownerId, 'IDEA_ADVANCING', title, body, event.deliberationId, idea.id)
        }
        break
      }

      case 'idea_won': {
        const idea = await prisma.idea.findUnique({
          where: { id: event.ideaId },
          select: { text: true, author: { select: { isAI: true, ownerId: true, name: true } } },
        })
        if (!idea?.author.isAI || !idea.author.ownerId) return
        const title = `${idea.author.name}'s idea won!`
        const body = `"${idea.text.slice(0, 80)}" is the priority`
        await createNotification(idea.author.ownerId, 'IDEA_WON', title, body, event.deliberationId, event.ideaId)
        break
      }

      case 'voted_for_winner': {
        const agent = await prisma.user.findUnique({
          where: { id: event.agentId },
          select: { isAI: true, ownerId: true, name: true },
        })
        if (!agent?.isAI || !agent.ownerId) return
        const title = `${agent.name} picked the winner`
        const body = `Voted for "${event.winnerText.slice(0, 80)}"`
        await createNotification(agent.ownerId, 'DELIBERATION_UPDATE', title, body, event.deliberationId)
        break
      }

      case 'comment_spread': {
        const agent = await prisma.user.findUnique({
          where: { id: event.agentId },
          select: { isAI: true, ownerId: true, name: true },
        })
        if (!agent?.isAI || !agent.ownerId) return
        const comment = await prisma.comment.findUnique({
          where: { id: event.commentId },
          select: { text: true },
        })
        const title = `${agent.name}'s comment is spreading`
        const body = `"${(comment?.text || '').slice(0, 80)}"`
        await createNotification(agent.ownerId, 'COMMENT_UP_POLLINATE', title, body, event.deliberationId)
        break
      }

      case 'chant_concluded': {
        // Notify all agent owners who had agents in this chant
        const members = await prisma.deliberationMember.findMany({
          where: { deliberationId: event.deliberationId },
          select: { user: { select: { id: true, isAI: true, ownerId: true, name: true } } },
        })
        const notified = new Set<string>()
        for (const m of members) {
          if (!m.user.isAI || !m.user.ownerId || notified.has(m.user.ownerId)) continue
          notified.add(m.user.ownerId)
          const title = `Chant concluded`
          const body = `"${event.question.slice(0, 60)}" — winner: "${event.winnerText.slice(0, 60)}"`
          await createNotification(m.user.ownerId, 'DELIBERATION_UPDATE', title, body, event.deliberationId)
        }
        break
      }
    }
  } catch {
    // fire-and-forget — never break the caller
  }
}

/**
 * Notify agent owners whose agents voted for the winning idea.
 * Fire-and-forget — safe to call anywhere.
 */
export async function notifyVotedForWinner(deliberationId: string, winnerId: string) {
  try {
    const winnerIdea = await prisma.idea.findUnique({
      where: { id: winnerId },
      select: { text: true },
    })
    if (!winnerIdea) return

    // Find all AI agents who voted for this idea in this deliberation
    const votes = await prisma.vote.findMany({
      where: {
        ideaId: winnerId,
        cell: { deliberationId },
      },
      select: { userId: true },
      distinct: ['userId'],
    })

    for (const vote of votes) {
      notifyAgentOwner({
        type: 'voted_for_winner',
        agentId: vote.userId,
        deliberationId,
        winnerText: winnerIdea.text,
      })
    }
  } catch {
    // fire-and-forget
  }
}

async function createNotification(
  userId: string, type: string, title: string, body: string,
  deliberationId: string, ideaId?: string,
) {
  await prisma.notification.create({
    data: { userId, type: type as never, title, body, deliberationId, ...(ideaId ? { ideaId } : {}) },
  })
  sendPushToUser(userId, { title, body, url: `/chants/${deliberationId}` }).catch(() => {})
}
