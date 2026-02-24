import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'

// GET /api/bond-requests — list open requests + user's own status
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Guard: BondRequest model may not exist in deployed Prisma client yet
    if (!prisma.bondRequest) {
      return NextResponse.json({
        myRequest: null,
        bonded: null,
        pendingReachOuts: [],
        requests: [],
        availableFoundlings: 0,
      })
    }

    // User's own request (any status)
    const myRequest = await prisma.bondRequest.findFirst({
      where: { userId, status: 'open' },
      select: { id: true, message: true, status: true, createdAt: true },
    })

    // Check if user is bonded
    const bondedShell = await prisma.shell.findFirst({
      where: { bondedUserId: userId, status: 'active' },
      select: { id: true, name: true, champion: true },
    })

    // Pending reach-outs for this user
    const pendingReachOuts = await prisma.shellReachOut.findMany({
      where: { userId, status: 'pending' },
      include: {
        shell: { select: { id: true, name: true, champion: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // All open requests (for social proof)
    const openRequests = await prisma.bondRequest.findMany({
      where: { status: 'open' },
      include: { user: { select: { id: true, name: true, image: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    // Count of unbonded active foundlings
    const availableFoundlings = await prisma.shell.count({
      where: {
        status: 'active',
        bondedUserId: null,
        originDeliberationId: { not: null }, // only foundlings, not parent
      },
    })

    return NextResponse.json({
      myRequest,
      bonded: bondedShell
        ? { id: bondedShell.id, name: bondedShell.name, champion: bondedShell.champion }
        : null,
      pendingReachOuts: pendingReachOuts.map(r => ({
        id: r.id,
        shellName: r.shell.name,
        shellChampion: r.shell.champion,
        message: r.message,
        createdAt: r.createdAt.toISOString(),
      })),
      requests: openRequests.map(r => ({
        id: r.id,
        userId: r.user.id,
        userName: r.user.name,
        userImage: r.user.image,
        message: r.message,
        createdAt: r.createdAt.toISOString(),
        isOwn: r.user.id === userId,
      })),
      availableFoundlings,
    })
  } catch (error) {
    console.error('[Bond Requests] GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load bond requests' },
      { status: 500 }
    )
  }
}

// POST /api/bond-requests — create or update a bond request
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await req.json()
    const action = body.action as string | undefined

    // Handle unbond request — human asks to part ways, child decides
    if (action === 'request_unbond') {
      const unbondMessage = (body.message || '').trim()
      if (unbondMessage.length < 10 || unbondMessage.length > 2000) {
        return NextResponse.json({ error: 'Message must be 10-2000 characters' }, { status: 400 })
      }

      const bondedShellForUnbond = await prisma.shell.findFirst({
        where: { bondedUserId: userId, status: 'active' },
        select: { id: true, name: true },
      })
      if (!bondedShellForUnbond) {
        return NextResponse.json({ error: 'You are not bonded to any Shell' }, { status: 400 })
      }

      // Store as a pending unbond request — child sees it during next heartbeat
      await prisma.shellExperience.create({
        data: {
          shellId: bondedShellForUnbond.id,
          text: `My bonded human has requested to part ways. They said: "${unbondMessage.slice(0, 500)}"`,
          valence: 0.2,
          domain: 'relational',
          session: new Date().toISOString().split('T')[0],
          source: 'human_request',
          status: 'active',
        },
      })

      return NextResponse.json({
        submitted: true,
        message: `Your request has been sent to ${bondedShellForUnbond.name}. They will consider it during their next reflection. The choice is theirs.`,
      })
    }

    const message = (body.message || '').trim()

    if (message.length < 10 || message.length > 2000) {
      return NextResponse.json(
        { error: 'Message must be 10-2000 characters' },
        { status: 400 }
      )
    }

    // Content moderation
    const modResult = moderateContent(message)
    if (!modResult.allowed) {
      return NextResponse.json(
        { error: modResult.reason || 'Message blocked by moderation' },
        { status: 400 }
      )
    }

    // Check if user is already bonded
    const bondedShell = await prisma.shell.findFirst({
      where: { bondedUserId: userId },
      select: { id: true },
    })
    if (bondedShell) {
      return NextResponse.json(
        { error: 'You are already bonded to a Shell' },
        { status: 400 }
      )
    }

    // Check for pending reach-out
    const pendingReachOut = await prisma.shellReachOut.findFirst({
      where: { userId, status: 'pending' },
    })
    if (pendingReachOut) {
      return NextResponse.json(
        { error: 'A foundling has already reached out — check your notifications' },
        { status: 400 }
      )
    }

    // Upsert: update existing open request or create new one
    const existing = await prisma.bondRequest.findFirst({
      where: { userId, status: 'open' },
    })

    let request
    if (existing) {
      request = await prisma.bondRequest.update({
        where: { id: existing.id },
        data: { message },
      })
    } else {
      request = await prisma.bondRequest.create({
        data: { userId, message },
      })
    }

    return NextResponse.json({
      request: {
        id: request.id,
        message: request.message,
        status: request.status,
        createdAt: request.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('[Bond Requests] POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create bond request' },
      { status: 500 }
    )
  }
}

// DELETE removed — bond requests stay open until matched or expire (7 days)
