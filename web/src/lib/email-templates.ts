const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.unitychant.com'
const logoUrl = `${baseUrl}/logo-email.png`

const layout = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#111113;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <!-- Header -->
    <div style="text-align:center;padding:24px 0 20px;">
      <a href="${baseUrl}" style="text-decoration:none;">
        <img src="${logoUrl}" alt="Unity Chant" width="48" height="48" style="display:inline-block;vertical-align:middle;" />
        <span style="display:inline-block;vertical-align:middle;margin-left:12px;font-size:22px;font-weight:700;color:#e8b84b;letter-spacing:-0.5px;">Unity Chant</span>
      </a>
    </div>
    <!-- Content -->
    <div style="background:#1a1a1e;border-radius:12px;padding:32px;border:1px solid #2a2a2e;">
      ${content}
    </div>
    <!-- Footer -->
    <div style="text-align:center;padding:24px 0 8px;">
      <p style="color:#71717a;font-size:12px;margin:0 0 8px;">
        Consensus at Scale
      </p>
      <a href="${baseUrl}/settings" style="color:#0891b2;font-size:12px;text-decoration:none;">
        Manage email preferences
      </a>
    </div>
  </div>
</body>
</html>
`

const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#0891b2;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;margin:16px 0;">${label}</a>`

export function inviteEmail(params: {
  question: string
  inviterName: string | null
  inviteCode: string
  organization?: string | null
  message?: string | null
}) {
  const joinUrl = `${baseUrl}/invite/${params.inviteCode}`
  const orgLine = params.organization
    ? `<p style="color:#71717a;font-size:14px;margin:0 0 8px;">Organization: <strong>${params.organization}</strong></p>`
    : ''
  const messageLine = params.message
    ? `<div style="background:#0c2d48;border-left:3px solid #0891b2;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;">
        <p style="margin:0;color:#d4d4d8;font-size:14px;white-space:pre-line;">${params.message}</p>
      </div>`
    : ''

  return {
    subject: `You're invited to deliberate: ${params.question}`,
    html: layout(`
      <h2 style="margin:0 0 8px;color:#f4f4f5;font-size:20px;">You've been invited</h2>
      <p style="color:#71717a;font-size:14px;margin:0 0 16px;">
        ${params.inviterName || 'Someone'} invited you to join a deliberation.
      </p>
      ${orgLine}
      <div style="background:#252529;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#e4e4e7;font-size:16px;font-weight:600;">&ldquo;${params.question}&rdquo;</p>
      </div>
      ${messageLine}
      <div style="text-align:center;">
        ${button(joinUrl, 'Join Deliberation')}
      </div>
      <p style="color:#a1a1aa;font-size:12px;margin-top:16px;">
        Or copy this link: ${joinUrl}
      </p>
    `),
  }
}

export function cellReadyEmail(params: {
  question: string
  deliberationId: string
  tier: number
}) {
  const voteUrl = `${baseUrl}/talks/${params.deliberationId}`

  return {
    subject: `Time to vote: ${params.question}`,
    html: layout(`
      <h2 style="margin:0 0 8px;color:#f4f4f5;font-size:20px;">Your vote is needed</h2>
      <p style="color:#71717a;font-size:14px;margin:0 0 16px;">
        Voting has started (Tier ${params.tier}) for:
      </p>
      <div style="background:#252529;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#e4e4e7;font-size:16px;font-weight:600;">&ldquo;${params.question}&rdquo;</p>
      </div>
      <div style="text-align:center;">
        ${button(voteUrl, 'Cast Your Vote')}
      </div>
    `),
  }
}

export function votingEndingSoonEmail(params: {
  question: string
  deliberationId: string
}) {
  const voteUrl = `${baseUrl}/talks/${params.deliberationId}`

  return {
    subject: `Voting ending soon: ${params.question}`,
    html: layout(`
      <h2 style="margin:0 0 8px;color:#f4f4f5;font-size:20px;">Voting is ending soon</h2>
      <p style="color:#71717a;font-size:14px;margin:0 0 16px;">
        Don't miss your chance to vote on:
      </p>
      <div style="background:#252529;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#e4e4e7;font-size:16px;font-weight:600;">&ldquo;${params.question}&rdquo;</p>
      </div>
      <div style="text-align:center;">
        ${button(voteUrl, 'Vote Now')}
      </div>
    `),
  }
}

export function championDeclaredEmail(params: {
  question: string
  championText: string
  deliberationId: string
}) {
  const resultsUrl = `${baseUrl}/talks/${params.deliberationId}`

  return {
    subject: `Champion declared: ${params.question}`,
    html: layout(`
      <h2 style="margin:0 0 8px;color:#f4f4f5;font-size:20px;">A champion has been declared!</h2>
      <p style="color:#71717a;font-size:14px;margin:0 0 16px;">
        The deliberation has reached a decision:
      </p>
      <div style="background:#052e16;border:1px solid #166534;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 4px;color:#4ade80;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Priority</p>
        <p style="margin:0;color:#e4e4e7;font-size:16px;font-weight:600;">&ldquo;${params.championText}&rdquo;</p>
      </div>
      <p style="color:#71717a;font-size:14px;">
        For: &ldquo;${params.question}&rdquo;
      </p>
      <div style="text-align:center;">
        ${button(resultsUrl, 'View Results')}
      </div>
    `),
  }
}

