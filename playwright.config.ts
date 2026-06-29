import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Frontbase E2E tests
 *
 * Run tests:
 *   npx playwright test                      # Run all tests
 *   npx playwright test --project=chromium  # Run in Chromium only
 *   npx playwright test --headed             # Run with visible browser
 *   npx playwright test --debug              # Run with debug mode
 *   npx playwright test --grep "login"       # Run tests matching pattern
 *
 * Test setup requirements:
 *   - Backend server running on http://localhost:8000
 *   - Frontend dev server running on http://localhost:5173
 *   - Supabase credentials configured for cloud mode tests
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['list'],
  ],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:5173',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000,
  // },
});
