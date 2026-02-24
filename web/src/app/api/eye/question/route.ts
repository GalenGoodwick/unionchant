import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// POST /api/eye/question — Submit a question to the Cradle brain
// The Cradle fetches pending questions from connected Eyes each session
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await req.json()
  const { question } = body

  if (!question?.trim()) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }

  if (question.trim().length > 1000) {
    return NextResponse.json({ error: 'question must be under 1,000 characters' }, { status: 400 })
  }

  const eye = await prisma.eye.findFirst({
    where: { ownerId: session.user.id, type: 'human' },
  })
  if (!eye) {
    return NextResponse.json({ error: 'No Eye found. Create one at /eye first.' }, { status: 404 })
  }

  // Store question in Eye state
  const state = (typeof eye.state === 'object' && eye.state !== null ? eye.state : {}) as Record<string, unknown>
  state.pendingQuestion = question.trim()
  state.questionAskedAt = new Date().toISOString()

  await prisma.eye.update({
    where: { id: eye.id },
    data: { state: state as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
  })

  return NextResponse.json({
    submitted: true,
    message: 'Question submitted. The brain will process it on the next session.',
  })
}

// GET /api/eye/question — Check if there's a pending question / get last answer
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const eye = await prisma.eye.findFirst({
    where: { ownerId: session.user.id, type: 'human' },
    select: { state: true },
  })
  if (!eye) {
    return NextResponse.json({ error: 'No Eye found' }, { status: 404 })
  }

  const state = (typeof eye.state === 'object' && eye.state !== null ? eye.state : {}) as Record<string, unknown>

  return NextResponse.json({
    pendingQuestion: state.pendingQuestion || null,
    questionAskedAt: state.questionAskedAt || null,
    lastAnswer: state.lastAnswer || null,
    lastAnswerAt: state.lastAnswerAt || null,
  })
}
