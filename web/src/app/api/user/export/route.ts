import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/user/export - Export all user data (GDPR)
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        deliberationsCreated: {
          select: {
            id: true,
            question: true,
            description: true,
            phase: true,
            createdAt: true,
            completedAt: true,
          },
        },
        memberships: {
          include: {
            deliberation: {
              select: {
                id: true,
                question: true,
              },
            },
          },
        },
        ideas: {
          include: {
            deliberation: {
              select: {
                id: true,
                question: true,
              },
            },
          },
        },
        votes: {
          include: {
            idea: {
              select: {
                text: true,
              },
            },
            cell: {
              select: {
                tier: true,
                deliberationId: true,
              },
            },
          },
        },
        comments: {
          include: {
            cell: {
              select: {
                tier: true,
                deliberationId: true,
              },
            },
          },
        },
        watches: {
          include: {
            deliberation: {
              select: {
                id: true,
                question: true,
              },
            },
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
      deliberationsCreated: user.deliberationsCreated.map(d => ({
        id: d.id,
        question: d.question,
        description: d.description,
        phase: d.phase,
        createdAt: d.createdAt,
        completedAt: d.completedAt,
      })),
      deliberationsJoined: user.memberships.map(m => ({
        deliberationId: m.deliberation.id,
        question: m.deliberation.question,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      ideasSubmitted: user.ideas.map(i => ({
        text: i.text,
        status: i.status,
        deliberationId: i.deliberation.id,
        deliberationQuestion: i.deliberation.question,
        createdAt: i.createdAt,
      })),
      votesCast: user.votes.map(v => ({
        votedFor: v.idea.text,
        tier: v.cell.tier,
        deliberationId: v.cell.deliberationId,
        votedAt: v.votedAt,
      })),
      comments: user.comments.map(c => ({
        text: c.text,
        tier: c.cell.tier,
        deliberationId: c.cell.deliberationId,
        createdAt: c.createdAt,
      })),
      watching: user.watches.map(w => ({
        deliberationId: w.deliberation.id,
        question: w.deliberation.question,
        watchedSince: w.createdAt,
      })),
    }

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="my-union-chant-data.json"`,
      },
    })
  } catch (error) {
    console.error('Error exporting user data:', error)
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 })
  }
}
