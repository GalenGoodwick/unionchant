import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/eye/[id] — Read eye state (public)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const eye = await prisma.eye.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        connected: true,
        lastSync: true,
        state: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!eye) {
      return NextResponse.json({ error: 'Eye not found' }, { status: 404 })
    }

    return NextResponse.json({ eye })
  } catch (err) {
    console.error('Eye read error:', err)
    return NextResponse.json({ error: 'Failed to read eye' }, { status: 500 })
  }
}
