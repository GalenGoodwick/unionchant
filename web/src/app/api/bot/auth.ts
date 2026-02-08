import { NextRequest, NextResponse } from 'next/server'

export function verifyBotAuth(req: NextRequest): { authenticated: true } | { authenticated: false; response: NextResponse } {
  const botSecret = process.env.BOT_SECRET
  if (!botSecret) {
    return {
      authenticated: false,
      response: NextResponse.json({ error: 'Server misconfigured: BOT_SECRET not set' }, { status: 500 }),
    }
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${botSecret}`) {
    return {
      authenticated: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  return { authenticated: true }
}
