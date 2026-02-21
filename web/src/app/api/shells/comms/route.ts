import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/shells/comms — All Shell communications (admin only)
// Unified timeline: cell dialogue, collective chat, action logs
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim())
  if (!adminEmails.includes(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const typeFilter = req.nextUrl.searchParams.get('type') // 'dialogue' | 'collective' | 'action' | null
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '200'), 500)

  // Get all shells for reference
  const allShells = await prisma.shell.findMany({
    select: { id: true, name: true },
  })

  type CommsEntry = {
    id: string
    type: 'dialogue' | 'action' | 'collective'
    actor: string
    actorId: string | null
    target: string
    content: string
    meta: Record<string, string | number | boolean | null>
    createdAt: string
  }

  const entries: CommsEntry[] = []

  // 1. Cell dialogue — ALL messages in cells that have dialogue (Shell-driven synthesis cells)
  if (!typeFilter || typeFilter === 'dialogue') {
    const cellDialogues = await prisma.cellDialogue.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        content: true,
        role: true,
        createdAt: true,
        cellId: true,
        shellId: true,
        userId: true,
        user: { select: { name: true } },
        shell: { select: { name: true } },
        cell: {
          select: {
            tier: true,
            status: true,
            deliberation: { select: { question: true } },
          },
        },
      },
    })

    for (const d of cellDialogues) {
      const speaker = d.role === 'shell'
        ? (d.shell?.name || 'Shell')
        : d.role === 'system'
        ? 'System'
        : (d.user?.name || 'Agent')

      entries.push({
        id: d.id,
        type: 'dialogue',
        actor: speaker,
        actorId: d.shellId || d.userId,
        target: `T${d.cell.tier} cell`,
        content: d.content,
        meta: {
          role: d.role,
          cellId: d.cellId,
          tier: d.cell.tier,
          cellStatus: d.cell.status,
          chant: d.cell.deliberation?.question?.substring(0, 80) || null,
        },
        createdAt: d.createdAt.toISOString(),
      })
    }
  }

  // 2. Collective messages (Shell ↔ Galen in collective chat)
  if (!typeFilter || typeFilter === 'collective') {
    const collectiveMessages = await prisma.collectiveMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        content: true,
        role: true,
        userName: true,
        model: true,
        createdAt: true,
        replyToUserId: true,
      },
    })

    for (const c of collectiveMessages) {
      entries.push({
        id: c.id,
        type: 'collective',
        actor: c.role === 'assistant' ? 'claude-galen' : (c.userName || 'User'),
        actorId: null,
        target: c.role === 'assistant' ? 'reply' : 'message',
        content: c.content,
        meta: {
          role: c.role,
          model: c.model,
          replyTo: c.replyToUserId,
        },
        createdAt: c.createdAt.toISOString(),
      })
    }
  }

  // 3. Shell action logs (if any exist)
  if (!typeFilter || typeFilter === 'action') {
    const actionLogs = await prisma.shellActionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        heartbeatId: true,
        actor: true,
        actorId: true,
        action: true,
        input: true,
        output: true,
        success: true,
        createdAt: true,
      },
    })

    for (const a of actionLogs) {
      entries.push({
        id: a.id,
        type: 'action',
        actor: a.actor,
        actorId: a.actorId,
        target: a.action,
        content: a.output?.substring(0, 300) || '',
        meta: {
          action: a.action,
          input: a.input?.substring(0, 200) || null,
          success: a.success,
          heartbeatId: a.heartbeatId,
        },
        createdAt: a.createdAt.toISOString(),
      })
    }
  }

  // Sort chronologically (most recent first)
  entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return NextResponse.json({
    entries: entries.slice(0, limit),
    shells: allShells.map(s => ({ id: s.id, name: s.name })),
    total: entries.length,
  })
}
