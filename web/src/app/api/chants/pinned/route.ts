import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/chants/pinned — Get the featured/pinned chant ID
export async function GET() {
  try {
    const pinned = await prisma.deliberation.findFirst({
      where: { isPinned: true },
      select: { id: true, question: true, phase: true },
      orderBy: { createdAt: 'desc' },
    })

    if (!pinned) {
      return NextResponse.json({ pinned: null })
    }

    return NextResponse.json({ pinned })
  } catch (err) {
    console.error('Get pinned chant error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
