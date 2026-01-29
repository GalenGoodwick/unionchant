import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdminEmail } from '@/lib/admin'

// GET /api/admin/test/users - Get test user count
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const count = await prisma.user.count({
      where: { email: { endsWith: '@test.local' } }
    })

    return NextResponse.json({ testUserCount: count })
  } catch (error) {
    console.error('Error counting test users:', error)
    return NextResponse.json({ error: 'Failed to count' }, { status: 500 })
  }
}

// POST /api/admin/test/users - Create test user pool
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const targetCount = body.count || 1000

    // Check existing
    const existing = await prisma.user.count({
      where: { email: { endsWith: '@test.local' } }
    })

    if (existing >= targetCount) {
      return NextResponse.json({
        message: 'Already have enough test users',
        existing,
        created: 0
      })
    }

    const needed = targetCount - existing
    const timestamp = Date.now()
    const batchSize = 100

    let created = 0
    for (let batch = 0; batch < Math.ceil(needed / batchSize); batch++) {
      const batchStart = batch * batchSize
      const batchEnd = Math.min(batchStart + batchSize, needed)
      const batchCount = batchEnd - batchStart

      await prisma.user.createMany({
        data: Array.from({ length: batchCount }, (_, i) => ({
          email: `test-${timestamp}-${batchStart + i + 1}@test.local`,
          name: `Test User ${existing + batchStart + i + 1}`,
        })),
      })

      created += batchCount

      // Log progress for long operations
      if (created % 500 === 0) {
        console.log(`Created ${created}/${needed} test users...`)
      }
    }

    return NextResponse.json({
      message: 'Test users created',
      existing,
      created,
      total: existing + created
    })
  } catch (error) {
    console.error('Error creating test users:', error)
    return NextResponse.json({ error: 'Failed to create test users' }, { status: 500 })
  }
}
