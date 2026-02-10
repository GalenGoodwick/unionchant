import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../../auth'

// POST /api/bot/chants/load — Feature removed (multi-server loading no longer available)
export async function POST(req: NextRequest) {
  const auth = verifyBotAuth(req)
  if (!auth.authenticated) return auth.response

  return NextResponse.json(
    { error: 'Multi-server chant loading is no longer available. Use invite codes to share chants.' },
    { status: 410 },
  )
}
