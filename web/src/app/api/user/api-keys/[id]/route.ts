import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// DELETE /api/user/api-keys/[id] — Revoke an API key
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Only delete keys owned by this user
    const key = await prisma.apiKey.findFirst({
      where: { id, userId: user.id },
    })
    if (!key) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }

    await prisma.apiKey.delete({ where: { id } })

    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('Delete API key error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
