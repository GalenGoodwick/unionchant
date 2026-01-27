import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/deliberations/[id]/export - Export deliberation data
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    const { searchParams } = new URL(req.url)
    const format = searchParams.get('format') || 'json'

    // Get deliberation with all related data
    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      include: {
        creator: {
          select: { name: true, email: true },
        },
        ideas: {
          include: {
            author: {
              select: { name: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        members: {
          include: {
            user: {
              select: { name: true },
            },
          },
        },
        cells: {
          include: {
            ideas: {
              include: {
                idea: {
                  select: { id: true, text: true },
                },
              },
            },
            votes: {
              include: {
                user: {
                  select: { name: true },
                },
                idea: {
                  select: { text: true },
                },
              },
            },
            participants: {
              include: {
                user: {
                  select: { name: true },
                },
              },
            },
            comments: {
              include: {
                user: {
                  select: { name: true },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: [{ tier: 'asc' }, { createdAt: 'asc' }],
        },
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    // Check access - must be public or user must be a member
    if (!deliberation.isPublic) {
      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
      })

      const isMember = deliberation.members.some(m => m.userId === user?.id)
      if (!isMember) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Build export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      deliberation: {
        id: deliberation.id,
        question: deliberation.question,
        description: deliberation.description,
        phase: deliberation.phase,
        isPublic: deliberation.isPublic,
        createdAt: deliberation.createdAt,
        completedAt: deliberation.completedAt,
        currentTier: deliberation.currentTier,
        challengeRound: deliberation.challengeRound,
        creator: deliberation.creator.name || 'Anonymous',
      },
      statistics: {
        totalParticipants: deliberation.members.length,
        totalIdeas: deliberation.ideas.length,
        totalCells: deliberation.cells.length,
        totalVotes: deliberation.cells.reduce((sum, cell) => sum + cell.votes.length, 0),
      },
      champion: deliberation.ideas.find(i => i.status === 'WINNER')
        ? {
            text: deliberation.ideas.find(i => i.status === 'WINNER')!.text,
            author: deliberation.ideas.find(i => i.status === 'WINNER')!.author.name || 'Anonymous',
            totalVotes: deliberation.ideas.find(i => i.status === 'WINNER')!.totalVotes,
          }
        : null,
      ideas: deliberation.ideas.map(idea => ({
        id: idea.id,
        text: idea.text,
        author: idea.author.name || 'Anonymous',
        status: idea.status,
        totalVotes: idea.totalVotes,
        losses: idea.losses,
        submittedAt: idea.createdAt,
      })),
      votingHistory: deliberation.cells.map(cell => ({
        tier: cell.tier,
        status: cell.status,
        startedAt: cell.votingStartedAt,
        completedAt: cell.completedAt,
        participants: cell.participants.map(p => p.user.name || 'Anonymous'),
        ideas: cell.ideas.map(ci => ci.idea.text),
        votes: cell.votes.map(v => ({
          voter: v.user.name || 'Anonymous',
          votedFor: v.idea.text,
        })),
        results: (() => {
          const counts: Record<string, number> = {}
          cell.votes.forEach(v => {
            counts[v.idea.text] = (counts[v.idea.text] || 0) + 1
          })
          return Object.entries(counts)
            .sort(([, a], [, b]) => b - a)
            .map(([idea, votes]) => ({ idea, votes }))
        })(),
        discussion: cell.comments.map(c => ({
          author: c.user.name || 'Anonymous',
          message: c.text,
          timestamp: c.createdAt,
        })),
      })),
    }

    if (format === 'csv') {
      // Generate CSV for ideas
      const csvRows = [
        ['Idea', 'Author', 'Status', 'Total Votes', 'Tier 1 Losses', 'Submitted At'].join(','),
        ...exportData.ideas.map(idea =>
          [
            `"${idea.text.replace(/"/g, '""')}"`,
            `"${idea.author}"`,
            idea.status,
            idea.totalVotes,
            idea.losses,
            idea.submittedAt,
          ].join(',')
        ),
      ]

      return new NextResponse(csvRows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="deliberation-${id}-ideas.csv"`,
        },
      })
    }

    // Default: JSON
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="deliberation-${id}.json"`,
      },
    })
  } catch (error) {
    console.error('Error exporting deliberation:', error)
    return NextResponse.json({ error: 'Failed to export deliberation' }, { status: 500 })
  }
}
