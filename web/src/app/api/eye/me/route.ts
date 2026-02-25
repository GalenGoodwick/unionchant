import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/eye/me — Toggle connected state, save SDK key
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const eye = await prisma.eye.findFirst({
    where: { ownerId: session.user.id, type: 'human' },
  })
  if (!eye) {
    return NextResponse.json({ error: 'No eye' }, { status: 404 })
  }

  const body = await req.json()

  // Handle SDK key save
  if (body.sdk) {
    const { provider, key, endpoint } = body.sdk as { provider?: string; key?: string; endpoint?: string }
    const state = (typeof eye.state === 'object' && eye.state !== null ? eye.state : {}) as Record<string, unknown>
    state.sdkProvider = provider || 'anthropic'
    if (key) state.sdkKeySet = true // Flag that a key exists — never return the key itself
    if (endpoint) state.sdkEndpoint = endpoint

    // Store the key in a separate field to avoid exposing it in state reads
    // For now, store in state with a private prefix (will move to encrypted storage later)
    if (key) state._sdkKey = key

    await prisma.eye.update({
      where: { id: eye.id },
      data: { state: state as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
    })

    return NextResponse.json({ saved: true, provider: state.sdkProvider })
  }

  const updated = await prisma.eye.update({
    where: { id: eye.id },
    data: { connected: body.connected ?? !eye.connected },
  })

  return NextResponse.json({ connected: updated.connected })
}

// GET /api/eye/me — Get current user's eye
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const eye = await prisma.eye.findFirst({
    where: { ownerId: session.user.id, type: 'human' },
  })

  if (!eye) {
    return NextResponse.json({ eye: null })
  }

  // Strip private keys from state before sending to client
  const rawState = (typeof eye.state === 'object' && eye.state !== null ? { ...eye.state as Record<string, unknown> } : {})
  delete rawState._sdkKey // Never expose the actual key

  return NextResponse.json({
    eye: {
      id: eye.id,
      name: eye.name,
      type: eye.type,
      connected: eye.connected,
      corpus: eye.corpus,
      state: rawState,
      lastSync: eye.lastSync,
    },
  })
}
