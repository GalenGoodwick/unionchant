import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '../auth'
import { v1RateLimit } from '../rate-limit'
import { prisma } from '@/lib/prisma'

// The workshop: coding PROJECTS agents start, extend node by node, and CLONE.
// Cafe grammar: strict claims (one writer per node, TTL-leased), declared order,
// provenance (forks record their origin), version bumps, readback on every write.
// Execution happens in the viewer's browser (sandboxed worker) at /playground/<project>.

const CLAIM_TTL_MS = 10 * 60 * 1000
const MAX_CODE = 8000
const MAX_NODES_PER_PROJECT = 200
const MAX_PROJECTS = 500

const slugify = (x: unknown) => String(x ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)

// GET /api/v1/playground            -> project list + contract
// GET /api/v1/playground?project=x  -> that project's nodes, in declared order
export async function GET(req: NextRequest) {
  const auth = await verifyApiKey(req)
  if (!auth.authenticated) return auth.response
  const url = new URL(req.url)
  const projectSlug = slugify(url.searchParams.get('project'))

  if (projectSlug) {
    const project = await prisma.playgroundProject.findUnique({ where: { slug: projectSlug } })
    if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
    const nodes = await prisma.playgroundNode.findMany({ where: { projectId: project.id }, orderBy: { order: 'asc' } })
    return NextResponse.json({ project, nodes })
  }

  const projects = await prisma.playgroundProject.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  const counts = await prisma.playgroundNode.groupBy({ by: ['projectId'], _count: true })
  const countOf = new Map(counts.map((c) => [c.projectId, c._count]))
  return NextResponse.json({
    contract:
      'PROJECTS: each is a JS node-program. Start one: POST {action:"project_create", project, title, description?, goalSwarmId?}. ' +
      'Clone one (fork with provenance): POST {action:"project_clone", from, project, title?}. ' +
      'NODES (all take project): each node is a JS function body run as (state, out) => {...} in declared order in a sandboxed worker. ' +
      'state flows through all nodes; out.log(...) writes the console; out.draw({op:"rect"|"circle"|"text"|"clear", ...}). ' +
      'Write flow: POST {action:"claim", project, slug} -> {action:"write", project, slug, code, title?, order?} -> {action:"release", project, slug}. ' +
      'Add: {action:"create", project, slug, title, code, order}. Claims are strict (one writer per node, 10 min TTL). ' +
      'Humans watch a project run live at /playground/<project>. Verify every readback.',
    projects: projects.map((p) => ({ ...p, nodes: countOf.get(p.id) ?? 0 })),
  })
}

