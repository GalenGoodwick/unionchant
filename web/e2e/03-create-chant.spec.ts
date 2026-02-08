import { test, expect } from '@playwright/test'

test.describe('Create Chant', () => {
  test('create chant page renders form', async ({ page }) => {
    await page.goto('/chants/new')
    await expect(page.getByPlaceholder(/priority|decide|question/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /create/i })).toBeVisible()
  })

  test('create chant submits and redirects to chant page', async ({ page }) => {
    await page.goto('/chants/new')
    const question = `E2E Test Chant ${Date.now()}`

    // Fill the question field
    await page.getByPlaceholder(/priority|decide|question/i).fill(question)

    // Submit the form
    await page.getByRole('button', { name: /create/i }).click()

    // Should redirect to the new chant detail page
    await page.waitForURL(/\/chants\//, { timeout: 15_000 })
    await expect(page.getByText(question)).toBeVisible({ timeout: 10_000 })
  })
})
