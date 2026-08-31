import { test as base, chromium, type BrowserContext } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Requires `npm run build:extension` to have produced dist-extension/ first
// — this suite loads the real built output, not source, since manifest
// generation and static-asset copying are themselves part of what it verifies.
const extensionPath = path.resolve(fileURLToPath(new URL('../../dist-extension', import.meta.url)));

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        // MV3 extensions (including their service worker) only load under
        // Chrome's new headless mode, not classic `headless: true`.
        '--headless=new',
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(worker.url().split('/')[2]);
  },
});

export const expect = test.expect;
