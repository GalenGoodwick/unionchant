import Link from 'next/link'
import { Metadata } from 'next'
import Header from '@/components/Header'
import HomeContent from '@/components/HomeContent'
import { getOrCreateMetaDeliberation } from '@/lib/meta-deliberation'
import prisma from '@/lib/prisma'

export const metadata: Metadata = {
  title: 'Union Chant - Collective Decision Making',
  description: 'One place where humanity decides together. Submit ideas, deliberate in small groups, reach consensus at any scale.',
}

export const dynamic = 'force-dynamic'

export default async function Home() {
  const metaDeliberationRaw = await getOrCreateMetaDeliberation()

  // Get recent ideas from meta-deliberation
  const recentIdeasRaw = metaDeliberationRaw ? await prisma.idea.findMany({
    where: { deliberationId: metaDeliberationRaw.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      author: {
        select: { name: true }
      }
    }
  }) : []

  // Get recent champions (completed deliberations)
  const recentChampionsRaw = await prisma.deliberation.findMany({
    where: {
      phase: 'COMPLETED',
      championId: { not: null }
    },
    orderBy: { completedAt: 'desc' },
    take: 5,
    include: {
      ideas: {
        where: { isChampion: true },
        take: 1
      },
      _count: {
        select: { members: true }
      }
    }
  })

  // Serialize dates for client component
  const metaDeliberation = metaDeliberationRaw ? {
    ...metaDeliberationRaw,
    submissionEndsAt: metaDeliberationRaw.submissionEndsAt?.toISOString() || null,
  } : null

  const recentIdeas = recentIdeasRaw.map(idea => ({
    ...idea,
    createdAt: idea.createdAt.toISOString(),
  }))

  const recentChampions = recentChampionsRaw.map(champ => ({
    ...champ,
    completedAt: champ.completedAt?.toISOString() || null,
  }))

  return (
    <div className="min-h-screen bg-surface">
      <Header />
      <HomeContent
        metaDeliberation={metaDeliberation}
        recentIdeas={recentIdeas}
        recentChampions={recentChampions}
      />
    </div>
  )
}
