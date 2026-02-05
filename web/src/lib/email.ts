import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import {
  cellReadyEmail,
  championDeclaredEmail,
  newTierEmail,
} from '@/lib/email-templates'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const EMAIL_FROM = process.env.EMAIL_FROM || 'Unity Chant <noreply@unitychant.com>'

/**
 * Send a single email. Fails silently — logs error but never throws.
 */
export async function sendEmail(params: {
  to: string
  subject: string
  html: string
}): Promise<boolean> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not configured, skipping email to', params.to)
    return false
  }

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
    })
    if (error) {
      console.error('[email] Resend error sending to', params.to, 'from:', EMAIL_FROM, 'error:', JSON.stringify(error))
      return false
    }
    console.log('[email] Sent to', params.to, 'id:', data?.id)
    return true
  } catch (error: any) {
    console.error('[email] Exception sending to', params.to, 'from:', EMAIL_FROM, 'error:', error?.message || error)
    return false
  }
}

/**
 * Send emails to all members of a deliberation.
 * Fires in parallel, fails silently per-recipient.
 */
export async function sendEmailToDeliberation(
  deliberationId: string,
  type: 'cell_ready' | 'champion_declared' | 'new_tier',
  data: { tier?: number; championText?: string }
): Promise<void> {
  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    select: {
      question: true,
      members: {
        include: {
          user: { select: { email: true, emailVoting: true, emailResults: true } },
        },
      },
    },
  })

  if (!deliberation) return

  // Filter by email preference
  const prefKey = type === 'cell_ready' ? 'emailVoting' : 'emailResults'
  const emails = deliberation.members
    .filter(m => m.user[prefKey])
    .map(m => m.user.email)

  let template: { subject: string; html: string }

  switch (type) {
    case 'cell_ready':
      template = cellReadyEmail({
        question: deliberation.question,
        deliberationId,
        tier: data.tier || 1,
      })
      break
    case 'champion_declared':
      template = championDeclaredEmail({
        question: deliberation.question,
        championText: data.championText || 'Unknown',
        deliberationId,
      })
      break
    case 'new_tier':
      template = newTierEmail({
        question: deliberation.question,
        deliberationId,
        tier: data.tier || 2,
      })
      break
  }

  // Send in parallel, don't await — fire and forget
  const promises = emails.map(email =>
    sendEmail({ to: email, ...template })
  )

  Promise.allSettled(promises).then(results => {
    const sent = results.filter(r => r.status === 'fulfilled' && r.value).length
    console.log(`[email] ${type}: sent ${sent}/${emails.length} for deliberation ${deliberationId}`)
  })
}
