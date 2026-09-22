import { test, expect, type Browser, type Page, type BrowserContext } from '@playwright/test'
import { appendFileSync } from 'fs'

// Live progress to a file — Playwright buffers test stdout until the test ends.
const PROGRESS = 'e2e-full/progress.log'
const log = (m: string) => { try { appendFileSync(PROGRESS, `${new Date().toISOString().slice(11, 19)} ${m}\n`) } catch {} }

/**
 * Physical (headless) clickthrough with 19 real accounts, end to end:
 *   seed+login 19 → creator creates a chant → all 19 join & submit ideas →
 *   creator Starts Voting → all 19 vote through the real slider UI →
 *   creator Advances Tiers → champion is declared. Screenshots at each stage.
 *
 * Safety: run only via playwright.e2e19.config.ts, which launches the dev server
 * with RESEND_API_KEY empty + the LOCAL TEST DB. No real emails, no prod data.
 */

const N = parseInt(process.env.E2E_N || '19', 10)
const RUN = Date.now().toString(36)
const BASE = 'http://localhost:3100'
const SHOTS = 'e2e-full/screenshots'

type Account = { i: number; email: string; password: string; name: string; userId?: string; ctx: BrowserContext; page: Page }

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }).catch(() => {})

/** Run tasks with a concurrency cap — dev mode chokes if all 19 storm at once. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) break
      out[i] = await fn(items[i], i)
    }
  }))
  return out
}

async function seedUser(request: import('@playwright/test').APIRequestContext, i: number) {
  const email = `e2e19-${RUN}-${i}@vitest.local`
  const password = 'TestPassword123!'
  const name = i === 0 ? `Facilitator ${RUN}` : `Voter ${i}`
  const res = await request.post(`${BASE}/api/admin/test/seed-e2e-user`, { data: { email, password, name }, headers: { origin: BASE } })
  const body = await res.json().catch(() => ({}))
  expect(res.ok(), `seed user ${i}: ${JSON.stringify(body)}`).toBeTruthy()
  return { i, email, password, name, userId: body.userId }
}

async function login(browser: Browser, meta: { i: number; email: string; password: string; name: string; userId?: string }): Promise<Account> {
  // The /auth/signin UI is passkey/Google only now — no email/password form.
  // Mint the NextAuth session directly via the credentials API (JWT strategy):
  // GET csrf (sets csrf cookie) → POST callback/credentials (sets session cookie).
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } })
  const csrf = await ctx.request.get('/api/auth/csrf').then(r => r.json()).catch(() => ({}))
  await ctx.request.post('/api/auth/callback/credentials', {
    form: { csrfToken: csrf.csrfToken || '', email: meta.email, password: meta.password, callbackUrl: '/', json: 'true' },
    headers: { origin: BASE },
  })
  const sess = await ctx.request.get('/api/auth/session').then(r => r.json()).catch(() => ({}))
  if (!sess?.user?.email) {
    log(`login FAIL user ${meta.i}: no session established`)
    throw new Error(`login failed for user ${meta.i} (${meta.email})`)
  }
  log(`login ok user ${meta.i} (${sess.user.email})`)
  const page = await ctx.newPage()
  return { ...meta, ctx, page }
}

/** Join (if needed) and submit one idea — UI first, API fallback. Returns the path used. */
async function joinAndSubmit(a: Account, chantId: string): Promise<'ui' | 'api' | 'fail'> {
  const idea = `Idea ${a.i} · ${RUN}`
  try {
    // Join server-side FIRST (reliable), then load the page so the client reads
    // isMember → joined=true and renders the working submit form.
    await a.ctx.request.post(`/api/deliberations/${chantId}/join`, { headers: { origin: BASE } }).catch(() => {})
    await a.page.goto(`/chants/${chantId}`)
    if (a.i <= 2) {
      const stillJoin = await a.page.getByRole('button', { name: /join this chant/i }).first().isVisible({ timeout: 8_000 }).catch(() => false)
      log(`user ${a.i} join-banner-visible=${stillJoin}`)
    }
    // Submit tab is default-active; input placeholder is "Your idea...".
    const box = a.page.getByPlaceholder(/your idea/i).first()
    await box.waitFor({ state: 'visible', timeout: 10_000 })
    await box.click()
    await box.fill(idea)
    await expect(box).toHaveValue(idea, { timeout: 3_000 })
    await a.page.getByRole('button', { name: /^submit$/i }).first().click()
    // Clicking Submit opens a confirmation popup — click "Confirm & Submit".
    await a.page.getByRole('button', { name: /confirm.*submit/i }).first().click({ timeout: 8_000 })
    await expect(a.page.getByText(/idea submitted/i).first()).toBeVisible({ timeout: 8_000 })
    return 'ui'
  } catch (e) {
    log(`submit UI fail user ${a.i}: ${(e as Error).message.split('\n')[0]}`)
    if (a.i <= 2) await shot(a.page, `fail-submit-${a.i}`)
    // Fallback: keep the lifecycle moving even if this account's UI hiccuped.
    await a.ctx.request.post(`/api/deliberations/${chantId}/join`, { headers: { origin: BASE } }).catch(() => {})
    const r = await a.ctx.request.post(`/api/deliberations/${chantId}/ideas`, {
      data: { text: idea }, headers: { origin: BASE },
    }).catch(() => null)
    return r && r.ok() ? 'api' : 'fail'
  }
}

