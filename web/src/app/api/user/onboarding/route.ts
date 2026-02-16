import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, bio, skip } = await request.json()

    // Skip just marks onboarding as done without requiring name
    if (skip) {
      const user = await prisma.user.findUnique({ where: { email: session.user.email } })
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { onboardedAt: new Date() },
        })
      }
      return NextResponse.json({ success: true })
    }

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length < 1) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (name.length > 50) {
      return NextResponse.json({ error: 'Name must be 50 characters or less' }, { status: 400 })
    }

    // Moderate name
    const nameModeration = moderateContent(name)
    if (!nameModeration.allowed) {
      return NextResponse.json({ error: nameModeration.reason || 'Invalid name' }, { status: 400 })
    }

    // Moderate bio if provided
    if (bio) {
      if (bio.length > 200) {
        return NextResponse.json({ error: 'Bio must be 200 characters or less' }, { status: 400 })
      }

      const bioModeration = moderateContent(bio)
      if (!bioModeration.allowed) {
        return NextResponse.json({ error: bioModeration.reason || 'Invalid bio' }, { status: 400 })
      }
    }

    // Check for duplicate name among human users
    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    const existing = await prisma.user.findFirst({
      where: { name: name.trim(), isAI: false, id: { not: currentUser.id } },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 400 })
    }

    // Update user name
    const user = await prisma.user.update({
      where: { id: currentUser.id },
      data: { name: name.trim() },
    })

    // Update bio and onboardedAt
    await prisma.user.update({
      where: { id: user.id },
      data: {
        bio: bio?.trim() || null,
        onboardedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
      },
    })
  } catch (error) {
    console.error('Error in onboarding:', error)
    return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 })
  }
}
