import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import FieldEngine from '@/app/engine/FieldEngine'

interface SpacePageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: SpacePageProps) {
  const { slug } = await params
  const space = await prisma.playerSpace.findUnique({
    where: { slug },
    select: { name: true, description: true, owner: { select: { name: true } } },
  })

  if (!space) return { title: 'Space Not Found' }

  return {
    title: `${space.name} — ${space.owner?.name || 'Unknown'}`,
    description: space.description || `A programmable space by ${space.owner?.name}`,
  }
}

export default async function SpacePage({ params }: SpacePageProps) {
  const { slug } = await params

  const space = await prisma.playerSpace.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      ownerId: true,
      isPublic: true,
      owner: { select: { id: true, name: true } },
    },
  })

  if (!space) notFound()

  // Check visibility
  const session = await getServerSession(authOptions)
  const userId = session?.user?.email
    ? (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id
    : null

  if (!space.isPublic && userId !== space.ownerId) notFound()

  const isOwner = userId === space.ownerId

  return <FieldEngine spaceId={space.id} spaceSlug={space.slug} isOwner={isOwner} />
}
