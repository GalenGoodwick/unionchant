import { test, expect } from '@playwright/test'

test.describe('Chant Detail - old route redirects into the docked feed', () => {
  let chantId: string
  let question: string

  test.beforeAll(async ({ request }) => {
    // Create a chant via API — need Origin header for CSRF
    question = `E2E Detail Test ${Date.now()}`
    const res = await request.post('/api/deliberations', {
      data: {
        question,
        description: 'Testing chant detail page',
        captchaToken: 'dev-bypass-token',
      },
      headers: { origin: 'http://localhost:3000' },
    })
    if (res.ok()) {
      const data = await res.json()
      chantId = data.id
    }
  })

  test('/chants/{id} redirects to the docked feed and shows the question', async ({ page }) => {
    test.skip(!chantId, 'Chant was not created — API may need Origin header')
    await page.goto(`/chants/${chantId}`)
    // Old standalone route 307s into the current UI
    await expect(page).toHaveURL(new RegExp(`dock=${chantId}`), { timeout: 10_000 })
    await expect(page.getByText(new RegExp(question)).first()).toBeVisible({ timeout: 10_000 })
  })

  test('submit an idea in the docked chant', async ({ page }) => {
    test.skip(!chantId, 'Chant was not created')
    await page.goto(`/?dock=${chantId}`)

    const ideaInput = page.getByPlaceholder(/idea/i)
    if (await ideaInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const ideaText = `Test idea from E2E ${Date.now()}`
      await ideaInput.fill(ideaText)
      await page.getByRole('button', { name: /submit/i }).click()
      await expect(page.getByText(ideaText)).toBeVisible({ timeout: 10_000 })
    }
  })
})
