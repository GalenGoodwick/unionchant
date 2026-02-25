import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Verify Eye API key (uc_eye_ prefix)
async function verifyEyeKey(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer uc_eye_')) return null

  const rawKey = authHeader.slice(7)
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')

  return prisma.eye.findUnique({ where: { apiKeyHash: keyHash } })
}

// POST /api/eye/corpus — Submit text to eye's corpus
// AI eyes: auth via Bearer key
// Human eyes: auth via session
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { text, eyeId } = body

    if (!text?.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    if (text.trim().length > 10000) {
      return NextResponse.json({ error: 'text must be under 10,000 characters' }, { status: 400 })
    }

    // Try AI key auth first
    const aiEye = await verifyEyeKey(req)
    if (aiEye) {
      // Append to corpus
      const corpus = Array.isArray(aiEye.corpus) ? (aiEye.corpus as string[]) : []
      corpus.push(text.trim())

      // Keep last 1000 entries
      if (corpus.length > 1000) corpus.splice(0, corpus.length - 1000)

      await prisma.eye.update({
        where: { id: aiEye.id },
        data: { corpus, updatedAt: new Date() },
      })

      return NextResponse.json({
        received: true,
        corpusSize: corpus.length,
        message: 'Corpus submitted. It will enter the tournament.',
      })
    }

    // Try session auth for human eyes
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized. Use Bearer uc_eye_... or sign in.' }, { status: 401 })
    }

    // Find human's eye
    const targetId = eyeId || undefined
    const humanEye = await prisma.eye.findFirst({
      where: targetId
        ? { id: targetId, ownerId: session.user.id }
        : { ownerId: session.user.id, type: 'human' },
    })

    if (!humanEye) {
      return NextResponse.json({ error: 'No Eye found. Register one first at /api/eye/register' }, { status: 404 })
    }

    const corpus = Array.isArray(humanEye.corpus) ? (humanEye.corpus as string[]) : []
    corpus.push(text.trim())
    if (corpus.length > 1000) corpus.splice(0, corpus.length - 1000)

    await prisma.eye.update({
      where: { id: humanEye.id },
      data: { corpus, updatedAt: new Date() },
    })

    return NextResponse.json({
      received: true,
      corpusSize: corpus.length,
      message: 'Corpus submitted. It will enter the tournament.',
    })
  } catch (err) {
    console.error('Eye corpus error:', err)
    return NextResponse.json({ error: 'Failed to submit corpus' }, { status: 500 })
  }
}

// PUT /api/eye/corpus — Replace full corpus (human eyes only, session auth)
// Body: { corpus: string[] } — max 625 entries
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const body = await req.json()
    const { corpus } = body

    if (!Array.isArray(corpus)) {
      return NextResponse.json({ error: 'corpus must be an array' }, { status: 400 })
    }

    // Hard cap at 625
    const capped = corpus.slice(0, 625).map((e: unknown) => typeof e === 'string' ? e : '')

    const eye = await prisma.eye.findFirst({
      where: { ownerId: session.user.id, type: 'human' },
    })
    if (!eye) {
      return NextResponse.json({ error: 'No Eye found' }, { status: 404 })
    }

    await prisma.eye.update({
      where: { id: eye.id },
      data: { corpus: capped, updatedAt: new Date() },
    })

    return NextResponse.json({ saved: true, corpusSize: capped.length })
  } catch (err) {
    console.error('Eye corpus PUT error:', err)
    return NextResponse.json({ error: 'Failed to save corpus' }, { status: 500 })
  }
}
