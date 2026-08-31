import { test, expect } from './fixtures';

// Loads the real dist-extension/ build (unpacked) into Chromium the same
// way a user would, then drives the reused App through one full
// pseudonymize round trip — proving the domain code that already has its
// own unit/integration/e2e coverage also works unchanged from inside the
// extension's chrome-extension:// origin (IndexedDB, Web Crypto, fonts,
// and MUI/Emotion styling all included).
test.describe('de-pseudo side panel extension', () => {
  test('renders in the extension origin and pseudonymizes locally', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('de-pseudo-language', 'en'));
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    await expect(page.getByRole('heading', { name: /de-pseudo/ })).toBeVisible();

    await page.getByLabel('Table name').fill('Table 1');
    await page.getByLabel('Paste data').fill(['username\tpreference', 'John Johnson\ticecream'].join('\n'));
    await page.getByRole('button', { name: 'Add this table' }).click();
    await page.getByRole('button', { name: /Pseudonymize all & continue/i }).click();

    await expect(page.getByRole('heading', { name: 'Dataset editor' })).toBeVisible();
    const generated = page.getByRole('heading', { name: 'Generated AI prompt' }).locator('..').locator('textarea').first();
    await expect(generated).toHaveValue(/SESSION ID:/);
    await expect(generated).not.toHaveValue(/John Johnson/);
  });
});
