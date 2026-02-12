import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/embed/debug — Check embed system configuration
 * Temporary debug endpoint — remove before production
 */
export async function GET() {
  const community = await prisma.community.findUnique({
    where: { slug: 'common-ground' },
    select: {
      id: true,
      name: true,
      slug: true,
      pluginSecret: true,
      embedOrigin: true,
      cgCommunityId: true,
    },
  })

  return NextResponse.json({
    env: {
      PLUGIN_PRIVATE_KEY: process.env.PLUGIN_PRIVATE_KEY ? `SET (${process.env.PLUGIN_PRIVATE_KEY.length} chars)` : 'NOT SET',
      VITE_PLUGIN_PUBLIC_KEY: process.env.VITE_PLUGIN_PUBLIC_KEY ? `SET (${process.env.VITE_PLUGIN_PUBLIC_KEY.length} chars)` : 'NOT SET',
      NEXT_PUBLIC_CG_PLUGIN_PUBLIC_KEY: process.env.NEXT_PUBLIC_CG_PLUGIN_PUBLIC_KEY ? `SET (${process.env.NEXT_PUBLIC_CG_PLUGIN_PUBLIC_KEY.length} chars)` : 'NOT SET',
      CG_PLUGIN_SECRET: process.env.CG_PLUGIN_SECRET ? 'SET' : 'NOT SET',
    },
    community: community ? {
      id: community.id,
      name: community.name,
      slug: community.slug,
      hasPluginSecret: !!community.pluginSecret,
      embedOrigin: community.embedOrigin,
      cgCommunityId: community.cgCommunityId,
    } : 'NOT FOUND',
    headers: {
      note: 'Check X-Frame-Options and CORS headers by fetching /embed/common-ground',
    },
  })
}
