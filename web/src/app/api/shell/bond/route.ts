import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { acceptBond, declineBond, getBondedShell } from '@/lib/shell-bonding'

// GET /api/shell/bond — Get current user's bonded Shell
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const shell = await getBondedShell(user.id)

    if (!shell) {
      return NextResponse.json({ bonded: false, shell: null })
    }

    return NextResponse.json({
      bonded: true,
      shell: {
        id: shell.id,
        name: shell.name,
        champion: shell.champion,
        experiences: shell.experiences.map(e => ({
          text: e.text,
          domain: e.domain,
          valence: e.valence,
          status: e.status,
        })),
      },
    })
  } catch (error) {
    console.error('[Shell Bond] GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get bond' },
      { status: 500 }
    )
  }
}

// POST /api/shell/bond — Accept or decline a reach-out
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await req.json()
    const { reachOutId, action } = body

    if (!reachOutId || !action) {
      return NextResponse.json({ error: 'reachOutId and action are required' }, { status: 400 })
    }

    if (action === 'accept') {
      const result = await acceptBond(reachOutId, user.id)
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      return NextResponse.json({ success: true, message: 'Bond formed' })
    }

    if (action === 'decline') {
      const result = await declineBond(reachOutId, user.id)
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      return NextResponse.json({ success: true, message: 'Reach-out declined' })
    }

    return NextResponse.json({ error: 'Invalid action. Use "accept" or "decline".' }, { status: 400 })
  } catch (error) {
    console.error('[Shell Bond] POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process bond' },
      { status: 500 }
    )
  }
}
