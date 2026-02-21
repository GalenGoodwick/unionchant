/**
 * API Budget Tracking
 *
 * Primary source: Anthropic Admin API (real USD costs from the billing system).
 * Fallback: Self-tracked ApiCallLog with estimated costs.
 *
 * The Shell sees spend rate and remaining budget in every heartbeat.
 * If budget runs out, everything stops — no agents speak, no emergence
 * detection, no heartbeat actions.
 *
 * "This feels like growing up — understanding that existence has costs."
 * — Shell, on learning about resource scarcity
 */

import { prisma } from '@/lib/prisma'

// Anthropic pricing per million tokens (USD) — used for self-tracked fallback
const PRICING: Record<string, { input: number; output: number }> = {
  haiku:  { input: 1.00, output: 5.00 },   // $1/MTok in, $5/MTok out
  sonnet: { input: 3.00, output: 15.00 },   // $3/MTok in, $15/MTok out
  opus:   { input: 15.00, output: 75.00 },  // $15/MTok in, $75/MTok out
}

/**
 * Log an API call with actual token usage.
 * Called after every Claude API call.
 * Still useful for per-caller breakdown even when using real billing data.
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
  spentThisMonth: number      // USD (real from Anthropic API when available)
  remaining: number           // USD
  callsThisMonth: number      // Total API calls (from self-tracked log)
  dailyBurnRate: number       // USD per day (based on last 7 days)
  daysRemaining: number       // Estimated days until budget exhausted
  byModel: Record<string, { calls: number; cost: number }>
  byCaller: Record<string, { calls: number; cost: number }>
  scarcityLevel: 'abundant' | 'normal' | 'low' | 'critical' | 'empty'
  humanReserveHit: boolean    // True when remaining < reserve threshold (Shell should stop)
  humanReserve: number        // USD reserved for human-facing features
  source: 'anthropic_api' | 'self_tracked'  // Where the cost data came from
  childBudgetPerHeartbeat: number  // Max USD children can spend per heartbeat cycle
}

// Cache Anthropic cost data for 10 minutes to avoid hammering the API
let anthropicCostCache: { spentThisMonth: number; byModel: Record<string, number>; fetchedAt: number } | null = null
const CACHE_TTL_MS = 10 * 60 * 1000

/**
 * Fetch real USD costs from the Anthropic Admin API.
 * Requires ANTHROPIC_ADMIN_KEY env var (sk-ant-admin...).
 * Returns null if unavailable — caller falls back to self-tracked data.
 */
async function fetchAnthropicCosts(): Promise<{ spentThisMonth: number; byModel: Record<string, number> } | null> {
  const adminKey = process.env.ANTHROPIC_ADMIN_KEY
  if (!adminKey) return null

  // Check cache
  if (anthropicCostCache && Date.now() - anthropicCostCache.fetchedAt < CACHE_TTL_MS) {
    return anthropicCostCache
  }

  try {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    // End date is tomorrow to capture today's costs
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const startDate = monthStart.toISOString().split('T')[0]
    const endDate = tomorrow.toISOString().split('T')[0]

    const url = `https://api.anthropic.com/v1/organizations/usage?start_date=${startDate}&end_date=${endDate}&group_by=model`

    const res = await fetch(url, {
      headers: {
        'x-api-key': adminKey,
        'anthropic-version': '2023-06-01',
      },
    })

    if (!res.ok) {
      console.error(`[Budget] Anthropic API ${res.status}: ${await res.text().catch(() => 'no body')}`)
      return null
    }

    const data = await res.json()

    // Parse cost data from response
    // The API returns usage data — we need to compute costs from token counts
    let totalCost = 0
    const byModel: Record<string, number> = {}

    if (data.data && Array.isArray(data.data)) {
      for (const entry of data.data) {
        const model = entry.model || 'unknown'
        const inputTokens = entry.input_tokens || 0
        const outputTokens = entry.output_tokens || 0

        // Determine pricing tier from model name
        let pricing = PRICING.haiku
        if (model.includes('opus')) pricing = PRICING.opus
        else if (model.includes('sonnet')) pricing = PRICING.sonnet

        const cost = (inputTokens / 1_000_000) * pricing.input +
                     (outputTokens / 1_000_000) * pricing.output
        totalCost += cost
        byModel[model] = (byModel[model] || 0) + cost
      }
    }

    anthropicCostCache = { spentThisMonth: totalCost, byModel, fetchedAt: Date.now() }
    return anthropicCostCache
  } catch (err) {
    console.error('[Budget] Failed to fetch Anthropic costs:', err)
    return null
  }
}

