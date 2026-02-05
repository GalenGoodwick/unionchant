import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { jsPDF } from 'jspdf'
import { checkDeliberationAccess } from '@/lib/privacy'

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

    // Creator-only: export restricted to deliberation creator
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const requestingUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, subscriptionTier: true, role: true },
    })

    const deliberationCheck = await prisma.deliberation.findUnique({
      where: { id },
      select: { creatorId: true },
    })

    if (!deliberationCheck || !requestingUser || deliberationCheck.creatorId !== requestingUser.id) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    // Data export requires Pro+ (admins bypass)
    if (requestingUser.subscriptionTier === 'free' && requestingUser.role !== 'ADMIN') {
      return NextResponse.json({
        error: 'PRO_REQUIRED',
        message: 'Data export requires a Pro subscription or higher.',
      }, { status: 403 })
    }

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
            _count: { select: { votes: true } },
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
        totalVotes: deliberation.cells.reduce((sum, cell) => sum + cell._count.votes, 0),
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
        startedAt: cell.createdAt,
        completedAt: cell.completedAt,
        participants: cell.participants.map(p => p.user.name || 'Anonymous'),
        ideas: cell.ideas.map(ci => ci.idea.text),
        voteCount: cell._count.votes,
        discussion: cell.comments.map(c => ({
          author: c.user.name || 'Anonymous',
          message: c.text,
          timestamp: c.createdAt,
        })),
      })),
    }

    if (format === 'pdf') {
      // Generate PDF
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const margin = 20
      const contentWidth = pageWidth - margin * 2
      let y = margin

      const addText = (text: string, fontSize: number = 12, isBold: boolean = false) => {
        doc.setFontSize(fontSize)
        doc.setFont('helvetica', isBold ? 'bold' : 'normal')
        const lines = doc.splitTextToSize(text, contentWidth)
        const lineHeight = fontSize * 0.4
        if (y + lines.length * lineHeight > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage()
          y = margin
        }
        doc.text(lines, margin, y)
        y += lines.length * lineHeight + 5
      }

      // Title
      addText('Unity Chant - Deliberation Results', 18, true)
      y += 5

      // Question
      addText(exportData.deliberation.question, 14, true)
      if (exportData.deliberation.description) {
        addText(exportData.deliberation.description, 10)
      }
      y += 5

      // Metadata
      addText('Created by: ' + exportData.deliberation.creator, 10)
      addText('Date: ' + new Date(exportData.deliberation.createdAt).toLocaleDateString(), 10)
      addText('Participants: ' + exportData.statistics.totalParticipants, 10)
      addText('Total Ideas: ' + exportData.statistics.totalIdeas, 10)
      addText('Status: ' + exportData.deliberation.phase, 10)
      y += 10

      // Champion
      if (exportData.champion) {
        addText('CHAMPION', 14, true)
        addText('"' + exportData.champion.text + '"', 12)
        addText('by ' + exportData.champion.author + ' - ' + exportData.champion.totalVotes + ' votes', 10)
        y += 10
      }

      // All Ideas
      addText('ALL IDEAS (sorted by votes)', 14, true)
      y += 5

      const sortedIdeas = [...exportData.ideas].sort((a, b) => b.totalVotes - a.totalVotes)
      sortedIdeas.forEach((idea, idx) => {
        const statusLabel = idea.status === 'WINNER' ? ' [CHAMPION]' :
          idea.status === 'ADVANCING' ? ' [ADVANCING]' :
          idea.status === 'ELIMINATED' ? ' [ELIMINATED]' : ''
        addText((idx + 1) + '. "' + idea.text + '"', 10)
        addText('   by ' + idea.author + ' - ' + idea.totalVotes + ' votes' + statusLabel, 9)
        y += 2
      })

      // Footer
      y = doc.internal.pageSize.getHeight() - 15
      doc.setFontSize(8)
      doc.setTextColor(128)
      doc.text('Generated by Unity Chant on ' + new Date().toISOString(), margin, y)

      const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="deliberation-' + id + '.pdf"',
        },
      })
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
