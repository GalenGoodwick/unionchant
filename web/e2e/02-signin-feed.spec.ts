import { test, expect } from '@playwright/test'
import { TEST_USER } from './helpers/test-data'

test.describe('Sign In and Feed', () => {
  test('sign in page renders form and social buttons', async ({ page }) => {
    // Use unauthenticated state for this test
    await page.context().clearCookies()
    await page.goto('/auth/signin')
    await expect(page.getByText('Sign in to Union Chant')).toBeVisible()
    await expect(page.getByText('Continue with Google')).toBeVisible()
    await expect(page.getByPlaceholder('Email')).toBeVisible()
    await expect(page.getByPlaceholder('Password')).toBeVisible()
  })

  test('feed page loads and shows tabs', async ({ page }) => {
    await page.goto('/feed')
    await expect(page.getByRole('tab', { name: /feed/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /activity/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /results/i })).toBeVisible()
  })

  test('feed tabs switch content', async ({ page }) => {
    await page.goto('/feed')

    // Click Activity tab
    await page.getByRole('tab', { name: /activity/i }).click()
    await expect(page.getByRole('tab', { name: /activity/i })).toHaveAttribute('aria-selected', 'true')

    // Click Results tab
    await page.getByRole('tab', { name: /results/i }).click()
    await expect(page.getByRole('tab', { name: /results/i })).toHaveAttribute('aria-selected', 'true')

    // Click Feed tab to go back
    await page.getByRole('tab', { name: /feed/i }).click()
    await expect(page.getByRole('tab', { name: /feed/i })).toHaveAttribute('aria-selected', 'true')
  })
})
