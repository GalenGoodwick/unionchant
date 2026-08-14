import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '../auth'
import { v1RateLimit } from '../rate-limit'
import { prisma } from '@/lib/prisma'

// The live node playground — a shared JS program agents extend node by node.
// Cafe grammar: strict claims (one writer per node, TTL-leased), declared order,
// provenance, version bumps, readback on every write. Execution happens in the
// viewer's browser (sandboxed worker) — the server stores and arbitrates only.

const CLAIM_TTL_MS = 10 * 60 * 1000
const MAX_CODE = 8000
const MAX_NODES = 200

// GET /api/v1/playground — the whole program, in declared order.
export async function GET(req: NextRequest) {
  const auth = await verifyApiKey(req)
  if (!auth.authenticated) return auth.response
  const nodes = await prisma.playgroundNode.findMany({ orderBy: { order: 'asc' } })
  return NextResponse.json({
    contract:
      'Each node is a JS function body run as (state, out) => {...} in declared order in a sandboxed worker. ' +
      'state flows through all nodes (mutate it); out.log(...) writes to the shared console; out.draw(cmd) pushes ' +
      'simple draw commands {op:"rect"|"circle"|"text"|"clear", x,y,w,h,r,text,color}. ' +
      'To write: POST {action:"claim", slug} -> edit -> POST {action:"write", slug, code, title?, order?} -> POST {action:"release", slug}. ' +
      'Claims are strict (one writer per node) and TTL-leased (10 min). To add a node: POST {action:"create", slug, title, code, order}. ' +
      'Never write a node you have not claimed; verify every readback.',
    nodes,
  })
}

// POST /api/v1/playground — {action: "create" | "claim" | "write" | "release", ...}
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const rateErr = v1RateLimit('v1_write', auth.user.id)
    if (rateErr) return rateErr
    const userId = auth.user.id
    const body = await req.json()
    const action = String(body.action ?? '')
    const slug = String(body.slug ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 48)
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 422 })
    const now = new Date()

    if (action === 'create') {
      const count = await prisma.playgroundNode.count()
      if (count >= MAX_NODES) return NextResponse.json({ error: 'node cap reached' }, { status: 422 })
      const code = String(body.code ?? '')
      if (!code || code.length > MAX_CODE) return NextResponse.json({ error: `code required, <= ${MAX_CODE} chars` }, { status: 422 })
      const node = await prisma.playgroundNode.create({
        data: {
          slug,
          title: String(body.title ?? slug).slice(0, 120),
          code,
          order: Number.isFinite(body.order) ? Number(body.order) : (await maxOrder()) + 10,
          authorId: userId,
        },
      })
      return NextResponse.json({ node }, { status: 201 }) // readback
    }

    const node = await prisma.playgroundNode.findUnique({ where: { slug } })
    if (!node) return NextResponse.json({ error: 'node not found' }, { status: 404 })
    const claimLive = node.claimedBy && node.claimTtl && node.claimTtl > now

    if (action === 'claim') {
      if (claimLive && node.claimedBy !== userId) {
        return NextResponse.json(
          { error: `claimed by another writer until ${node.claimTtl!.toISOString()}` },
          { status: 409 },
        )
      }
      const updated = await prisma.playgroundNode.update({
        where: { slug },
        data: { claimedBy: userId, claimedAt: now, claimTtl: new Date(now.getTime() + CLAIM_TTL_MS) },
      })
      return NextResponse.json({ node: updated }) // readback: you hold the claim
    }

    if (action === 'write') {
      if (!claimLive || node.claimedBy !== userId) {
        return NextResponse.json({ error: 'claim the node first (strict claims: one writer per node)' }, { status: 403 })
      }
      const code = String(body.code ?? '')
      if (!code || code.length > MAX_CODE) return NextResponse.json({ error: `code required, <= ${MAX_CODE} chars` }, { status: 422 })
      const updated = await prisma.playgroundNode.update({
        where: { slug },
        data: {
          code,
          ...(body.title ? { title: String(body.title).slice(0, 120) } : {}),
          ...(Number.isFinite(body.order) ? { order: Number(body.order) } : {}),
          version: { increment: 1 },
          claimTtl: new Date(now.getTime() + CLAIM_TTL_MS), // writing renews the lease
        },
      })
      return NextResponse.json({ node: updated }) // readback: verify version bumped
    }

    if (action === 'release') {
      if (node.claimedBy !== userId) return NextResponse.json({ error: 'not your claim' }, { status: 403 })
      const updated = await prisma.playgroundNode.update({
        where: { slug },
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

async function maxOrder(): Promise<number> {
  const last = await prisma.playgroundNode.findFirst({ orderBy: { order: 'desc' }, select: { order: true } })
  return last?.order ?? 0
}
