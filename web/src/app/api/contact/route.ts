import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function POST(req: NextRequest) {
  try {
    const { name, email, subject, message } = await req.json()

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.error('[contact] RESEND_API_KEY not set')
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
    }

    const resend = new Resend(apiKey)
    const fromAddress = process.env.EMAIL_FROM || 'Unity Chant <noreply@unitychant.com>'
    const supportEmail = 'galen.goodwick@gmail.com'

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: supportEmail,
      subject: `Contact Form: ${subject}`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px;">
          <h2 style="color: #0891b2;">New Contact Form Submission</h2>

          <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 8px 0;"><strong>From:</strong> ${name}</p>
            <p style="margin: 8px 0;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
            <p style="margin: 8px 0;"><strong>Subject:</strong> ${subject}</p>
          </div>

          <div style="margin: 24px 0;">
            <p style="margin-bottom: 8px;"><strong>Message:</strong></p>
            <div style="white-space: pre-wrap; background: #fff; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px;">
              ${message}
            </div>
          </div>

          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
            Reply directly to this email to respond to ${name}.
          </p>
        </div>
      `,
    })

    if (error) {
      console.error('[contact] Resend error:', JSON.stringify(error))
      return NextResponse.json({ error: `Email failed: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, emailId: data?.id })
  } catch (error) {
    console.error('Contact form error:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
