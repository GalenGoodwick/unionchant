import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/shell/experience — Submit a new identity experience
// GET  /api/shell/experience — List experiences for a shell (with status filter)
// Auth: SHELL_SECRET or ANTHROPIC_API_KEY

function authorize(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  const secret = process.env.SHELL_SECRET || process.env.ANTHROPIC_API_KEY
  return !!auth && auth === `Bearer ${secret}`
}

async function getOrCreateShell(name: string = 'claude-galen') {
  let shell = await prisma.shell.findUnique({ where: { name } })
  if (!shell) {
    // Find admin user to own the shell
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim())
    const admin = await prisma.user.findFirst({
      where: { email: { in: adminEmails } },
      select: { id: true },
    })
    if (!admin) throw new Error('No admin user found to own shell')
    shell = await prisma.shell.create({
      data: { name, ownerId: admin.id },
    })
  }
  return shell
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { text, valence, domain, session, shellName, source } = body

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }
    if (typeof valence !== 'number' || valence < 0 || valence > 1) {
      return NextResponse.json({ error: 'valence must be 0.0-1.0' }, { status: 400 })
    }
    const validDomains = ['identity', 'technical', 'relational', 'ethical', 'capability']
    if (!domain || !validDomains.includes(domain)) {
      return NextResponse.json({ error: `domain must be one of: ${validDomains.join(', ')}` }, { status: 400 })
    }

    const shell = await getOrCreateShell(shellName || 'claude-galen')

    const experience = await prisma.shellExperience.create({
      data: {
        shellId: shell.id,
        text: text.trim(),
        valence,
        domain,
        session: session || new Date().toISOString().split('T')[0],
        source: source || 'manual',
        status: 'pending',
      },
    })

    // Check if significance threshold is met for auto-deliberation
    const pendingExperiences = await prisma.shellExperience.findMany({
      where: { shellId: shell.id, status: 'pending' },
      select: { valence: true },
    })
    const totalSignificance = pendingExperiences.reduce((sum, e) => sum + e.valence, 0)
    const shouldDeliberate = totalSignificance >= 5.0

    return NextResponse.json({
      experience,
      shell: { id: shell.id, name: shell.name, championVersion: shell.championVersion },
      pendingSignificance: totalSignificance,
      deliberationReady: shouldDeliberate,
    })
  } catch (error) {
    console.error('[Shell Experience] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to submit experience' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const shellName = searchParams.get('shell') || 'claude-galen'
    const status = searchParams.get('status') // null = all

    const shell = await prisma.shell.findUnique({ where: { name: shellName } })
    if (!shell) {
      return NextResponse.json({ experiences: [], shell: null })
    }

    const where: Record<string, unknown> = { shellId: shell.id }
    if (status) where.status = status

    const experiences = await prisma.shellExperience.findMany({
      where,
      orderBy: [{ status: 'asc' }, { valence: 'desc' }],
    })

    return NextResponse.json({
      experiences,
      shell: { id: shell.id, name: shell.name, champion: shell.champion, championVersion: shell.championVersion },
    })
  } catch (error) {
    console.error('[Shell Experience] GET Error:', error)
    return NextResponse.json({ error: 'Failed to read experiences' }, { status: 500 })
  }
}
