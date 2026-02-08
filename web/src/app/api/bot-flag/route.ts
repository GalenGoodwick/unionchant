import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/bot-flag — Flag a user session as potential bot
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ ok: true }) // silent — don't reveal detection
    }

    const { reason } = await req.json()

    // Log the bot flag
    console.warn(`BOT FLAG: user=${session.user.id} reason=${reason}`)

    // Mark user as bot-flagged
    await prisma.user.update({
      where: { id: session.user.id },
      data: { botFlaggedAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true }) // always return ok — don't reveal errors
  }
}