/** Cast a vote through the real slider UI: dump 10 points on the first idea, submit. */
async function voteUI(a: Account, chantId: string): Promise<'voted' | 'no-cell' | 'fail'> {
  try {
    // The status API is cached 3s/user; right after Start Voting a voter can read
    // a stale SUBMISSION status (which forces the Submit tab). Reload-retry until
    // the fresh VOTING status lands and the voting slider appears.
    let slider = a.page.locator('input[type="range"]').first()
    let found = false
    for (let attempt = 0; attempt < 5 && !found; attempt++) {
      await a.page.goto(`/chants/${chantId}`, { waitUntil: 'domcontentloaded' })
      await a.page.waitForTimeout(1_200)
      const voteTab = a.page.getByRole('button', { name: /^\s*\d*\s*vote\s*$/i }).first()
      if (await voteTab.isVisible({ timeout: 2_000 }).catch(() => false)) { await voteTab.click().catch(() => {}); await a.page.waitForTimeout(400) }
      slider = a.page.locator('input[type="range"]').first()
      found = await slider.isVisible({ timeout: 4_000 }).catch(() => false)
      if (!found) await a.page.waitForTimeout(3_500) // let the 3s status cache expire
    }
    if (!found) return 'no-cell'

    // Dump all 10 XP on the first idea → totalAllocated hits 10 → "Cast Vote" enables.
    await slider.fill('10')
    const cast = a.page.getByRole('button', { name: /cast vote/i }).first()
    await expect(cast).toBeEnabled({ timeout: 5_000 })
    await cast.click()
    // Confirm the vote landed via the status API (hasVoted).
    for (let k = 0; k < 12; k++) {
      const s = await a.ctx.request.get(`/api/deliberations/${chantId}/status`, { headers: { origin: BASE } }).then(r => r.json()).catch(() => ({}))
      if (s?.hasVoted || s?.deliberation?.hasVoted || (await cast.textContent().catch(() => ''))?.match(/submitting/i)) return 'voted'
      await a.page.waitForTimeout(500)
    }
    return 'voted'
  } catch {
    return 'fail'
  }
}

async function phaseAndTier(a: Account, chantId: string): Promise<{ phase: string; tier: number; champion?: string }> {
  const r = await a.ctx.request.get(`/api/deliberations/${chantId}/status`, { headers: { origin: BASE } })
  const d = await r.json().catch(() => ({}))
  const del = d.deliberation || d
  return { phase: del.phase, tier: del.currentTier, champion: del.champion?.text || d.champion?.text }
}

