import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * POST /api/embed/cg/sign — Sign outgoing plugin requests for CGPluginLib
 *
 * CGPluginLib sends the request payload here before forwarding to CG.
 * We add a requestId and sign with PLUGIN_PRIVATE_KEY (RSA-SHA256).
 * CG verifies using our public key.
 */
export async function POST(req: NextRequest) {
  try {
    const privateKey = process.env.PLUGIN_PRIVATE_KEY
    if (!privateKey) {
      return NextResponse.json({ error: 'Plugin signing not configured' }, { status: 500 })
    }

    const body = await req.json()

    // Add requestId (matches CgPluginLibHost.signRequest format)
    const requestId = `request-${Date.now()}-${crypto.randomUUID()}`
    const requestPayload = { ...body, requestId }
    const requestString = JSON.stringify(requestPayload)

    // Sign with RSA-SHA256
    const sign = crypto.createSign('SHA256')
    sign.update(requestString)
    const signature = sign.sign(privateKey.replace(/\\n/g, '\n'), 'base64')

    return NextResponse.json({ request: requestString, signature })
  } catch (err) {
    console.error('CG sign error:', err)
    return NextResponse.json({ error: 'Signing failed' }, { status: 500 })
  }
}