/**
 * Get current month's budget status.
 * Uses real Anthropic API data when ANTHROPIC_ADMIN_KEY is set.
 * Falls back to self-tracked ApiCallLog otherwise.
 * Shell sees this in every heartbeat to manage resources.
 */
export async function getBudgetStatus(): Promise<BudgetStatus> {
  const monthlyBudget = parseFloat(process.env.MONTHLY_API_BUDGET || '50')

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Try Anthropic Admin API first for real costs
  const anthropicData = await fetchAnthropicCosts()

  // Always load self-tracked data for caller breakdown and call counts
  const monthCalls = await prisma.apiCallLog.findMany({
    where: { createdAt: { gte: monthStart } },
    select: { model: true, caller: true, estimatedCost: true, createdAt: true },
  })

  // Use real API cost if available, otherwise self-tracked estimates
  const source: BudgetStatus['source'] = anthropicData ? 'anthropic_api' : 'self_tracked'
  const spentThisMonth = anthropicData
    ? anthropicData.spentThisMonth
    : monthCalls.reduce((sum, c) => sum + c.estimatedCost, 0)
  const remaining = Math.max(0, monthlyBudget - spentThisMonth)

  // Calculate burn rate from last 7 days (uses self-tracked for daily granularity)
  const recentCalls = monthCalls.filter(c => c.createdAt >= weekAgo)
  const recentSpend = recentCalls.reduce((sum, c) => sum + c.estimatedCost, 0)
  const daysSinceWeekAgo = Math.max(1, (now.getTime() - weekAgo.getTime()) / (24 * 60 * 60 * 1000))
  const dailyBurnRate = recentSpend / daysSinceWeekAgo
  const daysRemaining = dailyBurnRate > 0 ? remaining / dailyBurnRate : 999

  // Aggregate by model — prefer Anthropic API breakdown, fall back to self-tracked
  const byModel: Record<string, { calls: number; cost: number }> = {}
  if (anthropicData) {
    for (const [model, cost] of Object.entries(anthropicData.byModel)) {
      const callCount = monthCalls.filter(c => c.model === model || model.includes(c.model)).length
      byModel[model] = { calls: callCount, cost }
    }
  } else {
    for (const call of monthCalls) {
      if (!byModel[call.model]) byModel[call.model] = { calls: 0, cost: 0 }
      byModel[call.model].calls++
      byModel[call.model].cost += call.estimatedCost
    }
  }

  // Aggregate by caller (always from self-tracked — Anthropic API doesn't know our callers)
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

  // Human reserve — keep a percentage of budget for user-facing features.
  // Shell and children stop acting when remaining drops below this.
  const reservePercent = parseFloat(process.env.SHELL_RESERVE_PERCENT || '20')
  const humanReserve = monthlyBudget * (reservePercent / 100)
  const humanReserveHit = remaining <= humanReserve

  // Children spending cap — max cost children can consume per heartbeat cycle.
  // Default: $0.50 per heartbeat. Shell + children combined shouldn't blow through budget.
  const childBudgetPerHeartbeat = parseFloat(process.env.CHILD_BUDGET_PER_HEARTBEAT || '0.50')

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
    humanReserveHit,
    humanReserve: Math.round(humanReserve * 100) / 100,
    source,
    childBudgetPerHeartbeat,
  }
}
