import { test, expect } from '@playwright/test'

test.describe('Create Talk', () => {
  test('create talk page renders form', async ({ page }) => {
    await page.goto('/talks/new')
    await expect(page.getByPlaceholder(/priority|decide|question/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /create/i })).toBeVisible()
  })

  test('create talk submits and redirects to talk page', async ({ page }) => {
    await page.goto('/talks/new')
    const question = `E2E Test Talk ${Date.now()}`

    // Fill the question field
    await page.getByPlaceholder(/priority|decide|question/i).fill(question)

    // Submit the form
    await page.getByRole('button', { name: /create/i }).click()

    // Should redirect to the new talk detail page
    await page.waitForURL(/\/talks\//, { timeout: 15_000 })
    await expect(page.getByText(question)).toBeVisible({ timeout: 10_000 })
  })
})
