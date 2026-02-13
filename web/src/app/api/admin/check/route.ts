import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin'
import { isAdminVerified } from '@/lib/admin-session'
import { prisma } from '@/lib/prisma'

// GET /api/admin/check - Check admin status + passkey verification
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ isAdmin: false, error: 'Not authenticated' }, { status: 401 })
    }

    const admin = isAdminEmail(session.user.email)

    if (!admin) {
      return NextResponse.json({ isAdmin: false })
    }

    let hasPasskeys = false
    try {
      hasPasskeys = await prisma.webAuthnCredential.count({
        where: { userId: session.user.id },
      }) > 0
    } catch { /* table may not exist yet */ }

    const verified = hasPasskeys
      ? (process.env.NODE_ENV === 'development' || isAdminVerified(req, session.user.id))
      : true // No passkeys = no verification needed

    return NextResponse.json({
      isAdmin: true,
      isAdminVerified: verified,
      hasPasskeys,
      email: session.user.email,
    })
  } catch (error) {
    console.error('Error checking admin status:', error)
    return NextResponse.json({ isAdmin: false, error: 'Failed to check admin status' }, { status: 500 })
  }
}
