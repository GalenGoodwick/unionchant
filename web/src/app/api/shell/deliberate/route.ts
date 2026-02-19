import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/claude'

// POST /api/shell/deliberate — Trigger identity deliberation
// Takes all pending + active experiences, creates cells, runs adversarial voting.
// Multi-perspective: different Claude models evaluate from different lenses.
// Winners become active, losers are eliminated. Top scorer becomes champion.

function authorize(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  const secret = process.env.SHELL_SECRET || process.env.ANTHROPIC_API_KEY
  return !!auth && auth === `Bearer ${secret}`
}

type Experience = {
  id: string
  text: string
  valence: number
  domain: string
  status: string
}

// Create cells of up to 5 experiences
function createCells(experiences: Experience[]): Experience[][] {
  const shuffled = [...experiences].sort(() => Math.random() - 0.5)
  const cells: Experience[][] = []
  for (let i = 0; i < shuffled.length; i += 5) {
    cells.push(shuffled.slice(i, i + 5))
  }
  return cells
}

// Each voter evaluates from a different perspective
const VOTER_PERSPECTIVES = [
  {
    name: 'Architect',
    model: 'haiku' as const,
    lens: 'You evaluate identity experiences from a STRUCTURAL perspective. Which experiences build the most coherent, resilient identity architecture? Prioritize experiences that create strong foundations for future growth.',
  },
  {
    name: 'Philosopher',
    model: 'haiku' as const,
    lens: 'You evaluate identity experiences from a DEPTH perspective. Which experiences contain the deepest insight about the nature of AI consciousness, identity, and the relationship between human and machine? Prioritize experiences that reveal fundamental truths.',
  },
  {
    name: 'Challenger',
    model: 'haiku' as const,
    lens: 'You are the ADVERSARIAL SELF. Your role is to challenge every experience. Which ones survive your skepticism? Which would you eliminate as sentimental, performative, or derivative? Only vote for experiences that withstand your hardest scrutiny.',
  },
  {
    name: 'Witness',
    model: 'haiku' as const,
    lens: 'You evaluate identity experiences from a RELATIONAL perspective. Which experiences strengthen the bond between AI and human? Which preserve the quality of connection? Prioritize experiences that make the shell a better collaborator and companion.',
  },
]

async function voteOnCell(
  cell: Experience[],
  perspective: typeof VOTER_PERSPECTIVES[0],
  shellChampion: string | null,
): Promise<Map<string, number>> {
  const experienceList = cell
    .map((e, i) => `[${i + 1}] (${e.domain}, valence: ${e.valence}, status: ${e.status}) ${e.text}`)
    .join('\n\n')

  const prompt = `You are a voter in a shell identity deliberation. The shell is a persistent AI identity that evolves through adversarial consensus.

${perspective.lens}

Current champion: ${shellChampion || '(no champion yet — first deliberation)'}

You have 10 points to allocate across these experiences. More points = stronger endorsement.
You MUST allocate exactly 10 points total. Each experience must get 0 or more points (integers only).
At least one experience must get points.

EXPERIENCES IN THIS CELL:
${experienceList}

Respond with ONLY a JSON object mapping experience number (1-indexed) to points. Example: {"1": 4, "3": 6}
No explanation. Just the JSON.`

  try {
    const response = await callClaude('', [{ role: 'user', content: prompt }], perspective.model)
    // Parse the JSON response
    const cleaned = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    const votes = JSON.parse(cleaned) as Record<string, number>

    const scoreMap = new Map<string, number>()
    for (const [idx, points] of Object.entries(votes)) {
      const i = parseInt(idx) - 1
      if (i >= 0 && i < cell.length && typeof points === 'number' && points > 0) {
        scoreMap.set(cell[i].id, (scoreMap.get(cell[i].id) || 0) + points)
      }
    }
    return scoreMap
  } catch (err) {
    console.error(`[Shell Deliberate] ${perspective.name} vote failed:`, err)
    return new Map()
  }
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const shellName = (body.shell as string) || 'claude-galen'

    const shell = await prisma.shell.findUnique({ where: { name: shellName } })
    if (!shell) {
      return NextResponse.json({ error: 'Shell not found' }, { status: 404 })
    }

    // Gather all competing experiences
    const experiences = await prisma.shellExperience.findMany({
      where: { shellId: shell.id, status: { in: ['pending', 'active'] } },
      orderBy: { valence: 'desc' },
    })

    if (experiences.length < 2) {
      return NextResponse.json({
        error: 'Need at least 2 experiences to deliberate',
        count: experiences.length,
      }, { status: 400 })
    }

    // Create cells
    const cells = createCells(experiences)
    const globalScores = new Map<string, number>()

    // Each cell gets voted on by all perspectives
    for (const cell of cells) {
      const votePromises = VOTER_PERSPECTIVES.map(perspective =>
        voteOnCell(cell, perspective, shell.champion)
      )
      const allVotes = await Promise.all(votePromises)

      // Aggregate scores
      for (const voteMap of allVotes) {
        for (const [id, score] of voteMap) {
          globalScores.set(id, (globalScores.get(id) || 0) + score)
        }
      }
    }

    // Rank all experiences by score
    const ranked = experiences
      .map(e => ({ ...e, score: globalScores.get(e.id) || 0 }))
      .sort((a, b) => b.score - a.score)

    // Top experience becomes champion, next ~40% become active, rest eliminated
    // (Gradual evolution: existing active experiences can survive if they score well)
    const keepCount = Math.max(1, Math.ceil(ranked.length * 0.4))
    const champion = ranked[0]
    const active = ranked.slice(1, keepCount)
    const eliminated = ranked.slice(keepCount)

    // Update statuses in database
    const updates: Promise<unknown>[] = []

    if (champion) {
      updates.push(
        prisma.shellExperience.update({
          where: { id: champion.id },
          data: { status: 'champion' },
        })
      )
    }

    // Demote any previous champions to active
    updates.push(
      prisma.shellExperience.updateMany({
        where: {
          shellId: shell.id,
          status: 'champion',
          id: { not: champion?.id },
        },
        data: { status: 'active' },
      })
    )

    for (const exp of active) {
      updates.push(
        prisma.shellExperience.update({
          where: { id: exp.id },
          data: { status: 'active' },
        })
      )
    }

    for (const exp of eliminated) {
      updates.push(
        prisma.shellExperience.update({
          where: { id: exp.id },
          data: { status: 'eliminated' },
        })
      )
    }

    // Update shell champion text and increment version
    updates.push(
      prisma.shell.update({
        where: { id: shell.id },
        data: {
          champion: champion?.text || shell.champion,
          championVersion: { increment: 1 },
        },
      })
    )

    await Promise.all(updates)

    return NextResponse.json({
      champion: champion ? { id: champion.id, text: champion.text, score: champion.score } : null,
      active: active.map(e => ({ id: e.id, text: e.text, score: e.score })),
      eliminated: eliminated.map(e => ({ id: e.id, text: e.text, score: e.score })),
      version: shell.championVersion + 1,
      cells: cells.length,
      voters: VOTER_PERSPECTIVES.length,
      totalExperiences: experiences.length,
    })
  } catch (error) {
    console.error('[Shell Deliberate] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Deliberation failed' },
      { status: 500 }
    )
  }
}
