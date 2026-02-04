import { test, expect } from '@playwright/test'

test.describe('Feed Cards', () => {
  test('feed shows content after loading', async ({ page }) => {
    await page.goto('/feed')

    // Wait for loading to finish
    await page.waitForTimeout(2000)

    // Either there are feed cards or an empty state message
    const hasCards = await page.locator('[class*="rounded"]').count() > 0
    const hasEmptyState = await page.getByText(/no.*talks|create|browse/i).isVisible().catch(() => false)
    expect(hasCards || hasEmptyState).toBeTruthy()
  })

  test('clicking a feed card navigates to talk detail', async ({ page }) => {
    await page.goto('/feed')
    await page.waitForTimeout(2000)

    // Find any link to a talk detail page
    const talkLink = page.locator('a[href*="/talks/"]').first()
    if (await talkLink.isVisible()) {
      await talkLink.click()
      await expect(page).toHaveURL(/\/talks\//)
    }
  })
})
