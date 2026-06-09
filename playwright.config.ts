/**
 * Playwright config — Path E2E walkthrough.
 *
 * Runs against the already-live `pnpm dev` server on :5173 so we don't fight
 * with the user's running session. If the server isn't up, the test will fail
 * fast with a clear connection error.
 */

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'tests/e2e/playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
