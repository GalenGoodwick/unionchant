import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { inviteEmail } from '@/lib/email-templates'

// POST /api/deliberations/[id]/invite - Send email invites
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      include: {
        members: {
          where: { userId: user.id },
          select: { role: true },
        },
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    // Only the creator can send invites
    const membership = deliberation.members[0]
    if (!membership || membership.role !== 'CREATOR') {
      return NextResponse.json({ error: 'Only the creator can send invites' }, { status: 403 })
    }

    const body = await req.json()
    const { emails } = body

    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: 'emails array is required' }, { status: 400 })
    }

    if (emails.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 emails per request' }, { status: 400 })
    }

    // Ensure deliberation has an invite code
    let inviteCode = deliberation.inviteCode
    if (!inviteCode) {
      const updated = await prisma.deliberation.update({
        where: { id },
        data: { inviteCode: crypto.randomUUID().replace(/-/g, '').slice(0, 16) },
      })
      inviteCode = updated.inviteCode!
    }

    // Send emails in parallel
    const template = inviteEmail({
      question: deliberation.question,
      inviterName: user.name,
      inviteCode,
      organization: deliberation.organization,
    })

    const results = await Promise.allSettled(
      emails.map((email: string) =>
        sendEmail({ to: email.trim(), ...template })
      )
    )

    const sent = results.filter(r => r.status === 'fulfilled' && r.value).length
    const failed = results.length - sent

    return NextResponse.json({ sent, failed, total: results.length })
  } catch (error) {
    console.error('Error sending invites:', error)
    return NextResponse.json({ error: 'Failed to send invites' }, { status: 500 })
  }
}
