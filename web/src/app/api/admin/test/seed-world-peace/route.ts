import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { startVotingPhase } from '@/lib/voting'
import crypto from 'crypto'

const AI_PERSONAS = [
  { name: 'Diplomat Diana', personality: 'diplomatic' },
  { name: 'Professor Kai', personality: 'analytical' },
  { name: 'Activist Rosa', personality: 'passionate' },
  { name: 'Engineer Sato', personality: 'pragmatic' },
  { name: 'Philosopher Amir', personality: 'contemplative' },
  { name: 'Mediator Chen', personality: 'bridge-builder' },
  { name: 'Historian Nkechi', personality: 'contextual' },
  { name: 'Economist Priya', personality: 'systems-thinker' },
  { name: 'Artist Mateo', personality: 'creative' },
  { name: 'Scientist Ingrid', personality: 'evidence-based' },
]

const FALLBACK_IDEAS = [
  'Establish universal basic education with cross-cultural exchange programs starting from age 6, so every child grows up understanding different perspectives.',
  'Create a global conflict early-warning system powered by AI that detects escalating tensions and triggers diplomatic intervention before violence erupts.',
  'Fund grassroots peace-building organizations in every country with a guaranteed percentage of national defense budgets redirected to prevention.',
  'Build a decentralized global voting platform where citizens directly influence international policy, bypassing institutional gridlock.',
  'Replace competitive national economies with cooperative regional ecosystems where prosperity is shared and no nation benefits from another\'s failure.',
  'Mandate that all world leaders spend one month per year living as ordinary citizens in a country that was formerly their adversary.',
  'Create an international youth parliament with real legislative power over climate, trade, and conflict — decisions made by those who inherit the consequences.',
  'Invest massively in translation technology and cultural literacy so every person can communicate with any other person on Earth without barriers.',
  'Establish truth and reconciliation processes for every ongoing conflict, modeled on South Africa but adapted locally — accountability before peace.',
  'Design cities where people from conflicting backgrounds live, work, and raise children together by default — integration as infrastructure, not policy.',
]

// POST /api/admin/test/seed-world-peace — Seed the world peace chant
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email || !(await isAdmin(session.user.email))) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    // Check if already seeded
    const existing = await prisma.deliberation.findFirst({
      where: { isPinned: true },
    })
    if (existing) {
      return NextResponse.json({ error: 'Pinned chant already exists', id: existing.id }, { status: 409 })
    }

    const adminUser = await prisma.user.findUnique({
      where: { email: session.user.email },
    })
    if (!adminUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Try to generate ideas with AI, fall back to hardcoded
    let ideas = FALLBACK_IDEAS
    try {
      const { callClaude } = await import('@/lib/claude')
      const aiResponse = await callClaude(
        'You generate diverse, thoughtful ideas for achieving world peace. Each idea should be 1-2 sentences, concrete and actionable. Return exactly 10 ideas, one per line, no numbering or bullets.',
        [{ role: 'user', content: 'Give me 10 diverse ideas for how humanity can achieve world peace.' }],
        'haiku',
      )
      const parsed = aiResponse.split('\n').map(l => l.trim()).filter(l => l.length > 10)
      if (parsed.length >= 10) ideas = parsed.slice(0, 10)
    } catch {
      // Use fallback ideas
    }

    // Create 10 AI users
    const aiUsers = await Promise.all(
      AI_PERSONAS.map(async (persona, i) => {
        return prisma.user.upsert({
          where: { email: `ai_peace_${i}@system.unitychant.com` },
          update: { name: persona.name },
          create: {
            email: `ai_peace_${i}@system.unitychant.com`,
            name: persona.name,
            isAI: true,
            aiPersonality: persona.personality,
            emailVerified: new Date(),
            onboardedAt: new Date(),
          },
        })
      })
    )

    // Create the chant
    const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    const deliberation = await prisma.deliberation.create({
      data: {
        question: 'How do we bring about world peace?',
        description: 'A continuous, rolling deliberation open to everyone. Submit your idea, vote on others, and help humanity find consensus on the most important question of our time.',
        creatorId: adminUser.id,
        inviteCode,
        isPublic: true,
        continuousFlow: true,
        accumulationEnabled: false,
        ideaGoal: 10,
        isPinned: true,
        supermajorityEnabled: true,
        members: {
          createMany: {
            data: [
              { userId: adminUser.id, role: 'CREATOR' },
              ...aiUsers.map(u => ({ userId: u.id, role: 'PARTICIPANT' as const })),
            ],
          },
        },
      },
    })

    // Submit 10 ideas (one per AI user)
    for (let i = 0; i < 10; i++) {
      await prisma.idea.create({
        data: {
          text: ideas[i],
          deliberationId: deliberation.id,
          authorId: aiUsers[i].id,
          status: 'SUBMITTED',
        },
      })
    }

    // Auto-start voting (ideaGoal = 10, we have 10 ideas)
    await startVotingPhase(deliberation.id)

    return NextResponse.json({
      id: deliberation.id,
      inviteCode,
      message: 'World peace chant seeded with 10 AI ideas. Voting started.',
    })
  } catch (err) {
    console.error('Seed world peace error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to seed' }, { status: 500 })
  }
}
