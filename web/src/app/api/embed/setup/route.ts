import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyApiKey } from '@/app/api/v1/auth'
import { prisma } from '@/lib/prisma'
import { createEmbedCommunity } from '@/lib/embed-user'

// POST /api/embed/setup — Register a platform for embedding
export async function POST(req: NextRequest) {
  const auth = await verifyApiKey(req)
  if (!auth.authenticated) return auth.response

  try {
    const { name, origin } = await req.json()

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'name required (min 2 chars)' }, { status: 400 })
    }
    if (!origin || typeof origin !== 'string') {
      return NextResponse.json({ error: 'origin required (e.g. https://your-site.com)' }, { status: 400 })
    }

    // Check if this origin already has a community
    const existing = await prisma.community.findFirst({
      where: { embedOrigin: origin },
      select: { id: true, slug: true, pluginSecret: true, name: true },
    })

    if (existing) {
      // Return existing setup — regenerate pluginSecret if it was never set
      let pluginSecret = existing.pluginSecret
      if (!pluginSecret) {
        pluginSecret = crypto.randomBytes(32).toString('hex')
        await prisma.community.update({
          where: { id: existing.id },
          data: { pluginSecret },
        })
      }

      return NextResponse.json({
        communitySlug: existing.slug,
        communityName: existing.name,
        pluginSecret,
        embedUrl: `https://unionchant.vercel.app/embed/${existing.slug}`,
        pluginAuthUrl: 'https://unionchant.vercel.app/api/embed/plugin/auth',
        oauthLoginUrl: `https://unionchant.vercel.app/embed/auth/login?community=${existing.slug}`,
      })
    }

    // Create new embed community
    const community = await createEmbedCommunity(name.trim(), origin, auth.user.id)

    // Generate and store plugin secret
    const pluginSecret = crypto.randomBytes(32).toString('hex')
    await prisma.community.update({
      where: { id: community.id },
      data: { pluginSecret },
    })

    return NextResponse.json({
      communitySlug: community.slug,
      communityName: community.name,
      pluginSecret,
      embedUrl: `https://unionchant.vercel.app/embed/${community.slug}`,
      pluginAuthUrl: 'https://unionchant.vercel.app/api/embed/plugin/auth',
      oauthLoginUrl: `https://unionchant.vercel.app/embed/auth/login?community=${community.slug}`,
    }, { status: 201 })
  } catch (err) {
    console.error('Embed setup error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/embed/setup — Retrieve existing embed config for authenticated user
export async function GET(req: NextRequest) {
  const auth = await verifyApiKey(req)
  if (!auth.authenticated) return auth.response

  try {
    // Find communities where this user is OWNER with embedOrigin set
    const communities = await prisma.community.findMany({
      where: {
        embedOrigin: { not: null },
        members: { some: { userId: auth.user.id, role: 'OWNER' } },
      },
      select: {
        slug: true,
        name: true,
        embedOrigin: true,
        pluginSecret: true,
        embedViewLevel: true,
        embedLogoUrl: true,
        embedAccentColor: true,
        embedDarkMode: true,
      },
    })

    return NextResponse.json({
      communities: communities.map(c => ({
        communitySlug: c.slug,
        communityName: c.name,
        origin: c.embedOrigin,
        pluginSecret: c.pluginSecret,
        embedUrl: `https://unionchant.vercel.app/embed/${c.slug}`,
        config: {
          viewLevel: c.embedViewLevel,
          logoUrl: c.embedLogoUrl,
          accentColor: c.embedAccentColor,
          darkMode: c.embedDarkMode,
        },
      })),
    })
  } catch (err) {
    console.error('Embed setup GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
