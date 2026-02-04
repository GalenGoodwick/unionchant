import { test, expect } from '@playwright/test'

test.describe('Notifications', () => {
  test('notifications page renders', async ({ page }) => {
    await page.goto('/notifications')
    await expect(page.getByText(/notifications/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('notifications page shows list or empty state', async ({ page }) => {
    await page.goto('/notifications')
    await page.waitForTimeout(2000)

    const hasNotifications = await page.locator('[class*="border"]').count() > 2
    const hasEmpty = await page.getByText(/no notifications/i).isVisible().catch(() => false)
    expect(hasNotifications || hasEmpty).toBeTruthy()
  })

  test('notification bell is visible in header', async ({ page }) => {
    await page.goto('/feed')
    await expect(page.getByLabel('Notifications').first()).toBeVisible()
  })
})
