import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// DELETE /api/user - Delete own account (soft delete for GDPR)
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Soft delete - mark as deleted but preserve data for integrity
    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        // Clear personal info but keep ID for referential integrity
        name: null,
        image: null,
        // Keep email for preventing re-registration abuse, but could hash it
      },
    })

    // Delete auth sessions and accounts so they can't log in
    await prisma.session.deleteMany({
      where: { userId: user.id },
    })

    await prisma.account.deleteMany({
      where: { userId: user.id },
    })

    // Delete push subscriptions
    await prisma.pushSubscription.deleteMany({
      where: { userId: user.id },
    })

    // Delete watches
    await prisma.watch.deleteMany({
      where: { userId: user.id },
    })

    return NextResponse.json({ success: true, message: 'Account deleted' })
  } catch (error) {
    console.error('Error deleting account:', error)
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }
}
