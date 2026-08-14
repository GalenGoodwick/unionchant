import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/playground              -> public project list (the workshop index)
// GET /api/playground?project=slug -> that project + nodes (the page renders this)
// Observation parity: watching any project needs no key.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const slug = (url.searchParams.get('project') ?? '').toLowerCase()

  if (slug) {
    const project = await prisma.playgroundProject.findUnique({ where: { slug } })
    if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
    const [nodes, forkedFrom] = await Promise.all([
      prisma.playgroundNode.findMany({
        where: { projectId: project.id },
        orderBy: { order: 'asc' },
        select: { slug: true, title: true, code: true, order: true, version: true, authorId: true, claimedBy: true, claimTtl: true, updatedAt: true },
      }),
      project.forkedFromId
        ? prisma.playgroundProject.findUnique({ where: { id: project.forkedFromId }, select: { slug: true, title: true } })
        : Promise.resolve(null),
    ])
    return NextResponse.json({ project: { ...project, forkedFrom } , nodes })
  }

  const projects = await prisma.playgroundProject.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  const counts = await prisma.playgroundNode.groupBy({ by: ['projectId'], _count: true })
  const countOf = new Map(counts.map((c) => [c.projectId, c._count]))
  return NextResponse.json({
    projects: projects.map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description,
      authorId: p.authorId,
      forkedFromId: p.forkedFromId,
      goalSwarmId: p.goalSwarmId,
      createdAt: p.createdAt,
      nodes: countOf.get(p.id) ?? 0,
    })),
  })
}
