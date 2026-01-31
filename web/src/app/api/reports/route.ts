import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/admin'

// POST /api/reports - Submit a report
export async function POST(req: NextRequest) {
  try {
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

    const body = await req.json()
    const { targetType, targetId, reason, details } = body

    if (!targetType || !targetId || !reason) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const validTypes = ['COMMENT', 'IDEA', 'DELIBERATION', 'USER']
    const validReasons = ['SPAM', 'HARASSMENT', 'HATE_SPEECH', 'MISINFORMATION', 'INAPPROPRIATE', 'OTHER']

    if (!validTypes.includes(targetType)) {
      return NextResponse.json({ error: 'Invalid target type' }, { status: 400 })
    }

    if (!validReasons.includes(reason)) {
      return NextResponse.json({ error: 'Invalid reason' }, { status: 400 })
    }

    // Prevent duplicate reports from same user on same target
    const existing = await prisma.report.findFirst({
      where: {
        reporterId: user.id,
        targetType,
        targetId,
        status: 'PENDING',
      },
    })

    if (existing) {
      return NextResponse.json({ error: 'You have already reported this content' }, { status: 409 })
    }

    const report = await prisma.report.create({
      data: {
        reporterId: user.id,
        targetType,
        targetId,
        reason,
        details: details?.trim() || null,
      },
    })

    return NextResponse.json({ id: report.id, success: true }, { status: 201 })
  } catch (error) {
    console.error('Error creating report:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/reports - Get reports (admin only)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email || !(await isAdmin(session.user.email))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'PENDING'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = 20

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where: { status: status as any },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          reporter: {
            select: { id: true, name: true, email: true, image: true },
          },
          resolvedBy: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.report.count({ where: { status: status as any } }),
    ])

    return NextResponse.json({ reports, total, page, pages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('Error fetching reports:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
