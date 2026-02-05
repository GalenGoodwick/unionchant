import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/user/stamp - Capture signup metadata (runs once after first login)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, signupIp: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Only stamp once — skip if already stamped
    if (user.signupIp) {
      return NextResponse.json({ stamped: false, reason: 'already_stamped' })
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    const country = req.headers.get('x-vercel-ip-country') || null
    const city = req.headers.get('x-vercel-ip-city') || null
    const timezone = req.headers.get('x-vercel-ip-timezone') || null
    const userAgent = req.headers.get('user-agent') || null

    await prisma.user.update({
      where: { id: user.id },
      data: {
        signupIp: ip,
        signupCountry: country,
        signupCity: city,
        signupTimezone: timezone,
        signupUserAgent: userAgent,
      },
    })

    return NextResponse.json({ stamped: true })
  } catch (error) {
    console.error('Error stamping user:', error)
    return NextResponse.json({ error: 'Failed to stamp' }, { status: 500 })
  }
}
