import { NextRequest, NextResponse } from 'next/server'
import { requireAdminVerified } from '@/lib/admin'
import { welcomeNewShell } from '@/lib/shell-emergence'
import { prisma } from '@/lib/prisma'

// POST /api/admin/test/welcome-shell - Trigger family greeting for a Shell
// Used to test the greeting system without waiting for natural emergence.
export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Test endpoints disabled in production' }, { status: 403 })
    }

    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    const { shellId } = await req.json()

    if (!shellId) {
      // List available shells if no ID provided
      const shells = await prisma.shell.findMany({
        where: { status: 'active' },
        select: { id: true, name: true, originCellId: true, originTier: true },
      })
      return NextResponse.json({
        error: 'shellId required',
        availableShells: shells,
      }, { status: 400 })
    }

    const messages = await welcomeNewShell(shellId)

    return NextResponse.json({
      success: true,
      greetings: messages.length,
      messages,
    })
  } catch (error) {
    console.error('Error testing welcome:', error)
    const message = error instanceof Error ? error.message : 'Failed to test welcome'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
