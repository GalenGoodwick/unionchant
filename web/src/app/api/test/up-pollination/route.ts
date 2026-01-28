import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/test/up-pollination - Create test data for up-pollination
export async function POST() {
  try {
    // Find or create a test user
    let testUser = await prisma.user.findFirst({
      where: { email: 'test-uppoll@test.com' }
    })

    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: 'test-uppoll@test.com',
          name: 'Test UpPoll User',
        }
      })
    }

    // Create a test deliberation
    const deliberation = await prisma.deliberation.create({
      data: {
        question: `[TEST] Up-Pollination Test ${Date.now()}`,
        description: 'Testing comment up-pollination between cells',
        creatorId: testUser.id,
        isPublic: true,
        phase: 'VOTING',
        currentTier: 1,
      }
    })

    // Create 4 test ideas
    const ideas = await Promise.all([1, 2, 3, 4].map(i =>
      prisma.idea.create({
        data: {
          deliberationId: deliberation.id,
          authorId: testUser!.id,
          text: `Test Idea ${i} for up-pollination`,
          status: 'IN_VOTING',
        }
      })
    ))

    // Create 2 cells that share ideas 1 and 2 (same batch)
    const cell1 = await prisma.cell.create({
      data: {
        deliberationId: deliberation.id,
        tier: 1,
        status: 'VOTING',
      }
    })

    const cell2 = await prisma.cell.create({
      data: {
        deliberationId: deliberation.id,
        tier: 1,
        status: 'VOTING',
      }
    })

    // Both cells get ideas 1 and 2 (shared)
    // Cell 1 also gets idea 3, Cell 2 gets idea 4
    await prisma.cellIdea.createMany({
      data: [
        { cellId: cell1.id, ideaId: ideas[0].id },
        { cellId: cell1.id, ideaId: ideas[1].id },
        { cellId: cell1.id, ideaId: ideas[2].id },
        { cellId: cell2.id, ideaId: ideas[0].id },
        { cellId: cell2.id, ideaId: ideas[1].id },
        { cellId: cell2.id, ideaId: ideas[3].id },
      ]
    })

    // Add test user as participant to both cells
    await prisma.cellParticipation.createMany({
      data: [
        { cellId: cell1.id, userId: testUser.id, status: 'ACTIVE' },
        { cellId: cell2.id, userId: testUser.id, status: 'ACTIVE' },
      ]
    })

    // Create a comment in cell1 with reachTier = 1 (should show in cell2)
    const comment1 = await prisma.comment.create({
      data: {
        cellId: cell1.id,
        userId: testUser.id,
        text: 'This comment has reachTier=1 and should up-pollinate to cell2!',
        reachTier: 1,
        upvoteCount: 3,
      }
    })

    // Create another comment with reachTier = 0 (should NOT show in cell2)
    const comment2 = await prisma.comment.create({
      data: {
        cellId: cell1.id,
        userId: testUser.id,
        text: 'This comment has reachTier=0 and should NOT up-pollinate.',
        reachTier: 0,
        upvoteCount: 0,
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Test data created for up-pollination',
      deliberationId: deliberation.id,
      cell1Id: cell1.id,
      cell2Id: cell2.id,
      sharedIdeas: [ideas[0].id, ideas[1].id],
      comments: [
        { id: comment1.id, reachTier: 1, shouldShow: true },
        { id: comment2.id, reachTier: 0, shouldShow: false },
      ],
      instructions: 'Now call GET /api/test/up-pollination to verify the up-pollination logic',
    })
  } catch (error) {
    console.error('Error creating test data:', error)
    return NextResponse.json({ error: 'Failed to create test data' }, { status: 500 })
  }
}

