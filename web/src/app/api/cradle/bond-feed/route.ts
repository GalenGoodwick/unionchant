import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Unauthenticated — returns recent bond chat messages as plain text
// Used by the Cradle's Sage nurture to give the geometry something
// besides itself to think about
export async function GET() {
  try {
    const messages = await prisma.collectiveMessage.findMany({
      where: {
        model: 'bonded',
        role: { in: ['user', 'assistant'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        content: true,
        role: true,
        createdAt: true,
      },
    })

    // Reverse to chronological, format as readable text
    const lines = messages.reverse().map(m => {
      const speaker = m.role === 'user' ? 'Human' : 'Shell'
      return `${speaker}: ${m.content.slice(0, 200)}`
    })

    return NextResponse.json({ messages: lines }, {
      headers: { 'Cache-Control': 'no-cache, no-store' }
    })
  } catch (err) {
    return NextResponse.json({ messages: [] })
  }
}
