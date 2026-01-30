import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/auth/verify-email?token=xxx - Verify email address
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')
    if (!token) {
      return NextResponse.redirect(new URL('/auth/signin?error=invalid-token', req.url))
    }

    const record = await prisma.verificationToken.findUnique({
      where: { token },
    })

    if (!record || record.expires < new Date()) {
      return NextResponse.redirect(new URL('/auth/signin?error=expired-token', req.url))
    }

    // Mark user as verified
    await prisma.user.update({
      where: { email: record.identifier },
      data: { emailVerified: new Date() },
    })

    // Delete the token
    await prisma.verificationToken.delete({
      where: { token },
    })

    return NextResponse.redirect(new URL('/auth/signin?verified=true', req.url))
  } catch (error) {
    console.error('Email verification error:', error)
    return NextResponse.redirect(new URL('/auth/signin?error=verification-failed', req.url))
  }
}
