import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { setApiCaller } from '@/lib/claude'
import { logApiCall } from '@/lib/api-budget'

// POST /api/deliberations/[id]/analytics/synthesize - AI analysis of deliberation
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      select: {
        id: true, creatorId: true, question: true, analyticsCache: true,
        ideas: {
          orderBy: { totalXP: 'desc' },
          take: 10,
          select: { id: true, text: true, isChampion: true, totalXP: true, tier: true, status: true },
        },
      },
    })

    if (!deliberation || !user || deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Return cached if exists
    if (deliberation.analyticsCache) {
      return NextResponse.json(deliberation.analyticsCache)
    }

    const champion = deliberation.ideas.find(i => i.isChampion)
    if (!champion) {
      return NextResponse.json({ error: 'No champion declared yet' }, { status: 400 })
    }

    const finalists = deliberation.ideas.filter(i => i.tier >= Math.max(1, (champion.tier || 1) - 1)).slice(0, 5)

    // Get top comments by spread
    const topComments = await prisma.comment.findMany({
      where: { cell: { deliberationId: id } },
      orderBy: { spreadCount: 'desc' },
      take: 50,
      select: { text: true, spreadCount: true, upvoteCount: true },
    })

    const prompt = `You are analyzing the results of a community deliberation. The question was:
"${deliberation.question}"

The winning idea (champion): "${champion.text}"

Runner-up ideas:
${finalists.filter(f => f.id !== champion.id).map((f, i) => `${i + 1}. "${f.text}" (${f.totalXP} XP)`).join('\n')}

Top comments from deliberation (sorted by how widely they spread across cells):
${topComments.slice(0, 30).map(c => `- "${c.text}" (spread: ${c.spreadCount}, upvotes: ${c.upvoteCount})`).join('\n')}

Analyze this deliberation and respond with ONLY valid JSON (no markdown, no code fences):
{
  "objections": [
    { "text": "summary of objection raised against the winner", "severity": "high|medium|low" }
  ],
  "synergies": [
    { "idea": "runner-up idea text", "synergy": "how it complements the winner" }
  ],
  "summary": "A 2-3 sentence executive summary of what happened and why this idea won"
}

Extract the top 3 objections raised AGAINST the winning idea (things people argued against it).
Identify up to 2 synergies between runner-up ideas and the winner.
Write a brief executive summary suitable for a city council presentation.`

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 500 })
    }

    setApiCaller('analytics')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: 'You analyze community deliberation results and extract structured insights. Respond with ONLY valid JSON, no markdown formatting.',
      messages: [{ role: 'user', content: prompt }],
    })

    logApiCall('haiku', response.usage?.input_tokens || 0, response.usage?.output_tokens || 0, 'analytics')

    const responseText = response.content[0].type === 'text' ? response.content[0].text : ''

    let analysis
    try {
      analysis = JSON.parse(responseText)
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0])
      } else {
        return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
      }
    }

    // Cache the result
    await prisma.deliberation.update({
      where: { id },
      data: { analyticsCache: analysis },
    })

    return NextResponse.json(analysis)
  } catch (error) {
    console.error('Error synthesizing analytics:', error)
    return NextResponse.json({ error: 'Failed to synthesize' }, { status: 500 })
  }
}
