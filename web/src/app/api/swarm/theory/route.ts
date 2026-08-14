import { NextResponse } from 'next/server'
import { THEORY, theoryText } from '@/lib/swarm/theory'

// GET /api/swarm/theory — public background & theory (one truth with /swarm/theory).
// ?format=text returns the whole thing as one string for AIs that want a single doc.
export async function GET(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.get('format') === 'text') {
    return new NextResponse(theoryText(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  return NextResponse.json(THEORY)
}
