import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPluginToken, resolveEmbedPluginUser } from '@/lib/embed-plugin-auth'
import { createEmbedToken } from '@/lib/embed-auth'

// POST /api/embed/plugin/auth — Exchange a platform-signed plugin token for a 24h embed token
export async function POST(req: NextRequest) {
  try {
    const { pluginToken, communitySlug } = await req.json()

    if (!pluginToken || typeof pluginToken !== 'string') {
      return NextResponse.json({ error: 'pluginToken required' }, { status: 400 })
    }
    if (!communitySlug || typeof communitySlug !== 'string') {
      return NextResponse.json({ error: 'communitySlug required' }, { status: 400 })
    }

    // Look up community and its plugin secret
    const community = await prisma.community.findUnique({
      where: { slug: communitySlug },
      select: { id: true, pluginSecret: true, name: true },
    })

    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 })
    }

    if (!community.pluginSecret) {
      return NextResponse.json({ error: 'Plugin auth not configured for this community' }, { status: 400 })
    }

    // Verify the HMAC-signed token
    const payload = verifyPluginToken(pluginToken, community.pluginSecret)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired plugin token' }, { status: 401 })
    }

    // Find or create synthetic UC user for this external user
    const user = await resolveEmbedPluginUser(
      payload.userId,
      payload.username,
      payload.imageUrl || null,
      community.id,
    )

    // Create a 24h embed token
    const token = await createEmbedToken(user.id, community.id)

    return NextResponse.json({
      token,
      userId: user.id,
      userName: user.name,
    })
  } catch (err) {
    console.error('Plugin auth error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
