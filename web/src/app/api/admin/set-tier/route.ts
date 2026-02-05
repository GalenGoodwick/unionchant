import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Admin-only endpoint to manually set subscription tier (for testing/support)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if user is admin
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim())
  if (!adminEmails.includes(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { email, tier } = await req.json()
  if (!email || !tier) {
    return NextResponse.json({ error: 'email and tier required' }, { status: 400 })
  }

  if (!['free', 'pro', 'business', 'scale'].includes(tier)) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
  }

  await prisma.user.update({
    where: { email },
    data: { subscriptionTier: tier },
  })

  return NextResponse.json({ success: true, email, tier })
}
