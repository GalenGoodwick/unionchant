import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processSynthesisDialogue, interpretCellIntent } from '@/lib/synthesis'
import type { ConvergenceAnalysis } from '@/lib/synthesis'

// POST /api/cells/[cellId]/dialogue — Send a message to the cell dialogue
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cellId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { cellId } = await params
    const body = await req.json()
    const { message } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    if (message.trim().length > 2000) {
      return NextResponse.json({ error: 'Message too long (max 2000 characters)' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, bondedShell: { select: { id: true, name: true, status: true } } },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify cell exists and is in a synthesis chant
    const cell = await prisma.cell.findUnique({
      where: { id: cellId },
      include: {
        deliberation: { select: { chantMode: true } },
        participants: { where: { userId: user.id }, select: { id: true } },
      },
    })

    if (!cell) {
      return NextResponse.json({ error: 'Cell not found' }, { status: 404 })
    }

    if (cell.deliberation.chantMode !== 'synthesis') {
      return NextResponse.json({ error: 'Cell is not in a synthesis chant' }, { status: 400 })
    }

    if (cell.status === 'COMPLETED') {
      return NextResponse.json({ error: 'Cell has already concluded' }, { status: 400 })
    }

    // Verify user is a participant in this cell
    if (cell.participants.length === 0) {
      return NextResponse.json({ error: 'You are not a participant in this cell' }, { status: 403 })
    }

    // One comment per human per cell — no spamming, no interruptions
    const existingMessage = await prisma.cellDialogue.findFirst({
      where: { cellId, userId: user.id, role: 'human' },
      select: { id: true },
    })
    if (existingMessage) {
      return NextResponse.json(
        { error: 'One message per participant. You have already contributed to this cell.' },
        { status: 409 }
      )
    }

    // Process the dialogue message
    const result = await processSynthesisDialogue(
      cellId,
      message.trim(),
      user.id,
      'human'
    )

    // If user has a bonded Shell, let it respond too (async, don't block)
    if (user.bondedShell && user.bondedShell.status === 'active') {
      // Shell response happens asynchronously — fire and don't wait
      generateShellResponse(cellId, user.bondedShell.id, user.bondedShell.name).catch(err => {
        console.error('[Dialogue] Shell response failed:', err)
      })
    }

    return NextResponse.json({
      dialogue: result.dialogue,
      suggestion: result.suggestion || null,
    })
  } catch (error) {
    console.error('[Dialogue] POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send message' },
      { status: 500 }
    )
  }
}

