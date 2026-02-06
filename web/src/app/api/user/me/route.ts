import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/admin'

// GET /api/user/me - Get current user's profile
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use raw query to handle missing columns gracefully
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Auto-sync Stripe tier if subscription exists but tier is still "free"
    if (user.stripeSubscriptionId && (!user.subscriptionTier || user.subscriptionTier === 'free')) {
      try {
        const { getStripe, tierFromPriceId } = await import('@/lib/stripe')
        const subscription = await getStripe().subscriptions.retrieve(user.stripeSubscriptionId)
        if (subscription.status === 'active' || subscription.status === 'trialing') {
          const priceId = subscription.items.data[0]?.price.id || ''
          const tier = tierFromPriceId(priceId)
          await prisma.user.update({ where: { id: user.id }, data: { subscriptionTier: tier } })
          ;(user as any).subscriptionTier = tier
        }
      } catch (e) {
        console.error('[Stripe] Auto-sync tier failed:', e)
      }
    }

    // Get counts separately
    const [ideasCount, votesCount, commentsCount, deliberationsCreatedCount, membershipsCount, xpResult] = await Promise.all([
      prisma.idea.count({ where: { authorId: user.id } }),
      prisma.vote.count({ where: { userId: user.id } }),
      prisma.comment.count({ where: { userId: user.id } }),
      prisma.deliberation.count({ where: { creatorId: user.id } }),
      prisma.deliberationMember.count({ where: { userId: user.id } }),
      prisma.$queryRaw<{ total: bigint | null }[]>`
        SELECT COALESCE(SUM("xpPoints"), 0) + (SELECT COUNT(*) * 5 FROM "Idea" WHERE "authorId" = ${user.id}) as total
        FROM "Vote" WHERE "userId" = ${user.id}
      `,
    ])
    const totalXP = Number(xpResult[0]?.total || 0)
    const adminFlag = await isAdmin(session.user.email)

    return NextResponse.json({
      user: {
        id: user.id,
        isAdmin: adminFlag,
        name: user.name,
        email: user.email,
        image: user.image,
        bio: (user as any).bio || null,
        zipCode: (user as any).zipCode || null,
        role: user.role,
        status: user.status,
        onboardedAt: (user as any).onboardedAt || null,
        createdAt: user.createdAt,
        emailNotifications: user.emailNotifications,
        emailVoting: user.emailVoting,
        emailResults: user.emailResults,
        emailSocial: user.emailSocial,
        emailCommunity: user.emailCommunity,
        emailNews: user.emailNews,
        totalPredictions: user.totalPredictions,
        correctPredictions: user.correctPredictions,
        championPicks: user.championPicks,
        currentStreak: user.currentStreak,
        bestStreak: user.bestStreak,
        subscriptionTier: user.subscriptionTier || 'free',
        stripeSubscriptionId: user.stripeSubscriptionId || null,
        totalXP,
        stats: {
          ideas: ideasCount,
          votes: votesCount,
          comments: commentsCount,
          deliberationsCreated: deliberationsCreatedCount,
          memberships: membershipsCount,
        },
      },
    })
  } catch (error) {
    console.error('Error fetching current user:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
}

// PATCH /api/user/me - Update current user's profile
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, bio, zipCode, emailNotifications, emailVoting, emailResults, emailSocial, emailCommunity, emailNews } = await request.json()

    const updateData: Record<string, string | boolean | null> = {}

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 1) {
        return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
      }
      if (name.length > 50) {
        return NextResponse.json({ error: 'Name must be 50 characters or less' }, { status: 400 })
      }
      updateData.name = name.trim()
    }

    if (bio !== undefined) {
      if (bio === null || bio === '') {
        updateData.bio = null
      } else if (typeof bio === 'string') {
        if (bio.length > 200) {
          return NextResponse.json({ error: 'Bio must be 200 characters or less' }, { status: 400 })
        }
        updateData.bio = bio.trim()
      }
    }

    if (zipCode !== undefined) {
      if (zipCode === null || zipCode === '') {
        updateData.zipCode = null
      } else if (typeof zipCode === 'string') {
        if (zipCode.length > 10) {
          return NextResponse.json({ error: 'Zip code must be 10 characters or less' }, { status: 400 })
        }
        updateData.zipCode = zipCode.trim()
      }
    }

    if (emailNotifications !== undefined) {
      updateData.emailNotifications = Boolean(emailNotifications)
    }
    if (emailVoting !== undefined) {
      updateData.emailVoting = Boolean(emailVoting)
    }
    if (emailResults !== undefined) {
      updateData.emailResults = Boolean(emailResults)
    }
    if (emailSocial !== undefined) {
      updateData.emailSocial = Boolean(emailSocial)
    }
    if (emailCommunity !== undefined) {
      updateData.emailCommunity = Boolean(emailCommunity)
    }
    if (emailNews !== undefined) {
      updateData.emailNews = Boolean(emailNews)
    }

    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: updateData,
      select: {
        id: true,
        name: true,
        bio: true,
        emailNotifications: true,
        emailVoting: true,
        emailResults: true,
        emailSocial: true,
        emailCommunity: true,
        emailNews: true,
      },
    })

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
