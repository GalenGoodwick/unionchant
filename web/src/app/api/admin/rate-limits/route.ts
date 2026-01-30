import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { invalidateRateLimitCache } from '@/lib/rate-limit'

// GET /api/admin/rate-limits - Get all rate limit configs
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    })

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const configs = await prisma.rateLimitConfig.findMany({
      orderBy: { endpoint: 'asc' },
    })

    // If no configs exist, seed with defaults
    if (configs.length === 0) {
      const defaults = [
        { endpoint: 'vote', maxRequests: 10, windowMs: 60000, keyType: 'userId', enabled: true },
        { endpoint: 'idea', maxRequests: 5, windowMs: 60000, keyType: 'userId', enabled: true },
        { endpoint: 'signup', maxRequests: 5, windowMs: 3600000, keyType: 'ip', enabled: true },
        { endpoint: 'deliberation', maxRequests: 3, windowMs: 3600000, keyType: 'userId', enabled: true },
      ]

      for (const d of defaults) {
        await prisma.rateLimitConfig.create({ data: d })
      }

      return NextResponse.json(defaults)
    }

    return NextResponse.json(configs)
  } catch (error) {
    console.error('Error fetching rate limits:', error)
    return NextResponse.json({ error: 'Failed to fetch rate limits' }, { status: 500 })
  }
}

// PUT /api/admin/rate-limits - Update a rate limit config
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    })

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { endpoint, maxRequests, windowMs, enabled } = await req.json()

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint is required' }, { status: 400 })
    }

    const config = await prisma.rateLimitConfig.upsert({
      where: { endpoint },
      update: {
        ...(maxRequests !== undefined && { maxRequests }),
        ...(windowMs !== undefined && { windowMs }),
        ...(enabled !== undefined && { enabled }),
      },
      create: {
        endpoint,
        maxRequests: maxRequests ?? 10,
        windowMs: windowMs ?? 60000,
        keyType: 'userId',
        enabled: enabled ?? true,
      },
    })

    // Invalidate the in-memory cache
    invalidateRateLimitCache()

    return NextResponse.json(config)
  } catch (error) {
    console.error('Error updating rate limit:', error)
    return NextResponse.json({ error: 'Failed to update rate limit' }, { status: 500 })
  }
}
