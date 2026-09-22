import { defineConfig, devices } from '@playwright/test'

// Standalone config for the 19-account full-lifecycle clickthrough.
// Self-contained: no global-setup / storageState — the spec seeds and logs in
// its own accounts. The dev server is launched with email HARD-DISABLED
// (RESEND_API_KEY empty) and pointed at the LOCAL TEST DB, so a real Resend
// send can never fire the way it did during the vitest runs.
const TEST_DB = 'postgresql://galengoodwick@localhost:5432/unionchant_test'

export default defineConfig({
  testDir: './e2e-full',
  fullyParallel: false,
  workers: 1,
  timeout: 1_800_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: 'e2e-full/report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 900 },
    // Without these, a locator action on a missing element hangs until the
    // whole-test timeout (600s) with no diagnostic. Fail fast instead.
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Port 3100 — :3000 is a different project's dev server. Inline env wins over
    // .env.local (Next never overrides real process.env): empty Resend key →
    // email.ts builds no client → zero sends; test DB → never touches prod.
    command: `RESEND_API_KEY= DATABASE_URL="${TEST_DB}" PORT=3100 npm run dev`,
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
