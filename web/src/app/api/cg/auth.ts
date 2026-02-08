import { NextRequest, NextResponse } from 'next/server'

export function verifyCGAuth(req: NextRequest): { authenticated: true } | { authenticated: false; response: NextResponse } {
  const cgSecret = process.env.CG_PLUGIN_SECRET
  if (!cgSecret) {
    return {
      authenticated: false,
      response: NextResponse.json({ error: 'Server misconfigured: CG_PLUGIN_SECRET not set' }, { status: 500 }),
    }
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cgSecret}`) {
    return {
      authenticated: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  return { authenticated: true }
}