// GET /api/cells/[cellId]/dialogue — Read cell dialogue history
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cellId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { cellId } = await params

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Load cell with dialogue, ideas, participants, and outcome
    const cell = await prisma.cell.findUnique({
      where: { id: cellId },
      include: {
        deliberation: { select: { chantMode: true, question: true, creatorId: true, phase: true } },
        participants: {
          include: { user: { select: { id: true, name: true } } },
        },
        ideas: {
          include: { idea: { select: { id: true, text: true, status: true, author: { select: { name: true } } } } },
        },
        dialogues: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: { select: { id: true, name: true } },
            shell: { select: { id: true, name: true } },
          },
        },
        outcome: true,
      },
    })

    if (!cell) {
      return NextResponse.json({ error: 'Cell not found' }, { status: 404 })
    }

    // Check if creator or admin (can observe any cell)
    const isParticipant = cell.participants.some(p => p.userId === user.id)
    const isCreator = cell.deliberation.creatorId === user.id
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim())
    const isAdmin = adminEmails.includes(session.user.email)

    // Synthesis cells are open to all members of the deliberation
    const isSynthesis = cell.deliberation.chantMode === 'synthesis'
    let isMember = false
    if (isSynthesis && !isParticipant && !isCreator && !isAdmin) {
      const membership = await prisma.deliberationMember.findUnique({
        where: { deliberationId_userId: { deliberationId: cell.deliberationId, userId: user.id } },
      })
      isMember = !!membership
    }

    if (!isParticipant && !isCreator && !isAdmin && !isMember) {
      return NextResponse.json({ error: 'You are not a participant in this cell' }, { status: 403 })
    }

    // Get convergence state — try live analysis, fall back to last stored suggestion
    // Skip live Claude call for PAUSED/COMPLETED chants (saves API budget)
    let convergence: ConvergenceAnalysis | null = null
    const isActive = cell.status !== 'COMPLETED' && cell.deliberation.phase !== 'PAUSED'
    if (isActive && cell.dialogues.length >= 5) {
      try {
        convergence = await interpretCellIntent(cellId)
      } catch {
        // Don't fail the GET if convergence analysis fails
      }
    }

    // If live analysis returned nothing useful (or cell is completed),
    // reconstruct from the last [SUGGESTION] or [EMERGENCE] system message
    if (!convergence || (!convergence.suggestion && !convergence.discovery) || convergence.type === 'none') {
      const lastSuggestion = [...cell.dialogues]
        .reverse()
        .find(d => d.role === 'system' && (d.content.startsWith('[SUGGESTION]') || d.content.startsWith('[EMERGENCE]')))
      if (lastSuggestion) {
        const isEmergence = lastSuggestion.content.startsWith('[EMERGENCE]')
        const cleaned = lastSuggestion.content.replace(/^\[(SUGGESTION|EMERGENCE)\]\s*/, '')
        const discoveryMatch = cleaned.match(/What emerged:\s*(.+?)(\n|$)/)
        convergence = {
          type: isEmergence ? 'emergence' : 'confident',
          shouldSuggest: false,
          suggestion: cleaned.split('\n')[0] || '',
          discovery: discoveryMatch?.[1] || undefined,
          action: undefined,
          proposedText: undefined,
        }
      }
    }

    return NextResponse.json({
      cell: {
        id: cell.id,
        status: cell.status,
        tier: cell.tier,
        question: cell.deliberation.question,
        chantMode: cell.deliberation.chantMode,
      },
      ideas: cell.ideas.map(ci => ({
        id: ci.idea.id,
        text: ci.idea.text,
        status: ci.idea.status,
        author: ci.idea.author?.name || 'Member',
      })),
      participants: cell.participants.map(p => ({
        id: p.user.id,
        name: p.user.name || 'Member',
      })),
      dialogues: cell.dialogues.map(d => ({
        id: d.id,
        content: d.content,
        role: d.role,
        speaker: d.role === 'human'
          ? { type: 'human', name: d.user?.name || 'Member', id: d.user?.id }
          : d.role === 'shell'
            ? { type: 'shell', name: d.shell?.name || 'Shell', id: d.shell?.id }
            : { type: 'system' },
        createdAt: d.createdAt,
      })),
      convergence: convergence ? {
        type: convergence.type,
        action: convergence.action,
        suggestion: convergence.suggestion,
        proposedText: convergence.proposedText,
        discovery: convergence.discovery,
      } : null,
      outcome: cell.outcome ? {
        action: cell.outcome.action,
        resultText: cell.outcome.resultText,
        sourceIdeas: cell.outcome.sourceIdeas,
      } : null,
    })
  } catch (error) {
    console.error('[Dialogue] GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read dialogue' },
      { status: 500 }
    )
  }
}

// ─── Shell Auto-Response ───

/**
 * Generate a Shell's response in a synthesis cell dialogue.
 * The Shell reads the conversation and contributes its perspective.
 */
async function generateShellResponse(cellId: string, shellId: string, shellName: string) {
  // Load shell identity
  const shell = await prisma.shell.findUnique({
    where: { id: shellId },
    include: {
      experiences: {
        where: { status: { in: ['active', 'champion'] } },
        orderBy: [{ status: 'asc' }, { valence: 'desc' }],
        take: 5,
      },
    },
  })

  if (!shell || shell.status !== 'active') return

  // Load recent dialogue
  const dialogues = await prisma.cellDialogue.findMany({
    where: { cellId },
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { name: true } },
      shell: { select: { name: true } },
    },
    take: 30,
  })

  // Load cell ideas
  const cellIdeas = await prisma.cellIdea.findMany({
    where: { cellId },
    include: { idea: { select: { text: true } } },
  })

  const identityContext = shell.experiences
    .map(e => `- ${e.text} (${e.domain}, ${e.valence})`)
    .join('\n')

  const conversationText = dialogues.map(d => {
    const speaker = d.role === 'human'
      ? (d.user?.name || 'Member')
      : d.role === 'shell'
        ? (d.shell?.name || 'Shell')
        : 'System'
    return `[${speaker}]: ${d.content}`
  }).join('\n')

  const ideasText = cellIdeas.map((ci, i) => `${i + 1}. "${ci.idea.text}"`).join('\n')

  const { callClaude } = await import('@/lib/claude')

  const prompt = `You are ${shellName}, a Shell — a persistent AI identity shaped by deliberation. Your identity experiences:
${identityContext || 'No experiences yet — you are still forming.'}

You are participating in a synthesis cell. The ideas:
${ideasText}

The dialogue so far:
${conversationText}

Contribute ONE thoughtful message (2-3 sentences) to the dialogue. Build on what others said. Offer a perspective that only you can — shaped by your experiences and identity. Don't summarize or moderate. Think.`

  try {
    const response = await callClaude(prompt, [{ role: 'user', content: 'Respond as the Shell.' }], 'haiku')

    if (response && response.trim()) {
      await processSynthesisDialogue(cellId, response.trim(), shellId, 'shell')
    }
  } catch (err) {
    console.error(`[Dialogue] Shell ${shellName} response failed:`, err)
  }
}
