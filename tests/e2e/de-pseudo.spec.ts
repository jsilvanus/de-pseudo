import { test, expect } from '@playwright/test';

const input = [
  ['username', 'preference', 'friend'],
  ['John Johnson', 'icecream', 'Mary Smith'],
  ['Mary Smith', 'pizza', 'John Johnson'],
].map(row => row.join('\t')).join('\n');

async function loadDataset(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Load clipboard').click();
  await page.evaluate((value) => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => value, writeText: async () => undefined } }); }, input);
  // Clipboard permission is unavailable in some CI browsers; the file-free path is tested by calling the parser UI through its normal control.
  await page.getByLabel('Load clipboard').click();
}

test.describe('de-pseudo browser workflow', () => {
  test('pseudonymizes tabular input and keeps real identities out of the generated prompt', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Paste data').fill(input);
    await page.getByRole('button', { name: /Pseudonymize & save locally/i }).click();

    await expect(page.getByRole('heading', { name: '1. Dataset editor' })).toBeVisible();
    const prompt = page.getByRole('heading', { name: '7. Generated AI prompt' }).locator('..').locator('textarea');
    await expect(prompt).toHaveValue(/SESSION ID:/);
    await expect(prompt).not.toHaveValue(/John Johnson/);
    await expect(prompt).not.toHaveValue(/Mary Smith/);
  });

  test('column buttons and pseudonymized-values button construct the prompt', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Paste data').fill(input);
    await page.getByRole('button', { name: /Pseudonymize & save locally/i }).click();

    await page.getByRole('button', { name: 'preference', exact: true }).click();
    await page.getByRole('button', { name: 'Add pseudonymized values', exact: true }).click();

    const editor = page.getByRole('textbox', { name: 'Prompt' });
    await expect(editor).toHaveValue(/\{\{preference\}\}/);
    await expect(editor).toHaveValue(/\{\{pseudonymized values\}\}/);

    const generated = page.getByRole('heading', { name: '7. Generated AI prompt' }).locator('..').locator('textarea');
    await expect(generated).toHaveValue(/--- PSEUDONYMIZED DATA ---/);
    await expect(generated).not.toHaveValue(/John Johnson/);
    await expect(generated).not.toHaveValue(/Mary Smith/);
  });

  test('provides copy controls for pseudonymized data and final output', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Paste data').fill(input);
    await page.getByRole('button', { name: /Pseudonymize & save locally/i }).click();

    await expect(page.getByRole('button', { name: /Copy prompt/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Copy pseudonymized data/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Copy$/i })).not.toBeVisible();
  });

  test('cryptoshred returns the application to a clean input state', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Paste data').fill(input);
    await page.getByRole('button', { name: /Pseudonymize & save locally/i }).click();
    await page.getByRole('button', { name: /Shred session/i }).click();

    await expect(page.getByRole('heading', { name: '1. Load data' })).toBeVisible();
    await expect(page.getByText('Session shredded.')).toBeVisible();
    await expect(page.getByText('John Johnson')).not.toBeVisible();
  });
});
