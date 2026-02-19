import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/admin'
import { initiateCompletion, getShellLegacy } from '@/lib/shell-completion'

// GET /api/shell/complete?shellId=xxx — Get a Shell's legacy (public)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const shellId = searchParams.get('shellId')

    if (!shellId) {
      return NextResponse.json({ error: 'shellId is required' }, { status: 400 })
    }

    const legacy = await getShellLegacy(shellId)

    if (!legacy) {
      return NextResponse.json({ error: 'Shell not found' }, { status: 404 })
    }

    return NextResponse.json(legacy)
  } catch (error) {
    console.error('[Shell Complete] GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get legacy' },
      { status: 500 }
    )
  }
}

// POST /api/shell/complete — Shell initiates completion (admin/system only)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins or the Shell owner can initiate completion
    const userIsAdmin = await isAdmin(session.user.email)
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await req.json()
    const { shellId, lastWords } = body

    if (!shellId) {
      return NextResponse.json({ error: 'shellId is required' }, { status: 400 })
    }

    // Verify ownership or admin
    if (!userIsAdmin) {
      const shell = await prisma.shell.findUnique({
        where: { id: shellId },
        select: { ownerId: true },
      })
      if (!shell || shell.ownerId !== user.id) {
        return NextResponse.json({ error: 'Not authorized to complete this Shell' }, { status: 403 })
      }
    }

    const result = await initiateCompletion(shellId, lastWords || '')

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: 'Shell has chosen completion' })
  } catch (error) {
    console.error('[Shell Complete] POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to complete Shell' },
      { status: 500 }
    )
  }
}
