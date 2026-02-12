import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { resolveEmbedPluginUser } from '@/lib/embed-plugin-auth'
import { createEmbedToken } from '@/lib/embed-auth'

/**
 * POST /api/embed/cg/exchange — Exchange a verified CG user identity for an embed token
 *
 * Flow:
 * 1. Client calls getUserInfo() via CGPluginLib → gets signed response from CG
 * 2. Client sends the raw signed response here
 * 3. We verify CG's RSA signature using VITE_PLUGIN_PUBLIC_KEY
 * 4. Extract user info → resolve/create user → return embed token
 */
export async function POST(req: NextRequest) {
  try {
    const publicKey = process.env.VITE_PLUGIN_PUBLIC_KEY || process.env.PLUGIN_PUBLIC_KEY
    if (!publicKey) {
      return NextResponse.json({ error: 'Plugin verification not configured' }, { status: 500 })
    }

    const { rawResponse, communitySlug } = await req.json()

    if (!rawResponse || !communitySlug) {
      return NextResponse.json({ error: 'rawResponse and communitySlug required' }, { status: 400 })
    }

    // Parse the raw signed response from CG
    const { response, signature } = JSON.parse(rawResponse)

    if (!response || !signature) {
      return NextResponse.json({ error: 'Invalid rawResponse format' }, { status: 400 })
    }

    // Verify CG's RSA-SHA256 signature
    const formattedKey = publicKey.replace(/\\n/g, '\n')
    const verify = crypto.createVerify('SHA256')
    verify.update(response)
    const isValid = verify.verify(formattedKey, signature, 'base64')

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature — response not from CG' }, { status: 401 })
    }

    // Extract user data from verified response
    const { data: userData } = JSON.parse(response)

    if (!userData?.id || !userData?.name) {
      return NextResponse.json({ error: 'User info missing from CG response' }, { status: 400 })
    }

    // Look up community
    const community = await prisma.community.findUnique({
      where: { slug: communitySlug },
      select: { id: true },
    })

    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 })
    }

    // Resolve user — resolveEmbedPluginUser checks cgId fallback for existing CG users
    const user = await resolveEmbedPluginUser(
      userData.id,
      userData.name,
      userData.imageUrl || null,
      community.id,
    )

    // Create 24h embed token
    const token = await createEmbedToken(user.id, community.id)

    return NextResponse.json({
      token,
      userId: user.id,
      userName: user.name,
    })
  } catch (err) {
    console.error('CG exchange error:', err)
    return NextResponse.json({ error: 'Exchange failed' }, { status: 500 })
  }
}