// GET /api/test/up-pollination - Test up-pollination logic
export async function GET() {
  const results: string[] = []

  results.push('🧪 Testing up-pollination logic...')

  // Find a deliberation in VOTING phase with multiple cells
  // Prefer newer deliberations (for testing)
  const deliberation = await prisma.deliberation.findFirst({
    where: { phase: 'VOTING' },
    orderBy: { createdAt: 'desc' },
    include: {
      cells: {
        include: {
          ideas: { include: { idea: true } },
          participants: true,
        },
      },
    },
  })

  // Also get cell status breakdown
  const cellsByStatus = {
    VOTING: deliberation?.cells.filter(c => c.status === 'VOTING').length || 0,
    COMPLETED: deliberation?.cells.filter(c => c.status === 'COMPLETED').length || 0,
    total: deliberation?.cells.length || 0,
  }
  results.push(`   Cell status: ${cellsByStatus.VOTING} voting, ${cellsByStatus.COMPLETED} completed`)

  if (!deliberation) {
    return NextResponse.json({
      success: false,
      message: 'No voting deliberation found. Create one first.',
      results
    })
  }

  results.push(`📋 Deliberation: "${deliberation.question}"`)
  results.push(`   Phase: ${deliberation.phase}, Tier: ${deliberation.currentTier}`)
  results.push(`   Cells: ${deliberation.cells.length}`)

  if (deliberation.cells.length < 2) {
    return NextResponse.json({
      success: false,
      message: 'Need at least 2 cells to test up-pollination.',
      cellsByStatus,
      results
    })
  }

  // Find the currently voting cell (target for up-pollination)
  const votingCell = deliberation.cells.find(c => c.status === 'VOTING')
  if (!votingCell) {
    return NextResponse.json({
      success: false,
      message: 'No actively voting cell found.',
      cellsByStatus,
      results
    })
  }

  const votingCellIdeaIds = votingCell.ideas.map(ci => ci.ideaId)

  // Find other cells (completed or voting) with overlapping ideas
  const sourceCells = deliberation.cells.filter(c =>
    c.id !== votingCell.id &&
    c.ideas.some(ci => votingCellIdeaIds.includes(ci.ideaId))
  )

  // For backward compatibility, use cellA/cellB naming
  const cellA = sourceCells[0] || deliberation.cells.find(c => c.id !== votingCell.id)
  const cellB = votingCell

  if (!cellA) {
    return NextResponse.json({
      success: false,
      message: 'No source cells found.',
      cellsByStatus,
      results
    })
  }

  const cellAIdeaIds = cellA.ideas.map(ci => ci.ideaId)

  const cellBIdeaIds = cellB.ideas.map(ci => ci.ideaId)
  const sharedIdeas = cellAIdeaIds.filter(id => cellBIdeaIds.includes(id))

  results.push(`✅ Found cells with overlapping ideas:`)
  results.push(`   Source cell (A): ${cellA.id.slice(0,8)}... (${cellA.ideas.length} ideas, status: ${cellA.status})`)
  results.push(`   Target cell (B): ${cellB.id.slice(0,8)}... (${cellB.ideas.length} ideas, status: ${cellB.status})`)
  results.push(`   Shared ideas: ${sharedIdeas.length}`)
  results.push(`   Source cells with shared ideas: ${sourceCells.length}`)

  // Check for comments in Cell A
  const commentsInA = await prisma.comment.findMany({
    where: { cellId: cellA.id },
    include: { user: { select: { name: true } } },
  })

  results.push(`📝 Comments in Cell A: ${commentsInA.length}`)
  for (const c of commentsInA) {
    results.push(`   - "${c.text.slice(0,40)}..." by ${c.user.name} (reachTier: ${c.reachTier}, upvotes: ${c.upvoteCount})`)
  }

  // Check what would show in Cell B using the same logic as the API
  const shouldShowComment = (commentId: string, targetCellId: string, reachTier: number, cellTier: number) => {
    if (reachTier >= cellTier) return true
    const probability = Math.pow(5, reachTier - cellTier)
    const hash = (commentId + targetCellId).split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)
    return (Math.abs(hash) % 1000) < (probability * 1000)
  }

  results.push(`🌸 Up-pollination check for Cell B (tier ${deliberation.currentTier}):`)

  const promotedComments = commentsInA.filter(c => c.reachTier >= 1)
  if (promotedComments.length === 0) {
    results.push('   No promoted comments in Cell A yet.')
    results.push('   To test: add comments and upvote them to increase reachTier.')
  } else {
    for (const c of promotedComments) {
      const wouldShow = shouldShowComment(c.id, cellB.id, c.reachTier, deliberation.currentTier)
      const probability = c.reachTier >= deliberation.currentTier
        ? 100
        : Math.pow(5, c.reachTier - deliberation.currentTier) * 100
      results.push(`   - "${c.text.slice(0,30)}..." reachTier=${c.reachTier} → ${wouldShow ? '✅ SHOWS' : '❌ HIDDEN'} (${probability.toFixed(1)}% chance)`)
    }
  }

  // Now actually fetch from Cell B's perspective using the same logic as comments API
  const commentsForCellB = await prisma.comment.findMany({
    where: {
      cellId: { in: [cellA.id] },
      reachTier: { gte: 1 },
    },
  })

  const visibleToB = commentsForCellB.filter(c =>
    shouldShowComment(c.id, cellB.id, c.reachTier, deliberation.currentTier)
  )

  results.push(`📊 Summary:`)
  results.push(`   Total comments in A: ${commentsInA.length}`)
  results.push(`   Promoted (reachTier >= 1): ${promotedComments.length}`)
  results.push(`   Would show in B: ${visibleToB.length}`)

  return NextResponse.json({
    success: true,
    cellsByStatus,
    sourceCell: { id: cellA.id, status: cellA.status, comments: commentsInA.length },
    targetCell: { id: cellB.id, status: cellB.status, sharedIdeas: sharedIdeas.length },
    sourceCellsCount: sourceCells.length,
    promotedComments: promotedComments.length,
    visibleToTarget: visibleToB.length,
    results
  })
}
