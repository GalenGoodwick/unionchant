import { NextResponse } from 'next/server'
import { processNextAgentAction } from '@/lib/ai-orchestrator'

// GET /api/cron/ai-orchestrator - Vercel cron handler
export async function GET() {
  try {
    const result = await processNextAgentAction()

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[AI Orchestrator Cron] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Orchestrator failed' },
      { status: 500 }
    )
  }
}
