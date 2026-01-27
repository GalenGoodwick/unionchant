import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdminEmail } from '@/lib/admin'

// POST /api/admin/test/populate - Create test users and ideas for a deliberation
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin-only endpoint
    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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

    // Create test users
    const timestamp = Date.now()
    const users: { id: string; email: string; name: string | null }[] = []

    for (let i = 1; i <= userCount; i++) {
      const user = await prisma.user.create({
        data: {
          email: `test-${timestamp}-${i}@test.local`,
          name: `Test User ${i}`,
        },
      })
      users.push(user)
    }

    // Have each user join and submit an idea
    let ideasCreated = 0

    for (const user of users) {
      // Join deliberation
      await prisma.deliberationMember.create({
        data: {
          deliberationId,
          userId: user.id,
        },
      })

      // Submit idea (not every user needs one, but let's do most)
      if (ideasCreated < userCount - 1) { // Leave room for real user's idea
        await prisma.idea.create({
          data: {
            deliberationId,
            authorId: user.id,
            text: `Test idea #${ideasCreated + 1} from ${user.name}: This is an automated test idea proposing solution ${ideasCreated + 1}.`,
            status: 'SUBMITTED',
          },
        })
        ideasCreated++
      }
    }

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
