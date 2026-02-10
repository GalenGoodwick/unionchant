import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminVerified } from '@/lib/admin'

// POST /api/admin/test/populate - Create test users and ideas for a deliberation
export async function POST(req: NextRequest) {
  try {
    // Block test endpoints in production
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Test endpoints disabled in production' }, { status: 403 })
    }

    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    const body = await req.json()
    const { deliberationId, userCount = 40 } = body

    if (!deliberationId) {
      return NextResponse.json({ error: 'deliberationId required' }, { status: 400 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    if (deliberation.phase !== 'SUBMISSION') {
      return NextResponse.json({ error: 'Deliberation must be in SUBMISSION phase' }, { status: 400 })
    }

    // Reuse existing test users or create new ones
    let users = await prisma.user.findMany({
      where: { email: { endsWith: '@test.local' } },
      take: userCount,
      select: { id: true, email: true, name: true },
    })

    // Create more if needed
    if (users.length < userCount) {
      const needed = userCount - users.length
      const timestamp = Date.now()

      // Batch create users
      await prisma.user.createMany({
        data: Array.from({ length: needed }, (_, i) => ({
          email: `test-${timestamp}-${i + 1}@test.local`,
          name: `Test User ${users.length + i + 1}`,
        })),
      })

      // Fetch all test users again
      users = await prisma.user.findMany({
        where: { email: { endsWith: '@test.local' } },
        take: userCount,
        select: { id: true, email: true, name: true },
      })
    }

    // Batch create memberships
    await prisma.deliberationMember.createMany({
      data: users.map(user => ({
        deliberationId,
        userId: user.id,
      })),
      skipDuplicates: true,
    })

    // Batch create ideas (one per user, leave room for real user)
    const ideaCount = userCount - 1
    await prisma.idea.createMany({
      data: users.slice(0, ideaCount).map((user, i) => ({
        deliberationId,
        authorId: user.id,
        text: `Test idea #${i + 1} from ${user.name}: This is an automated test idea proposing solution ${i + 1}.`,
        status: 'SUBMITTED',
      })),
    })

    const ideasCreated = ideaCount

    return NextResponse.json({
      success: true,
      usersCreated: users.length,
      ideasCreated,
    })
  } catch (error) {
    console.error('Error populating test data:', error)
    return NextResponse.json({ error: 'Failed to populate test data' }, { status: 500 })
  }
}
