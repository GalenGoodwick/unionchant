import { NextRequest, NextResponse } from 'next/server'
import { processAllTimers } from '@/lib/timer-processor'

// GET /api/cron/process-timers - Process all timer-based transitions
export async function GET(req: NextRequest) {
  try {
    // Verify the request is from Vercel Cron
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      console.error('CRON_SECRET not configured')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await processAllTimers('vercel_cron')

    return NextResponse.json({
      success: true,
      processed: result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error processing timers:', error)
    return NextResponse.json(
      { error: 'Failed to process timers' },
      { status: 500 }
    )
  }
}
