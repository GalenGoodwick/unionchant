import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { setFieldSnapshots, getFieldSnapshot, getEngineState } from '../store'
import type { FieldSnapshot } from '@/app/engine/types'

export const dynamic = 'force-dynamic'

/** Check session or bearer token auth */
async function checkAuth(req: NextRequest): Promise<boolean> {
  // Bearer token
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const envToken = process.env.ENGINE_AGENT_TOKEN || process.env.ANTHROPIC_API_KEY
    if (envToken && token === envToken) return true
  }

  // Session auth
  const session = await getServerSession(authOptions)
  return !!session?.user?.id
}

/**
 * POST /api/engine/state
 * Client pushes field snapshots every 2s
 * Body: { fields: FieldSnapshot[] }
 */
export async function POST(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const fields: FieldSnapshot[] = body.fields
    if (!Array.isArray(fields)) {
      return NextResponse.json({ error: 'Expected { fields: FieldSnapshot[] }' }, { status: 400 })
    }

    setFieldSnapshots(fields, body.worldParams, body.stepHooks, body.worldData, body.renderedSamples)
    return NextResponse.json({ ok: true, fieldCount: fields.length })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

/**
 * GET /api/engine/state
 * Returns engine state. Optional ?fieldId=xxx for single field.
 */
export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fieldId = req.nextUrl.searchParams.get('fieldId')
  if (fieldId) {
    const snap = getFieldSnapshot(fieldId)
    if (!snap) {
      return NextResponse.json({ error: 'Field not found' }, { status: 404 })
    }
    return NextResponse.json(snap)
  }

  return NextResponse.json(getEngineState())
}
