import { test as setup, expect } from '@playwright/test'
import { TEST_USER } from './helpers/test-data'

setup('seed test user and authenticate', async ({ request, page }) => {
  // Step 1: Seed the test user via admin API
  const seedRes = await request.post('/api/admin/test/seed-e2e-user', {
    data: {
      email: TEST_USER.email,
      password: TEST_USER.password,
      name: TEST_USER.name,
    },
  })
  expect(seedRes.ok()).toBeTruthy()

  // Step 2: Sign in via the UI to capture session cookies
  await page.goto('/auth/signin')
  await page.getByPlaceholder('Email').fill(TEST_USER.email)
  await page.getByPlaceholder('Password').fill(TEST_USER.password)
  await page.getByRole('button', { name: 'Sign In' }).click()

  // Step 3: Wait for redirect to home
  await page.waitForURL('/', { timeout: 10_000 })

  // Step 4: Save authenticated state
  await page.context().storageState({ path: './e2e/.auth/user.json' })
})