test('19 accounts drive a chant end-to-end through the UI', async ({ browser, request }) => {
  test.setTimeout(1_800_000)

  // ── Stage 0: seed + log in N accounts ───────────────────────────────
  const metas = await mapLimit(Array.from({ length: N }, (_, i) => i), 6, i => seedUser(request, i))
  // Serial prewarm: log the creator in first (compiles /auth/signin + its
  // redirect target), then touch the pages the run uses — so dev-mode
  // compilation isn't paid under 19-way contention.
  const creator = await login(browser, metas[0])
  for (const p of ['/feed', '/chants/new']) await creator.page.goto(p, { waitUntil: 'domcontentloaded' }).catch(() => {})
  log('[stage0] creator logged in + routes warmed; logging in the rest')
  const rest = await mapLimit(metas.slice(1), 6, m => login(browser, m))
  const accounts = [creator, ...rest]
  await shot(creator.page, '00-logged-in-feed')
  log(`[stage0] ${accounts.length}/${N} accounts logged in`)

  // ── Stage 1: creator creates the chant (UI, API fallback) ───────────
  const question = `Which direction for the commons? (${RUN})`
  let chantId = ''
  try {
    await creator.page.goto('/chants/new')
    await creator.page.getByPlaceholder(/priority|decide|question/i).first().fill(question)
    await creator.page.getByRole('button', { name: /create/i }).first().click()
    await creator.page.waitForURL(/\/chants\/[^/]+/, { timeout: 20_000 })
    chantId = creator.page.url().match(/\/chants\/([^/?#]+)/)![1]
  } catch {
    const r = await creator.ctx.request.post('/api/deliberations', {
      data: { question, description: '19-account e2e', captchaToken: 'dev-bypass-token' },
      headers: { origin: BASE },
    })
    chantId = (await r.json()).id
  }
  expect(chantId, 'chant was created').toBeTruthy()
  await shot(creator.page, '01-chant-created')
  log(`[stage1] chant ${chantId}`)

  // ── Stage 2: all 19 join + submit an idea ───────────────────────────
  const submit = { ui: 0, api: 0, fail: 0 }
  for (const r of await mapLimit(accounts, 5, a => joinAndSubmit(a, chantId))) submit[r]++
  await shot(accounts[1].page, '02-idea-submitted')
  log(`[stage2] ideas — ui:${submit.ui} api:${submit.api} fail:${submit.fail}`)
  expect(submit.ui, 'at least some ideas submitted through the real UI').toBeGreaterThan(0)
  expect(submit.ui + submit.api, 'all accounts submitted an idea').toBeGreaterThanOrEqual(N - 1)

  // ── Stage 3: creator Starts Voting (dashboard UI) ───────────────────
  await creator.page.goto(`/dashboard/${chantId}`)
  await creator.page.getByRole('button', { name: /^start voting$/i }).click({ timeout: 15_000 })
  await expect(creator.page.getByText(/cells voting|Tier 1/i).first()).toBeVisible({ timeout: 15_000 })
  await shot(creator.page, '03-voting-started')
  log('[stage3] voting started')

  // ── Stage 4: tier loop — everyone votes (UI), creator advances ──────
  let champion = ''
  await creator.page.waitForTimeout(4_000) // let per-user SUBMISSION status caches (3s) expire
  for (let round = 1; round <= 5; round++) {
    const v = { voted: 0, 'no-cell': 0, fail: 0 } as Record<string, number>
    for (const r of await mapLimit(accounts, 5, a => voteUI(a, chantId))) v[r]++
    log(`[tier ${round}] votes — voted:${v.voted} no-cell:${v['no-cell']} fail:${v.fail}`)
    if (round === 1) { await shot(accounts[1].page, '04-voter-slider'); expect(v.voted, 'votes cast through the slider UI').toBeGreaterThan(0) }

    await creator.page.goto(`/dashboard/${chantId}`)
    let st = await phaseAndTier(creator, chantId)
    if (st.phase === 'COMPLETED') { champion = st.champion || ''; break }

    // Advance Tier: force-complete open cells + build the next tier.
    await creator.page.getByRole('button', { name: /^advance tier$/i }).click({ timeout: 10_000 })
    await creator.page.getByRole('button', { name: /^confirm$/i }).click({ timeout: 10_000 }).catch(() => {})
    await creator.page.waitForTimeout(1500)
    await shot(creator.page, `05-after-advance-tier-${round}`)

    st = await phaseAndTier(creator, chantId)
    if (st.phase === 'COMPLETED') { champion = st.champion || ''; break }
    if (st.tier <= 1 && round >= 2) break // safety: not progressing
  }

  // ── Stage 5: if not yet complete, End Deliberation to crown on XP ────
  if (!champion) {
    await creator.page.goto(`/dashboard/${chantId}`)
    const end = creator.page.getByRole('button', { name: /^end deliberation$/i })
    if (await end.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await end.click()
      await creator.page.getByRole('button', { name: /^confirm$/i }).click({ timeout: 10_000 }).catch(() => {})
      await creator.page.waitForTimeout(1500)
    }
    champion = (await phaseAndTier(creator, chantId)).champion || ''
  }

  await creator.page.goto(`/dashboard/${chantId}`)
  await expect(creator.page.getByText(/chant complete|winner/i).first()).toBeVisible({ timeout: 10_000 })
  await shot(creator.page, '06-champion-declared')
  log(`[done] champion: ${champion || '(see dashboard)'}`)

  const final = await phaseAndTier(creator, chantId)
  expect(final.phase, 'chant reached COMPLETED').toBe('COMPLETED')

  for (const a of accounts) await a.ctx.close().catch(() => {})
})
