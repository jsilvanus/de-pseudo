import { test, expect } from '@playwright/test';

// The "friend" cross-reference case (mapping one person's raw name found in
// another person's row) needs an explicit reference-column configuration in
// the "2. Privacy & columns" step; that contract is covered at the unit
// level in schema.test.ts. This smoke test sticks to plain attribute data.
const input = [
  ['username', 'preference'],
  ['John Johnson', 'icecream'],
  ['Mary Smith', 'pizza'],
].map(row => row.join('\t')).join('\n');

async function createSession(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Paste data').fill(input);
  await page.getByRole('button', { name: /Pseudonymize & save locally/i }).click();
}

test.describe('de-pseudo browser workflow', () => {
  test('pseudonymizes tabular input and keeps real identities out of the generated prompt', async ({ page }) => {
    await createSession(page);
    await expect(page.getByRole('heading', { name: '1. Dataset editor' })).toBeVisible();
    const generated = page.getByRole('heading', { name: '7. Generated AI prompt' }).locator('..').locator('textarea').first();
    const value = await generated.inputValue();
    expect(value).toMatch(/SESSION ID:/);
    expect(value).not.toContain('John Johnson');
    expect(value).not.toContain('Mary Smith');
  });

  test('column buttons and pseudonymized-values button construct the prompt', async ({ page }) => {
    await createSession(page);
    await page.getByRole('button', { name: 'preference', exact: true }).click();
    await page.getByRole('button', { name: 'Add pseudonymized values', exact: true }).click();

    const editor = page.getByRole('textbox', { name: 'Prompt' });
    await expect(editor).toHaveValue(/\{\{preference\}\}/);
    await expect(editor).toHaveValue(/\{\{pseudonymized values\}\}/);

    const generated = page.getByRole('heading', { name: '7. Generated AI prompt' }).locator('..').locator('textarea').first();
    await expect(generated).toHaveValue(/--- PSEUDONYMIZED DATA ---/);
    await expect(generated).not.toHaveValue(/John Johnson/);
    await expect(generated).not.toHaveValue(/Mary Smith/);
  });

  test('validates an AI response and exposes only the final local copy action', async ({ page }) => {
    await createSession(page);
    const generated = page.getByRole('heading', { name: '7. Generated AI prompt' }).locator('..').locator('textarea').first();
    const prompt = await generated.inputValue();
    const sessionId = prompt.match(/SESSION ID:\s*([0-9a-f]{32})/)?.[1];
    expect(sessionId).toBeTruthy();
    // Pseudonyms are 12-char hex tokens, one per row, in the leading column of
    // the auto-appended "--- PSEUDONYMIZED DATA ---" TSV block.
    const pseudonyms = [...prompt.matchAll(/^([0-9a-f]{12})\t/gm)].map((m) => m[1]);
    expect(pseudonyms.length).toBeGreaterThan(0);
    // The response must cover every pseudonym or the app rejects it as incomplete.
    const response = [`SESSION ID: ${sessionId}`, ...pseudonyms.map((p) => `${p} -> pizza`)].join('\n');

    await page.getByRole('heading', { name: '8. Paste AI result' }).locator('..').getByRole('textbox').fill(response);
    await page.getByRole('button', { name: /Validate & resolve locally/i }).click();
    await expect(page.getByRole('heading', { name: '9. Final output' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Copy$/i })).toBeVisible();
  });

  test('cryptoshred returns the application to a clean input state', async ({ page }) => {
    await createSession(page);
    await page.getByRole('button', { name: /Shred session/i }).click();
    await expect(page.getByRole('heading', { name: '1. Load data' })).toBeVisible();
    await expect(page.getByText('Session shredded.')).toBeVisible();
    await expect(page.getByText('John Johnson')).not.toBeVisible();
  });
});
