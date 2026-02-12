import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export default async function EmbedCommunityPage({
  params,
}: {
  params: Promise<{ communitySlug: string }>
}) {
  const { communitySlug } = await params

  const community = await prisma.community.findUnique({
    where: { slug: communitySlug },
    select: { id: true, name: true },
  })

  if (!community) notFound()

  const chants = await prisma.deliberation.findMany({
    where: { communityId: community.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      question: true,
      phase: true,
      createdAt: true,
      _count: { select: { members: true, ideas: true } },
    },
  })

  const phaseColors: Record<string, string> = {
    SUBMISSION: 'bg-accent/10 text-accent',
    VOTING: 'bg-warning/10 text-warning',
    COMPLETED: 'bg-success/10 text-success',
    ACCUMULATING: 'bg-purple/10 text-purple',
  }

  return (
    <div className="px-4 py-4">
      <h1 className="text-lg font-bold text-foreground mb-1">{community.name}</h1>
      <p className="text-xs text-muted mb-4">Active deliberations</p>

      {chants.length === 0 ? (
        <p className="text-sm text-muted text-center py-8">No chants yet.</p>
      ) : (
        <div className="space-y-2">
          {chants.map(chant => (
            <Link
              key={chant.id}
              href={`/embed/${communitySlug}/${chant.id}`}
              className="block p-3 bg-surface/90 border border-border rounded-lg hover:bg-surface-hover transition-colors"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground line-clamp-2">{chant.question}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${phaseColors[chant.phase] || 'bg-surface text-muted'}`}>
                      {chant.phase}
                    </span>
                    <span className="text-[10px] text-muted">{chant._count.members} members</span>
                    <span className="text-[10px] text-muted">{chant._count.ideas} ideas</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
