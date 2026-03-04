import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function fetchDrift(viewer: string) {
  try {
    const res = await fetch(`${viewer}/api/drift?n=30`, { signal: AbortSignal.timeout(3000) })
    return res.ok ? await res.json() : { entries: [], total: 0 }
  } catch {
    return { entries: [], total: 0 }
  }
}

export async function GET() {
  const [a, b] = await Promise.all([
    fetchDrift('http://localhost:3333'),
    fetchDrift('http://localhost:3334'),
  ])
  return NextResponse.json({
    entries: a.entries || [],
    total: a.total || 0,
    b: { entries: b.entries || [], total: b.total || 0 },
  }, {
    headers: { 'Cache-Control': 'no-cache, no-store' },
  })
}
