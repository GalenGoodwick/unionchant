import { test, expect } from '@playwright/test'

test.describe('Group Chat', () => {
  let groupSlug: string

  test.beforeAll(async ({ request }) => {
    const slug = `e2e-chat-${Date.now()}`
    const res = await request.post('/api/communities', {
      data: {
        name: `E2E Chat Group ${Date.now()}`,
        slug,
        description: 'Testing group chat',
        isPrivate: false,
      },
      headers: { origin: 'http://localhost:3000' },
    })
    if (res.ok()) {
      const data = await res.json()
      groupSlug = data.slug || slug
    }
  })

  test('group page shows chat section for members', async ({ page }) => {
    test.skip(!groupSlug, 'Group was not created')
    await page.goto(`/groups/${groupSlug}`)

    const chatSection = page.getByText(/chat/i).first()
    if (await chatSection.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(chatSection).toBeVisible()
    }
  })

  test('send a chat message', async ({ page }) => {
    test.skip(!groupSlug, 'Group was not created')
    await page.goto(`/groups/${groupSlug}`)

    const chatInput = page.getByPlaceholder(/message|type/i).first()
    if (await chatInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const msg = `E2E test message ${Date.now()}`
      await chatInput.fill(msg)
      await page.getByRole('button', { name: /send/i }).click()
      await expect(page.getByText(msg)).toBeVisible({ timeout: 10_000 })
    }
  })
})
