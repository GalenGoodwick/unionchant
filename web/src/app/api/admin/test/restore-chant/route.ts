import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !(await isAdmin(session.user.email))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const id = 'cmnm6n1y2000004joc3dv6lhu'
  const question = 'What is the seed vision that all of Port Townsend wants the mayor and city to focus on?'

  // Check if already exists
  const existing = await prisma.deliberation.findUnique({ where: { id } })
  if (existing) {
    return NextResponse.json({ message: 'Already exists', id, url: `/chants/${id}` })
  }

  const deliberation = await prisma.deliberation.create({
    data: {
      id,
      question,
      isPublic: true,
      inviteCode: crypto.randomBytes(6).toString('hex'),
      creatorId: user.id,
      votingTimeoutMs: 0,
      members: {
        create: {
          userId: user.id,
          role: 'CREATOR',
        },
      },
    },
  })

  return NextResponse.json({ message: 'Restored', id: deliberation.id, url: `/chants/${deliberation.id}` })
}
