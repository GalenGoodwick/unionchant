import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/deliberations/[id]/discord-info
// Returns discord community info for the claim banner (if user is the community creator)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(null)
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      select: {
        communityId: true,
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
            discordGuildId: true,
            discordInviteUrl: true,
            creatorId: true,
          },
        },
      },
    })

    if (!deliberation?.community?.discordGuildId) {
      return NextResponse.json(null)
    }

    // Only return info if the current user is the community creator
    if (deliberation.community.creatorId !== session.user.id) {
      return NextResponse.json(null)
    }

    return NextResponse.json({
      communityId: deliberation.community.id,
      communityName: deliberation.community.name,
      communitySlug: deliberation.community.slug,
      discordGuildId: deliberation.community.discordGuildId,
      discordInviteUrl: deliberation.community.discordInviteUrl,
    })
  } catch (error) {
    console.error('Error fetching discord info:', error)
    return NextResponse.json(null)
  }
}

// PATCH /api/deliberations/[id]/discord-info
// Update the discord invite URL for the community
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { discordInviteUrl } = body

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      select: {
        community: {
          select: { id: true, creatorId: true },
        },
      },
    })

    if (!deliberation?.community || deliberation.community.creatorId !== session.user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    await prisma.community.update({
      where: { id: deliberation.community.id },
      data: { discordInviteUrl: discordInviteUrl || null },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating discord invite URL:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
