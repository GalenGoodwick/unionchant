import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCommunityMemberRole } from '@/lib/community'
import { sendEmail } from '@/lib/email'
import { communityInviteEmail } from '@/lib/email-templates'

// POST /api/communities/[slug]/invite - Send email invites
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, name: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const role = await getCommunityMemberRole(slug, user.id)
    if (role !== 'OWNER' && role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only owners and admins can send invites' }, { status: 403 })
    }

    const community = await prisma.community.findUnique({
      where: { slug },
      select: { id: true, name: true, description: true, inviteCode: true },
    })
    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 })
    }

    const body = await req.json()
    const { emails } = body

    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: 'At least one email is required' }, { status: 400 })
    }

    if (emails.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 invites at a time' }, { status: 400 })
    }

    // Generate invite code if missing
    let inviteCode = community.inviteCode
    if (!inviteCode) {
      inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      await prisma.community.update({
        where: { id: community.id },
        data: { inviteCode },
      })
    }

    const emailData = communityInviteEmail({
      communityName: community.name,
      inviterName: user.name,
      inviteCode,
      description: community.description,
    })

    // Send emails in parallel (fire-and-forget)
    const results = await Promise.allSettled(
      emails.map((email: string) =>
        sendEmail({ to: email, subject: emailData.subject, html: emailData.html })
      )
    )

    const sent = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    return NextResponse.json({ sent, failed })
  } catch (error) {
    console.error('Error sending community invites:', error)
    return NextResponse.json({ error: 'Failed to send invites' }, { status: 500 })
  }
}
