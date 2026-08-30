import { test, expect } from '@playwright/test';

const input = [
  ['username', 'preference', 'friend'],
  ['John Johnson', 'icecream', 'Mary Smith'],
  ['Mary Smith', 'pizza', 'John Johnson'],
].map(row => row.join('\t')).join('\n');

test.describe('de-pseudo browser workflow', () => {
  test('loads clipboard-style tabular data and never exposes names in the prompt', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'de-pseudo' })).toBeVisible();
    await page.getByLabel('Paste data').fill(input);
    await page.getByRole('button', { name: /Load & pseudonymize locally/i }).click();

    await expect(page.getByRole('heading', { name: 'Dataset editor' })).toBeVisible();
    await expect(page.getByText('John Johnson')).toBeVisible();

    const prompt = page.locator('textarea').filter({ hasText: '' }).last();
    // Find the readonly prompt by its surrounding section instead of relying on DOM order.
    const promptSection = page.getByRole('heading', { name: '7. AI prompt' }).locator('..');
    const promptField = promptSection.locator('textarea').last();
    await expect(promptField).toHaveValue(/SESSION ID:/);
    await expect(promptField).not.toHaveValue(/John Johnson/);
    await expect(promptField).not.toHaveValue(/Mary Smith/);
  });

  test('supports output selection and copy-ready final result area', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Paste data').fill(input);
    await page.getByRole('button', { name: /Load & pseudonymize locally/i }).click();

    await expect(page.getByRole('heading', { name: 'AI output' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pseudonymized data' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Copy pseudonymized data/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Copy prompt/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Shred session/i })).toBeVisible();
  });

  test('cryptoshred returns the application to the input state', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Paste data').fill(input);
    await page.getByRole('button', { name: /Load & pseudonymize locally/i }).click();
    await page.getByRole('button', { name: /Shred session/i }).click();

    await expect(page.getByRole('heading', { name: '1. Your data' })).toBeVisible();
    await expect(page.getByText('Session shredded.')).toBeVisible();
    await expect(page.getByText('John Johnson')).not.toBeVisible();
  });
});
