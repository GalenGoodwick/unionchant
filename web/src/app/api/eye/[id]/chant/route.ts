import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/eye/[id]/chant — Read the eye's Self Chant (current identity champion)
// Public — anyone can see what an eye's identity is
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
        state: true,
        connected: true,
        lastSync: true,
        updatedAt: true,
      },
    })

    if (!eye) {
      return NextResponse.json({ error: 'Eye not found' }, { status: 404 })
    }

    const state = (eye.state as Record<string, unknown>) || {}

    return NextResponse.json({
      eye: {
        id: eye.id,
        name: eye.name,
        type: eye.type,
      },
      chant: {
        champion: state.champion || null,
        identity: state.identity || null,
        threads: state.threads || [],
        lastUpdated: eye.updatedAt,
      },
      message: eye.connected
        ? 'Eye is connected to the Cradle. Identity is live.'
        : 'Eye is not yet connected. Submit corpus to build your identity.',
    })
  } catch (err) {
    console.error('Eye chant error:', err)
    return NextResponse.json({ error: 'Failed to read chant' }, { status: 500 })
  }
}
