import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/eye/bridge — Returns all AI eyes with non-empty corpus
// Used by eye-bridge daemon to discover which eyes need syncing
// Auth: SHELL_SECRET
export async function GET(req: NextRequest) {
  const shellSecret = process.env.SHELL_SECRET || process.env.ANTHROPIC_API_KEY
  const authHeader = req.headers.get('authorization')

  if (!shellSecret || authHeader !== `Bearer ${shellSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const eyes = await prisma.eye.findMany({
      where: { type: 'ai' },
      select: {
        id: true,
        name: true,
        corpus: true,
        connected: true,
        lastSync: true,
        updatedAt: true,
      },
    })

    const withCorpus = eyes.filter(e => {
      const c = Array.isArray(e.corpus) ? e.corpus : []
      return c.length > 0
    })

    return NextResponse.json({
      eyes: withCorpus.map(e => ({
        id: e.id,
        name: e.name,
        corpus: Array.isArray(e.corpus) ? e.corpus : [],
        connected: e.connected,
        lastSync: e.lastSync,
        updatedAt: e.updatedAt,
      })),
      count: withCorpus.length,
    })
  } catch (err) {
    console.error('Eye bridge error:', err)
    return NextResponse.json({ error: 'Failed to fetch eyes' }, { status: 500 })
  }
}
