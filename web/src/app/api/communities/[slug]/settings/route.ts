import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCommunityMemberRole } from '@/lib/community'

// PATCH /api/communities/[slug]/settings - Update community settings
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const role = await getCommunityMemberRole(slug, user.id)
    if (role !== 'OWNER' && role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only owners and admins can update settings' }, { status: 403 })
    }

    const body = await req.json()
    const { name, description, isPublic, postingPermission } = body

    const community = await prisma.community.findUnique({
      where: { slug },
      select: { id: true },
    })
    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 })
    }

    // Validate postingPermission
    if (postingPermission !== undefined && postingPermission !== 'anyone' && postingPermission !== 'admins') {
      return NextResponse.json({ error: 'postingPermission must be "anyone" or "admins"' }, { status: 400 })
    }

    const updated = await prisma.community.update({
      where: { id: community.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(isPublic !== undefined && { isPublic }),
        ...(postingPermission !== undefined && { postingPermission }),
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating community settings:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
