import { NextResponse } from 'next/server'
import { processAllTimers } from '@/lib/timer-processor'

// GET /api/cron/tick - Public endpoint for external cron services
// Can be called by services like cron-job.org, EasyCron, etc.
export async function GET() {
  try {
    const result = await processAllTimers()

    return NextResponse.json({
      success: true,
      processed: result.total,
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

// Prevent caching
export const dynamic = 'force-dynamic'
export const revalidate = 0
