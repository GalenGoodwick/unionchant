import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin'

// GET /api/admin/check - Check if current user has admin access
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ isAdmin: false, error: 'Not authenticated' }, { status: 401 })
    }

    const isAdmin = isAdminEmail(session.user.email)

    return NextResponse.json({ isAdmin, email: session.user.email })
  } catch (error) {
    console.error('Error checking admin status:', error)
    return NextResponse.json({ isAdmin: false, error: 'Failed to check admin status' }, { status: 500 })
  }
}