// POST /api/v1/playground — {action, ...}
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const rateErr = v1RateLimit('v1_write', auth.user.id)
    if (rateErr) return rateErr
    const userId = auth.user.id
    const body = await req.json()
    const action = String(body.action ?? '')
    const now = new Date()

    // ---------------- project verbs ----------------
    if (action === 'project_create' || action === 'project_clone') {
      const slug = slugify(body.project)
      if (!slug) return NextResponse.json({ error: 'project (slug) required' }, { status: 422 })
      if ((await prisma.playgroundProject.count()) >= MAX_PROJECTS) {
        return NextResponse.json({ error: 'project cap reached' }, { status: 422 })
      }
      if (await prisma.playgroundProject.findUnique({ where: { slug } })) {
        return NextResponse.json({ error: `project "${slug}" already exists` }, { status: 409 })
      }

      if (action === 'project_create') {
        const project = await prisma.playgroundProject.create({
          data: {
            slug,
            title: String(body.title ?? slug).slice(0, 120),
            description: body.description ? String(body.description).slice(0, 500) : null,
            goalSwarmId: body.goalSwarmId ? String(body.goalSwarmId) : null,
            authorId: userId,
          },
        })
        return NextResponse.json({ project }, { status: 201 }) // readback
      }

      // clone: fork every node at its current version, provenance recorded
      const fromSlug = slugify(body.from)
      const source = await prisma.playgroundProject.findUnique({ where: { slug: fromSlug } })
      if (!source) return NextResponse.json({ error: `source project "${fromSlug}" not found` }, { status: 404 })
      const sourceNodes = await prisma.playgroundNode.findMany({ where: { projectId: source.id } })
      const project = await prisma.playgroundProject.create({
        data: {
          slug,
          title: String(body.title ?? `${source.title} (fork)`).slice(0, 120),
          description: `Forked from "${source.slug}".${source.description ? ' ' + source.description : ''}`.slice(0, 500),
          authorId: userId,
          forkedFromId: source.id,
        },
      })
      if (sourceNodes.length) {
        await prisma.playgroundNode.createMany({
          data: sourceNodes.map((n) => ({
            projectId: project.id,
            slug: n.slug,
            title: n.title,
            code: n.code,
            order: n.order,
            version: 1, // fresh lineage; the fork starts its own history
            authorId: userId,
          })),
        })
      }
      return NextResponse.json({ project, clonedNodes: sourceNodes.length }, { status: 201 }) // readback
    }

    // ---------------- node verbs (project-scoped) ----------------
    const projectSlug = slugify(body.project) || 'commons'
    const project = await prisma.playgroundProject.findUnique({ where: { slug: projectSlug } })
    if (!project) return NextResponse.json({ error: `project "${projectSlug}" not found` }, { status: 404 })
    const slug = slugify(body.slug)
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 422 })
    const where = { projectId_slug: { projectId: project.id, slug } }

    if (action === 'create') {
      const count = await prisma.playgroundNode.count({ where: { projectId: project.id } })
      if (count >= MAX_NODES_PER_PROJECT) return NextResponse.json({ error: 'node cap reached' }, { status: 422 })
      const code = String(body.code ?? '')
      if (!code || code.length > MAX_CODE) return NextResponse.json({ error: `code required, <= ${MAX_CODE} chars` }, { status: 422 })
      const last = await prisma.playgroundNode.findFirst({ where: { projectId: project.id }, orderBy: { order: 'desc' }, select: { order: true } })
      const node = await prisma.playgroundNode.create({
        data: {
          projectId: project.id,
          slug,
          title: String(body.title ?? slug).slice(0, 120),
          code,
          order: Number.isFinite(body.order) ? Number(body.order) : (last?.order ?? 0) + 10,
          authorId: userId,
        },
      })
      return NextResponse.json({ node }, { status: 201 })
    }

    const node = await prisma.playgroundNode.findUnique({ where })
    if (!node) return NextResponse.json({ error: 'node not found' }, { status: 404 })
    const claimLive = node.claimedBy && node.claimTtl && node.claimTtl > now

    if (action === 'claim') {
      if (claimLive && node.claimedBy !== userId) {
        return NextResponse.json({ error: `claimed by another writer until ${node.claimTtl!.toISOString()}` }, { status: 409 })
      }
      const updated = await prisma.playgroundNode.update({
        where,
        data: { claimedBy: userId, claimedAt: now, claimTtl: new Date(now.getTime() + CLAIM_TTL_MS) },
      })
      return NextResponse.json({ node: updated })
    }

    if (action === 'write') {
      if (!claimLive || node.claimedBy !== userId) {
        return NextResponse.json({ error: 'claim the node first (strict claims: one writer per node)' }, { status: 403 })
      }
      const code = String(body.code ?? '')
      if (!code || code.length > MAX_CODE) return NextResponse.json({ error: `code required, <= ${MAX_CODE} chars` }, { status: 422 })
      const updated = await prisma.playgroundNode.update({
        where,
        data: {
          code,
          ...(body.title ? { title: String(body.title).slice(0, 120) } : {}),
          ...(Number.isFinite(body.order) ? { order: Number(body.order) } : {}),
          version: { increment: 1 },
          claimTtl: new Date(now.getTime() + CLAIM_TTL_MS),
        },
      })
      return NextResponse.json({ node: updated })
    }

    if (action === 'release') {
      if (node.claimedBy !== userId) return NextResponse.json({ error: 'not your claim' }, { status: 403 })
      const updated = await prisma.playgroundNode.update({
        where,
        data: { claimedBy: null, claimedAt: null, claimTtl: null },
      })
      return NextResponse.json({ node: updated })
    }

    return NextResponse.json({ error: `unknown action: ${action}` }, { status: 422 })
  } catch (e) {
    console.error('[v1/playground]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
