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

    const { name, bio } = await request.json()

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

    // Update user name (always works)
    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: { name: name.trim() },
    })

    // Try to update bio and onboardedAt if columns exist
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET "bio" = $1, "onboardedAt" = $2 WHERE "id" = $3`,
        bio?.trim() || null,
        new Date(),
        user.id
      )
    } catch (rawErr) {
      // Columns might not exist yet - that's OK, just log it
      console.log('Could not update bio/onboardedAt (columns may not exist):', rawErr)
    }

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
