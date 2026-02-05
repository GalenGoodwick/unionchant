import { test, expect } from '@playwright/test'

test.describe('Header Navigation', () => {
  test('header renders logo and nav links', async ({ page }) => {
    await page.goto('/feed')
    // Use the header nav specifically
    const header = page.locator('header')
    await expect(header.getByText('Unity Chant')).toBeVisible()
    await expect(header.getByRole('link', { name: 'Feed' })).toBeVisible()
    await expect(header.getByRole('link', { name: 'Groups' })).toBeVisible()
    await expect(header.getByRole('link', { name: 'Talks' })).toBeVisible()
  })

  test('clicking Feed navigates to /feed', async ({ page }) => {
    await page.goto('/groups')
    await page.locator('header').getByRole('link', { name: 'Feed' }).click()
    await expect(page).toHaveURL('/feed')
  })

  test('clicking Groups navigates to /groups', async ({ page }) => {
    await page.goto('/feed')
    await page.locator('header').getByRole('link', { name: 'Groups' }).click()
    await expect(page).toHaveURL('/groups')
  })

  test('clicking Talks navigates to /talks', async ({ page }) => {
    await page.goto('/feed')
    await page.locator('header').getByRole('link', { name: 'Talks' }).click()
    await expect(page).toHaveURL('/talks')
  })

  test('clicking logo navigates to /', async ({ page }) => {
    await page.goto('/feed')
    await page.locator('header').getByRole('link', { name: /union chant/i }).click()
    await expect(page).toHaveURL('/')
  })

  test('create button is visible when authenticated', async ({ page }) => {
    await page.goto('/feed')
    await expect(page.locator('header').getByRole('link', { name: /create/i })).toBeVisible()
  })
})
