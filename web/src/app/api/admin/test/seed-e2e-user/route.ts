import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// POST /api/admin/test/seed-e2e-user
// Upserts a verified test user with a password. No auth required (bootstrap).
// Gated behind NODE_ENV !== 'production'.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Test endpoints disabled in production' }, { status: 403 })
  }

  try {
    const { email, password, name } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'email and password required' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash, name, status: 'ACTIVE', deletedAt: null },
      create: {
        email,
        name: name || 'E2E Test User',
        passwordHash,
        emailVerified: new Date(),
        onboardedAt: new Date(),
        status: 'ACTIVE',
      },
    })

    return NextResponse.json({ success: true, userId: user.id })
  } catch (error) {
    console.error('Seed E2E user error:', error)
    return NextResponse.json({ error: 'Failed to seed user' }, { status: 500 })
  }
}
