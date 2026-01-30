import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

// POST /api/auth/reset-password - Reset password with token
export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json()

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and password are required' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const record = await prisma.verificationToken.findUnique({
      where: { token },
    })

    if (!record || record.expires < new Date() || !record.identifier.startsWith('reset:')) {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })
    }

    const email = record.identifier.replace('reset:', '')
    const passwordHash = await bcrypt.hash(password, 12)

    await prisma.user.update({
      where: { email },
      data: { passwordHash },
    })

    await prisma.verificationToken.delete({
      where: { token },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reset password error:', error)
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 })
  }
}
