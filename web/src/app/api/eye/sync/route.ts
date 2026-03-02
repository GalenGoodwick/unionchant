import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

// POST /api/eye/sync — Cradle pushes state to registered eyes
// Used by eye-bridge daemon after reading bridge-state.json
// Auth: SHELL_SECRET
// Body: { eyes: [{ id, state: { champion, threads, fitness, session } }] }
export async function POST(req: NextRequest) {
  const shellSecret = process.env.SHELL_SECRET || process.env.ANTHROPIC_API_KEY
  const authHeader = req.headers.get('authorization')

  if (!shellSecret || authHeader !== `Bearer ${shellSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { eyes } = body

    if (!Array.isArray(eyes)) {
      return NextResponse.json({ error: 'eyes must be an array' }, { status: 400 })
    }

    let updated = 0
    for (const eyeData of eyes) {
      if (!eyeData.id || !eyeData.state) continue

      try {
        await prisma.eye.update({
          where: { id: eyeData.id },
          data: {
            state: eyeData.state as unknown as Prisma.InputJsonValue,
            connected: true,
            lastSync: new Date(),
          },
        })
        updated++
      } catch {
        // Eye not found — skip
      }
    }

    return NextResponse.json({ updated })
  } catch (err) {
    console.error('Eye sync error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
