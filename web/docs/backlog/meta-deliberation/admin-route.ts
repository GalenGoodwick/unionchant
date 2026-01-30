import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin'
import {
  initializeMetaDeliberation,
  getCurrentMetaDeliberation,
  getSpawnedDeliberations,
} from '@/lib/meta-deliberation'

/**
 * GET /api/admin/meta-deliberation
 * Get current meta-deliberation status and spawned deliberations
 */
export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const currentMeta = await getCurrentMetaDeliberation()
  const spawnedDeliberations = await getSpawnedDeliberations(10)

  return NextResponse.json({
    currentMeta,
    spawnedDeliberations,
  })
}

/**
 * POST /api/admin/meta-deliberation
 * Initialize the meta-deliberation system
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Check if there's already an active meta-deliberation
  const existing = await getCurrentMetaDeliberation()
  if (existing) {
    return NextResponse.json(
      { error: 'A meta-deliberation is already active', existing },
      { status: 400 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const schedule = body.schedule === 'weekly' ? 'weekly' : 'daily'

  // Get creator ID from session
  const { prisma } = await import('@/lib/prisma')
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const metaDeliberation = await initializeMetaDeliberation(user.id, schedule)

  // Auto-join the creator
  await prisma.deliberationMember.create({
    data: {
      deliberationId: metaDeliberation.id,
      userId: user.id,
      role: 'CREATOR',
    },
  })

  return NextResponse.json({
    message: 'Meta-deliberation initialized',
    deliberation: metaDeliberation,
  })
}