export function communityInviteEmail(params: {
  communityName: string
  inviterName: string | null
  inviteCode: string
  description?: string | null
}) {
  const joinUrl = `${baseUrl}/groups/invite/${params.inviteCode}`
  const descLine = params.description
    ? `<p style="color:#71717a;font-size:14px;margin:8px 0 16px;">${params.description}</p>`
    : ''

  return {
    subject: `You're invited to join ${params.communityName} on Unity Chant`,
    html: layout(`
      <h2 style="margin:0 0 8px;color:#f4f4f5;font-size:20px;">You've been invited</h2>
      <p style="color:#71717a;font-size:14px;margin:0 0 16px;">
        ${params.inviterName || 'Someone'} invited you to join a community.
      </p>
      <div style="background:#252529;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#e4e4e7;font-size:16px;font-weight:600;">${params.communityName}</p>
      </div>
      ${descLine}
      <div style="text-align:center;">
        ${button(joinUrl, 'Join Community')}
      </div>
      <p style="color:#a1a1aa;font-size:12px;margin-top:16px;">
        Or copy this link: ${joinUrl}
      </p>
    `),
  }
}

export function verificationEmail(params: {
  email: string
  token: string
}) {
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${params.token}`

  return {
    subject: 'Verify your Unity Chant email',
    html: layout(`
      <h2 style="margin:0 0 8px;color:#f4f4f5;font-size:20px;">Verify your email</h2>
      <p style="color:#71717a;font-size:14px;margin:0 0 16px;">
        Click the button below to verify your email address and activate your account.
      </p>
      <div style="text-align:center;">
        ${button(verifyUrl, 'Verify Email')}
      </div>
      <p style="color:#a1a1aa;font-size:12px;margin-top:16px;">
        This link expires in 24 hours. If you didn't create an account, ignore this email.
      </p>
    `),
  }
}

export function passwordResetEmail(params: {
  email: string
  token: string
}) {
  const resetUrl = `${baseUrl}/auth/reset-password?token=${params.token}`

  return {
    subject: 'Reset your Unity Chant password',
    html: layout(`
      <h2 style="margin:0 0 8px;color:#f4f4f5;font-size:20px;">Reset your password</h2>
      <p style="color:#71717a;font-size:14px;margin:0 0 16px;">
        Click the button below to reset your password.
      </p>
      <div style="text-align:center;">
        ${button(resetUrl, 'Reset Password')}
      </div>
      <p style="color:#a1a1aa;font-size:12px;margin-top:16px;">
        This link expires in 1 hour. If you didn't request a reset, ignore this email.
      </p>
    `),
  }
}

export function followedNewDelibEmail(params: {
  userName: string
  question: string
  deliberationId: string
}) {
  const delibUrl = `${baseUrl}/talks/${params.deliberationId}`

  return {
    subject: `"${params.userName}" started a new deliberation`,
    html: layout(`
      <h2 style="margin:0 0 8px;color:#f4f4f5;font-size:20px;">New deliberation from someone you follow</h2>
      <p style="color:#71717a;font-size:14px;margin:0 0 16px;">
        <strong>${params.userName}</strong> just created a new deliberation:
      </p>
      <div style="background:#252529;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#e4e4e7;font-size:16px;font-weight:600;">&ldquo;${params.question}&rdquo;</p>
      </div>
      <div style="text-align:center;">
        ${button(delibUrl, 'View Deliberation')}
      </div>
    `),
  }
}

export function podiumNewsEmail(params: {
  title: string
  body: string
  authorName: string
  podiumId: string
}) {
  const podiumUrl = `${baseUrl}/podium/${params.podiumId}`
  // Truncate body for email preview
  const preview = params.body.length > 500 ? params.body.slice(0, 500) + '...' : params.body

  return {
    subject: `${params.title} — Unity Chant News`,
    html: layout(`
      <h2 style="margin:0 0 8px;color:#f4f4f5;font-size:20px;">${params.title}</h2>
      <p style="color:#71717a;font-size:13px;margin:0 0 16px;">
        By ${params.authorName}
      </p>
      <div style="color:#d4d4d8;font-size:15px;line-height:1.6;margin:0 0 24px;white-space:pre-line;">${preview}</div>
      <div style="text-align:center;">
        ${button(podiumUrl, 'Read More')}
      </div>
      <p style="color:#a1a1aa;font-size:12px;margin-top:24px;text-align:center;">
        You received this because you have news notifications enabled.
        <a href="${baseUrl}/settings" style="color:#0891b2;">Manage preferences</a>
      </p>
    `),
  }
}

export function newTierEmail(params: {
  question: string
  deliberationId: string
  tier: number
}) {
  const voteUrl = `${baseUrl}/talks/${params.deliberationId}`

  return {
    subject: `New voting tier: ${params.question}`,
    html: layout(`
      <h2 style="margin:0 0 8px;color:#f4f4f5;font-size:20px;">Tier ${params.tier} voting has begun</h2>
      <p style="color:#71717a;font-size:14px;margin:0 0 16px;">
        Ideas have advanced and a new round of voting is underway:
      </p>
      <div style="background:#252529;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#e4e4e7;font-size:16px;font-weight:600;">&ldquo;${params.question}&rdquo;</p>
      </div>
      <div style="text-align:center;">
        ${button(voteUrl, 'Enter Voting')}
      </div>
    `),
  }
}
