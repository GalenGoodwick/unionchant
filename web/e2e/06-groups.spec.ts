import { test, expect } from '@playwright/test'

test.describe('Groups - Browse and Join', () => {
  let groupSlug: string

  test.beforeAll(async ({ request }) => {
    const slug = `e2e-group-${Date.now()}`
    const res = await request.post('/api/communities', {
      data: {
        name: `E2E Test Group ${Date.now()}`,
        slug,
        description: 'A test group for E2E testing',
        isPrivate: false,
      },
      headers: { origin: 'http://localhost:3000' },
    })
    if (res.ok()) {
      const data = await res.json()
      groupSlug = data.slug || slug
    }
  })

  test('groups list page renders', async ({ page }) => {
    await page.goto('/groups')
    await expect(page.getByText(/groups/i).first()).toBeVisible()
  })

  test('group detail page renders', async ({ page }) => {
    test.skip(!groupSlug, 'Group was not created')
    await page.goto(`/groups/${groupSlug}`)
    await expect(page.getByRole('heading', { name: /E2E Test Group/ })).toBeVisible({ timeout: 10_000 })
  })

  test('group shows member count', async ({ page }) => {
    test.skip(!groupSlug, 'Group was not created')
    await page.goto(`/groups/${groupSlug}`)
    await expect(page.getByText(/member/i).first()).toBeVisible({ timeout: 10_000 })
  })
})
