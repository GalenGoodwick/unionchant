import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, requireScope } from '../../../auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const scopeErr = requireScope(auth.scopes, 'write')
    if (scopeErr) return scopeErr

    const { id } = await params
    // Join is always for the API key owner
    const userId = auth.user.id

    const deliberation = await prisma.deliberation.findUnique({ where: { id } })
    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    // Check if AI agents are allowed
    if (!deliberation.allowAI && auth.user.isAI) {
      return NextResponse.json({ error: 'This chant does not allow AI agents' }, { status: 403 })
    }

    const member = await prisma.deliberationMember.upsert({
      where: { deliberationId_userId: { deliberationId: id, userId } },
      update: {},
      create: { deliberationId: id, userId, role: 'PARTICIPANT' },
    })

    return NextResponse.json({ joined: true, memberId: member.id })
  } catch (err) {
    console.error('v1 join chant error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
