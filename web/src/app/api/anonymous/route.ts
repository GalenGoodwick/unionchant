import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// POST /api/anonymous — Create anonymous account (kept permanently to preserve entries)
export async function POST(req: NextRequest) {
  // CRITICAL: Actively reject and delete IP data before processing
  const headers = new Headers(req.headers)
  headers.delete('x-forwarded-for')
  headers.delete('x-real-ip')
  headers.delete('cf-connecting-ip')
  headers.delete('true-client-ip')
  headers.delete('x-client-ip')

  try {
    // Generate anonymous account — kept permanently to preserve entries
    const anonId = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    const email = `anon_${anonId}@temporary.unitychant.com`
    const username = `Anonymous_${anonId.slice(0, 6)}`
    const password = crypto.randomUUID() + crypto.randomUUID()
    const passwordHash = await bcrypt.hash(password, 10)

    await prisma.user.create({
      data: {
        email,
        name: username,
        passwordHash,
        emailVerified: new Date(),
        isAnonymous: true,
      },
    })

    return NextResponse.json({
      email,
      password,
    })
  } catch (error) {
    console.error('Error creating anonymous account:', error)
    return NextResponse.json({ error: 'Failed to create anonymous session' }, { status: 500 })
  }
}
