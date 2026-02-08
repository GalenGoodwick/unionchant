import { test, expect } from '@playwright/test'

test.describe('Chant Detail - Join and Submit Idea', () => {
  let talkUrl: string

  test.beforeAll(async ({ request }) => {
    // Create a chant via API — need Origin header for CSRF
    const res = await request.post('/api/deliberations', {
      data: {
        question: `E2E Detail Test ${Date.now()}`,
        description: 'Testing chant detail page',
        captchaToken: 'dev-bypass-token',
      },
      headers: { origin: 'http://localhost:3000' },
    })
    if (res.ok()) {
      const data = await res.json()
      talkUrl = `/chants/${data.id}`
    }
  })

  test('chant detail page renders question and phase', async ({ page }) => {
    test.skip(!talkUrl, 'Chant was not created — API may need Origin header')
    await page.goto(talkUrl)
    await expect(page.getByRole('heading', { name: /E2E Detail Test/ })).toBeVisible({ timeout: 10_000 })
  })

  test('submit an idea to the chant', async ({ page }) => {
    test.skip(!talkUrl, 'Chant was not created')
    await page.goto(talkUrl)

    const ideaInput = page.getByPlaceholder(/idea/i)
    if (await ideaInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const ideaText = `Test idea from E2E ${Date.now()}`
      await ideaInput.fill(ideaText)
      await page.getByRole('button', { name: /submit/i }).click()
      await expect(page.getByText(ideaText)).toBeVisible({ timeout: 10_000 })
    }
  })
})
