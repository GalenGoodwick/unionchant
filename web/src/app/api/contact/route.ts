import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const { name, email, subject, message } = await req.json()

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 })
    }

    // Send email to support
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean)
    const supportEmail = process.env.SUPPORT_EMAIL || adminEmails[0] || 'support@unitychant.com'

    await sendEmail({
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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Contact form error:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
