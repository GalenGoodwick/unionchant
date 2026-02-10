import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'

// GET /api/admin/webauthn/credentials — list admin's registered passkeys
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !(await isAdmin(session.user.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const credentials = await prisma.webAuthnCredential.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      deviceName: true,
      createdAt: true,
      lastUsedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(credentials)
}
