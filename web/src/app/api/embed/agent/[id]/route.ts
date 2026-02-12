import { NextRequest, NextResponse } from 'next/server'
import { computeReputation } from '@/lib/reputation'

// GET /api/embed/agent/:id — Public reputation data for embed badge (no auth)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const result = await computeReputation(id)

    if (!result) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // CORS headers are added by middleware for /api/embed/ routes
    return NextResponse.json(result)
  } catch (err) {
    console.error('embed agent reputation error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
