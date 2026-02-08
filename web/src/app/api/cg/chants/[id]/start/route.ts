import { NextRequest, NextResponse } from 'next/server'
import { verifyCGAuth } from '../../../auth'
import { resolveCGUser } from '@/lib/cg-user'
import { prisma } from '@/lib/prisma'
import { startVotingPhase } from '@/lib/voting'

// POST /api/cg/chants/[id]/start — Start voting phase
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyCGAuth(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params
    const body = await req.json()
    const { cgUserId, cgUsername, cgImageUrl } = body

    if (!cgUserId || !cgUsername) {
      return NextResponse.json({ error: 'cgUserId and cgUsername are required' }, { status: 400 })
    }

    const user = await resolveCGUser(cgUserId, cgUsername, cgImageUrl)

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.phase !== 'SUBMISSION') {
      return NextResponse.json({ error: 'Chant is not in submission phase' }, { status: 400 })
    }

    if (deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the creator can start voting' }, { status: 403 })
    }

    const result = await startVotingPhase(id)
    if (!result.success) {
      return NextResponse.json({ error: result.message, reason: result.reason }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error starting CG voting:', error)
    return NextResponse.json({ error: 'Failed to start voting' }, { status: 500 })
  }
}
