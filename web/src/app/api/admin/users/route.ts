import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminVerified } from '@/lib/admin'

// GET /api/admin/users - List users with search, filter, pagination
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') || ''
    const status = searchParams.get('status') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}

    // Status filter
    if (status && ['ACTIVE', 'BANNED', 'DELETED'].includes(status)) {
      where.status = status
    }

    // Search by name or email (case-insensitive)
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ]
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          image: true,
          createdAt: true,
          bannedAt: true,
          banReason: true,
          zipCode: true,
          _count: {
            select: {
              ideas: true,
              votes: true,
              comments: true,
              deliberationsCreated: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ])

    return NextResponse.json({ users, total })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}
