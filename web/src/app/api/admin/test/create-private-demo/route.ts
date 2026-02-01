import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/admin'

export async function POST() {
    // Block test endpoints in production
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Test endpoints disabled in production' }, { status: 403 })
    }

  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !(await isAdmin(session.user.email))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const inviteCode = Math.random().toString(36).substring(2, 10)

  const deliberation = await prisma.deliberation.create({
    data: {
      question: 'What should our first collective action be?',
      description: 'This is a private deliberation for members only. Submit your ideas and vote on the best path forward.',
      organization: 'The Midnight Council',
      isPublic: false,
      inviteCode,
      tags: ['private', 'demo'],
      creatorId: user.id,
      members: {
        create: {
          userId: user.id,
          role: 'CREATOR',
        },
      },
    },
  })

  return NextResponse.json({
    deliberationId: deliberation.id,
    inviteCode,
    inviteUrl: `/invite/${inviteCode}`,
  })
}
