import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyCaptcha } from '@/lib/captcha'
import { isAdmin } from '@/lib/admin'

// GET /api/communities - Browse public communities
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
    const offset = (page - 1) * limit

    const where = {
      isPublic: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { description: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [communities, total] = await Promise.all([
      prisma.community.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          creator: { select: { name: true, status: true } },
          _count: { select: { members: true, deliberations: true } },
        },
      }),
      prisma.community.count({ where }),
    ])

    return NextResponse.json({
      communities,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Error fetching communities:', error)
    return NextResponse.json({ error: 'Failed to fetch communities' }, { status: 500 })
  }
}

// POST /api/communities - Create community
export async function POST(req: NextRequest) {
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

    const body = await req.json()
    const { name, slug, description, isPublic = true, captchaToken } = body

    // Non-admins can only create 1 community
    const admin = await isAdmin(session.user.email)
    if (!admin) {
      const existingCount = await prisma.community.count({
        where: { creatorId: user.id },
      })
      if (existingCount >= 1) {
        return NextResponse.json({ error: 'You can only create one community. Contact an admin for more.' }, { status: 400 })
      }
    }

    const captchaResult = await verifyCaptcha(captchaToken, user.id)
    if (!captchaResult.success) {
      return NextResponse.json({ error: captchaResult.error || 'CAPTCHA verification failed' }, { status: 400 })
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!slug?.trim()) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 })
    }

    // Validate slug format
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    if (!slugRegex.test(slug)) {
      return NextResponse.json({ error: 'Slug must be lowercase letters, numbers, and hyphens only' }, { status: 400 })
    }

    if (slug.length < 3 || slug.length > 50) {
      return NextResponse.json({ error: 'Slug must be 3-50 characters' }, { status: 400 })
    }

    // Check slug uniqueness
    const existing = await prisma.community.findUnique({ where: { slug } })
    if (existing) {
      return NextResponse.json({ error: 'This slug is already taken' }, { status: 400 })
    }

    const inviteCode = Math.random().toString(36).substring(2, 10)

    const community = await prisma.$transaction(async (tx) => {
      const created = await tx.community.create({
        data: {
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          description: description?.trim() || null,
          isPublic,
          inviteCode,
          creatorId: user.id,
        },
      })

      await tx.communityMember.create({
        data: {
          communityId: created.id,
          userId: user.id,
          role: 'OWNER',
        },
      })

      return created
    })

    return NextResponse.json(community, { status: 201 })
  } catch (error) {
    console.error('Error creating community:', error)
    // Surface the actual error to help debug
    if (error instanceof Error) {
      // Check for known Prisma errors
      const prismaError = error as Error & { code?: string; meta?: Record<string, unknown> }
      if (prismaError.code === 'P2002') {
        const target = (prismaError.meta?.target as string[])?.join(', ') || 'field'
        return NextResponse.json({ error: `A community with this ${target} already exists` }, { status: 400 })
      }
      return NextResponse.json({ error: error.message || 'Failed to create community' }, { status: 500 })
    }
    return NextResponse.json({ error: 'Failed to create community' }, { status: 500 })
  }
}
