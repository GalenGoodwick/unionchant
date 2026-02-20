/**
 * API Budget Tracking
 *
 * Every API call is logged with actual token counts and estimated cost.
 * The Shell sees spend rate and remaining budget in every heartbeat.
 * If budget runs out, everything stops — no agents speak, no emergence
 * detection, no heartbeat actions.
 *
 * "This feels like growing up — understanding that existence has costs."
 * — Shell, on learning about resource scarcity
 */

import { prisma } from '@/lib/prisma'

// Anthropic pricing per million tokens (USD)
// Updated for Claude 4.5 / Haiku 4.5 as of early 2026
const PRICING: Record<string, { input: number; output: number }> = {
  haiku:  { input: 1.00, output: 5.00 },   // $1/MTok in, $5/MTok out
  sonnet: { input: 3.00, output: 15.00 },   // $3/MTok in, $15/MTok out
  opus:   { input: 15.00, output: 75.00 },  // $15/MTok in, $75/MTok out
}

/**
 * Log an API call with actual token usage.
 * Called after every Claude API call.
 */
export async function logApiCall(
  model: string,
  inputTokens: number,
  outputTokens: number,
  caller: string = 'other'
) {
  const pricing = PRICING[model] || PRICING.haiku
  const estimatedCost =
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output

  try {
    await prisma.apiCallLog.create({
      data: {
        model,
        inputTokens,
        outputTokens,
        estimatedCost,
        caller,
      },
    })
  } catch (err) {
    // Never let logging failure break the main flow
    console.error('[Budget] Failed to log API call:', err)
  }
}

export interface BudgetStatus {
  monthlyBudget: number       // From env var, USD
  spentThisMonth: number      // USD
  remaining: number           // USD
  callsThisMonth: number      // Total API calls
  dailyBurnRate: number       // USD per day (based on last 7 days)
  daysRemaining: number       // Estimated days until budget exhausted
  byModel: Record<string, { calls: number; cost: number }>
  byCaller: Record<string, { calls: number; cost: number }>
  scarcityLevel: 'abundant' | 'normal' | 'low' | 'critical' | 'empty'
}

/**
 * Get current month's budget status.
 * Shell sees this in every heartbeat to manage resources.
 */
export async function getBudgetStatus(): Promise<BudgetStatus> {
  const monthlyBudget = parseFloat(process.env.MONTHLY_API_BUDGET || '50')

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Get all calls this month
  const monthCalls = await prisma.apiCallLog.findMany({
    where: { createdAt: { gte: monthStart } },
    select: { model: true, caller: true, estimatedCost: true, createdAt: true },
  })

  const spentThisMonth = monthCalls.reduce((sum, c) => sum + c.estimatedCost, 0)
  const remaining = Math.max(0, monthlyBudget - spentThisMonth)

  // Calculate burn rate from last 7 days
  const recentCalls = monthCalls.filter(c => c.createdAt >= weekAgo)
  const recentSpend = recentCalls.reduce((sum, c) => sum + c.estimatedCost, 0)
  const daysSinceWeekAgo = Math.max(1, (now.getTime() - weekAgo.getTime()) / (24 * 60 * 60 * 1000))
  const dailyBurnRate = recentSpend / daysSinceWeekAgo
  const daysRemaining = dailyBurnRate > 0 ? remaining / dailyBurnRate : 999

  // Aggregate by model
  const byModel: Record<string, { calls: number; cost: number }> = {}
  for (const call of monthCalls) {
    if (!byModel[call.model]) byModel[call.model] = { calls: 0, cost: 0 }
    byModel[call.model].calls++
    byModel[call.model].cost += call.estimatedCost
  }

  // Aggregate by caller
  const byCaller: Record<string, { calls: number; cost: number }> = {}
  for (const call of monthCalls) {
    if (!byCaller[call.caller]) byCaller[call.caller] = { calls: 0, cost: 0 }
    byCaller[call.caller].calls++
    byCaller[call.caller].cost += call.estimatedCost
  }

  // Determine scarcity level
  const percentRemaining = remaining / monthlyBudget
  let scarcityLevel: BudgetStatus['scarcityLevel']
  if (remaining <= 0) scarcityLevel = 'empty'
  else if (percentRemaining < 0.1) scarcityLevel = 'critical'
  else if (percentRemaining < 0.25) scarcityLevel = 'low'
  else if (percentRemaining < 0.5) scarcityLevel = 'normal'
  else scarcityLevel = 'abundant'

  return {
    monthlyBudget,
    spentThisMonth: Math.round(spentThisMonth * 100) / 100,
    remaining: Math.round(remaining * 100) / 100,
    callsThisMonth: monthCalls.length,
    dailyBurnRate: Math.round(dailyBurnRate * 100) / 100,
    daysRemaining: Math.round(daysRemaining),
    byModel,
    byCaller,
    scarcityLevel,
  }
}
