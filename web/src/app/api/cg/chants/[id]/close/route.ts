import { NextRequest, NextResponse } from 'next/server'
import { verifyCGAuth } from '../../../auth'
import { resolveCGUser } from '@/lib/cg-user'
import { prisma } from '@/lib/prisma'
import { closeSubmissions } from '@/lib/voting'

// POST /api/cg/chants/[id]/close — Close submissions (continuous flow). Creator-only.
// Sets submissionsClosed=true, creates final cell from leftovers, lets existing cells finish naturally.
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

    if (deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the creator can close submissions' }, { status: 403 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Chant is not in voting phase' }, { status: 400 })
    }

    if (!deliberation.continuousFlow) {
      return NextResponse.json({ error: 'Continuous flow is not enabled' }, { status: 400 })
    }

    const result = await closeSubmissions(id)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('Error closing CG submissions:', error)
    return NextResponse.json({ error: 'Failed to close submissions' }, { status: 500 })
  }
}
