const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.unionchant.org'

const layout = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#fff;border-radius:8px;padding:32px;border:1px solid #e4e4e7;">
      ${content}
    </div>
    <p style="text-align:center;color:#a1a1aa;font-size:12px;margin-top:24px;">
      Union Chant &mdash; Scalable Direct Democracy
    </p>
  </div>
</body>
</html>
`

const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#0891b2;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:16px;margin:16px 0;">${label}</a>`

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
    ? `<div style="background:#f0f9ff;border-left:3px solid #0891b2;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;">
        <p style="margin:0;color:#18181b;font-size:14px;white-space:pre-line;">${params.message}</p>
      </div>`
    : ''

  return {
    subject: `You're invited to deliberate: ${params.question}`,
    html: layout(`
      <h2 style="margin:0 0 8px;color:#18181b;font-size:20px;">You've been invited</h2>
      <p style="color:#71717a;font-size:14px;margin:0 0 16px;">
        ${params.inviterName || 'Someone'} invited you to join a deliberation.
      </p>
      ${orgLine}
      <div style="background:#f4f4f5;border-radius:6px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#18181b;font-size:16px;font-weight:600;">&ldquo;${params.question}&rdquo;</p>
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
  const voteUrl = `${baseUrl}/deliberations/${params.deliberationId}`

  return {
    subject: `Time to vote: ${params.question}`,
    html: layout(`
      <h2 style="margin:0 0 8px;color:#18181b;font-size:20px;">Your vote is needed</h2>
      <p style="color:#71717a;font-size:14px;margin:0 0 16px;">
        Voting has started (Tier ${params.tier}) for:
      </p>
      <div style="background:#f4f4f5;border-radius:6px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#18181b;font-size:16px;font-weight:600;">&ldquo;${params.question}&rdquo;</p>
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
  const voteUrl = `${baseUrl}/deliberations/${params.deliberationId}`

  return {
    subject: `Voting ending soon: ${params.question}`,
    html: layout(`
      <h2 style="margin:0 0 8px;color:#18181b;font-size:20px;">Voting is ending soon</h2>
      <p style="color:#71717a;font-size:14px;margin:0 0 16px;">
        Don't miss your chance to vote on:
      </p>
      <div style="background:#f4f4f5;border-radius:6px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#18181b;font-size:16px;font-weight:600;">&ldquo;${params.question}&rdquo;</p>
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
  const resultsUrl = `${baseUrl}/deliberations/${params.deliberationId}`

  return {
    subject: `Champion declared: ${params.question}`,
    html: layout(`
      <h2 style="margin:0 0 8px;color:#18181b;font-size:20px;">A champion has been declared!</h2>
      <p style="color:#71717a;font-size:14px;margin:0 0 16px;">
        The deliberation has reached a decision:
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 4px;color:#166534;font-size:12px;font-weight:600;text-transform:uppercase;">Champion</p>
        <p style="margin:0;color:#18181b;font-size:16px;font-weight:600;">&ldquo;${params.championText}&rdquo;</p>
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
  const joinUrl = `${baseUrl}/communities/invite/${params.inviteCode}`
  const descLine = params.description
    ? `<p style="color:#71717a;font-size:14px;margin:8px 0 16px;">${params.description}</p>`
    : ''

  return {
    subject: `You're invited to join ${params.communityName} on Union Chant`,
    html: layout(`
      <h2 style="margin:0 0 8px;color:#18181b;font-size:20px;">You've been invited</h2>
      <p style="color:#71717a;font-size:14px;margin:0 0 16px;">
        ${params.inviterName || 'Someone'} invited you to join a community.
      </p>
      <div style="background:#f4f4f5;border-radius:6px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#18181b;font-size:16px;font-weight:600;">${params.communityName}</p>
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
    subject: 'Verify your Union Chant email',
    html: layout(`
      <h2 style="margin:0 0 8px;color:#18181b;font-size:20px;">Verify your email</h2>
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
    subject: 'Reset your Union Chant password',
    html: layout(`
      <h2 style="margin:0 0 8px;color:#18181b;font-size:20px;">Reset your password</h2>
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

export function newTierEmail(params: {
  question: string
  deliberationId: string
  tier: number
}) {
  const voteUrl = `${baseUrl}/deliberations/${params.deliberationId}`

  return {
    subject: `New voting tier: ${params.question}`,
    html: layout(`
      <h2 style="margin:0 0 8px;color:#18181b;font-size:20px;">Tier ${params.tier} voting has begun</h2>
      <p style="color:#71717a;font-size:14px;margin:0 0 16px;">
        Ideas have advanced and a new round of voting is underway:
      </p>
      <div style="background:#f4f4f5;border-radius:6px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#18181b;font-size:16px;font-weight:600;">&ldquo;${params.question}&rdquo;</p>
      </div>
      <div style="text-align:center;">
        ${button(voteUrl, 'Enter Voting')}
      </div>
    `),
  }
}
