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
