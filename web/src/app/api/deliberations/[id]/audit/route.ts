import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/admin'

// GET /api/deliberations/[id]/audit — All cell dialogue, chronologically. Creator/admin only.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const deliberation = await prisma.deliberation.findUnique({
    where: { id },
    select: { creatorId: true },
  })
  if (!deliberation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const admin = await isAdmin(session.user.email)
  if (deliberation.creatorId !== user.id && !admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch after cursor if provided (for incremental polling)
  const after = req.nextUrl.searchParams.get('after')

  const dialogues = await prisma.cellDialogue.findMany({
    where: {
      cell: { deliberationId: id },
      ...(after ? { createdAt: { gt: new Date(after) } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 500,
    select: {
      id: true,
      content: true,
      role: true,
      createdAt: true,
      cellId: true,
      user: { select: { name: true } },
      shell: { select: { name: true } },
      cell: { select: { tier: true, status: true } },
    },
  })

  return NextResponse.json({
    dialogues: dialogues.map(d => ({
      id: d.id,
      content: d.content,
      role: d.role,
      speakerName: d.role === 'shell' ? (d.shell?.name || 'Shell')
        : d.role === 'system' ? 'System'
        : (d.user?.name || 'Agent'),
      cellId: d.cellId,
      cellTier: d.cell.tier,
      cellStatus: d.cell.status,
      createdAt: d.createdAt.toISOString(),
    })),
  })
}
