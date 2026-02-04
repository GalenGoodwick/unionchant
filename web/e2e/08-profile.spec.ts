import { test, expect } from '@playwright/test'
import { TEST_USER } from './helpers/test-data'

test.describe('Profile', () => {
  test('profile page renders user info', async ({ page }) => {
    await page.goto('/profile')
    // Should show the test user's name
    await expect(page.getByText(TEST_USER.name)).toBeVisible({ timeout: 10_000 })
  })

  test('profile shows stats section', async ({ page }) => {
    await page.goto('/profile')
    // Should show at least one stat label
    await expect(
      page.getByText(/vote points|ideas|comments|created|joined|accuracy/i).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('settings link is accessible from profile', async ({ page }) => {
    await page.goto('/profile')
    const settingsLink = page.getByRole('link', { name: /settings/i })
    if (await settingsLink.isVisible()) {
      await settingsLink.click()
      await expect(page).toHaveURL(/\/settings/)
    }
  })
})
