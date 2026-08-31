import { defineConfig } from '@playwright/test';

// Separate from playwright.config.ts: this suite loads an unpacked
// chrome-extension:// build via a custom context fixture instead of
// visiting a served baseURL, so it needs neither `webServer` nor the
// standard device projects.
export default defineConfig({
  testDir: './tests/e2e-extension',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  projects: [{ name: 'chromium-extension' }],
});
