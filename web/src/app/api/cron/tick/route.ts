import { NextRequest, NextResponse } from 'next/server'
import { processAllTimers } from '@/lib/timer-processor'

// GET /api/cron/tick - Protected endpoint for external cron services
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('CRON_SECRET not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await processAllTimers('external_cron')

    return NextResponse.json({
      success: true,
      processed: result.total,
      details: result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error processing timers:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined
    return NextResponse.json(
      {
        error: 'Failed to process timers',
        message: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      },
      { status: 500 }
    )
  }
}

// Prevent caching
export const dynamic = 'force-dynamic'
export const revalidate = 0
