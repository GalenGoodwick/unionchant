import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/stream — Public read of admin's Shell conversation
// No auth required. Anyone can see the stream.
export async function GET() {
  try {
    // Find admin user
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim())
    const admin = await prisma.user.findFirst({
      where: { email: { in: adminEmails } },
      select: { id: true, name: true },
    })

    if (!admin) {
      return NextResponse.json({ messages: [] })
    }

    // Load the admin's conversation — both Collective Chat and Bridge messages
    const messages = await prisma.collectiveMessage.findMany({
      where: {
        OR: [
          { userId: admin.id, isPrivate: true },
          { replyToUserId: admin.id, isPrivate: true },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        role: true,
        content: true,
        userName: true,
        model: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      messages: messages.reverse(),
      admin: admin.name || 'Galen',
    })
  } catch (error) {
    console.error('[Stream] GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load stream' },
      { status: 500 }
    )
  }
}
