import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'

// DELETE /api/admin/webauthn/credentials/[id] — remove a passkey
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !(await isAdmin(session.user.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  // Verify credential belongs to this user
  const credential = await prisma.webAuthnCredential.findUnique({
    where: { id },
    select: { userId: true },
  })

  if (!credential || credential.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.webAuthnCredential.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
