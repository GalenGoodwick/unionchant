import { NextRequest, NextResponse } from 'next/server'
import { saveScene, loadScene, listScenes, deleteScene } from '../store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/engine/scene?name=xxx  — load a scene
 * GET /api/engine/scene?action=list — list all scenes
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const name = searchParams.get('name')

  if (action === 'list') {
    return NextResponse.json({ scenes: listScenes() })
  }

  if (name) {
    const scene = loadScene(name)
    if (!scene) {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 })
    }
    return NextResponse.json({ scene })
  }

  return NextResponse.json({ error: 'name or action=list required' }, { status: 400 })
}

/**
 * POST /api/engine/scene
 * Body: { action: 'save', name: string, scene: SceneSnapshot }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (body.action === 'save' && body.name && body.scene) {
      saveScene(body.name, body.scene)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

/**
 * DELETE /api/engine/scene
 * Body: { name: string }
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    if (body.name) {
      const deleted = deleteScene(body.name)
      return NextResponse.json({ ok: true, deleted })
    }
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
