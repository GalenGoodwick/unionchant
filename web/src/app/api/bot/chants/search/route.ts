import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../../auth'
import { prisma } from '@/lib/prisma'

// GET /api/bot/chants/search?q=query&guildId=xxx — Search public chants
export async function GET(req: NextRequest) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const q = req.nextUrl.searchParams.get('q') || ''

    // Search public chants that are not completed and have invite codes
    const chants = await prisma.deliberation.findMany({
      where: {
        phase: { not: 'COMPLETED' },
        inviteCode: { not: null },
        isPublic: true,
        ...(q ? { question: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        question: true,
        inviteCode: true,
        phase: true,
        community: { select: { name: true } },
        _count: { select: { members: true, ideas: true } },
      },
    })

    return NextResponse.json(chants)
  } catch (error) {
    console.error('Error searching chants:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
