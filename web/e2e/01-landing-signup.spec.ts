import { test, expect } from '@playwright/test'

test.describe('Landing page and Sign Up', () => {
  // These tests run unauthenticated
  test.use({ storageState: { cookies: [], origins: [] } })

  test('landing page renders hero and CTA', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Get Started', exact: true })).toBeVisible()
  })

  test('landing page shows content sections', async ({ page }) => {
    await page.goto('/')
    // The page has content below the hero
    await expect(page.locator('main, section, [class*="max-w"]').first()).toBeVisible()
  })

  test('sign up link navigates to signup page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Get Started', exact: true }).click()
    await expect(page).toHaveURL(/auth\/sign/)
  })

  test('signup page renders form fields', async ({ page }) => {
    await page.goto('/auth/signup')
    await expect(page.locator('input[type="email"], input[placeholder*="email" i]').first()).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
  })

  test('signup form creates account and shows confirmation', async ({ page }) => {
    await page.goto('/auth/signup')
    const uniqueEmail = `e2e-signup-${Date.now()}@test.local`

    // Fill name if visible
    const nameInput = page.locator('input[placeholder*="name" i], input[name="name"]').first()
    if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nameInput.fill('Signup Test')
    }

    await page.locator('input[type="email"], input[placeholder*="email" i]').first().fill(uniqueEmail)
    await page.locator('input[type="password"]').first().fill('TestPassword123!')

    // Wait for CAPTCHA auto-bypass then submit
    await page.waitForTimeout(1000)
    await page.locator('button[type="submit"]').click()

    // Should show "Check your email" confirmation heading
    await expect(
      page.getByRole('heading', { name: /check your email/i })
    ).toBeVisible({ timeout: 15_000 })
  })
})
