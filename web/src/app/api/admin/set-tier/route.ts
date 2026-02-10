import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminVerified } from '@/lib/admin'

// Admin-only endpoint to manually set subscription tier (for testing/support)
export async function POST(req: NextRequest) {
  const auth = await requireAdminVerified(req)
  if (!auth.authorized) return auth.response

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
