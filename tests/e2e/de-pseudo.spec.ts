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

  test('validates a tsv AI response (the default reply format) and exposes only the final local copy action', async ({ page }) => {
    await createSession(page);
    const section7 = page.getByRole('heading', { name: '7. Generated AI prompt' }).locator('..');
    await expect(section7.getByRole('button', { name: 'TSV', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const prompt = await section7.locator('textarea').first().inputValue();
    const sessionId = prompt.match(/SESSION ID:\s*([0-9a-f]{32})/)?.[1];
    expect(sessionId).toBeTruthy();
    // Pseudonyms are 12-char hex tokens, one per row, in the leading column of
    // the auto-appended "--- PSEUDONYMIZED DATA ---" TSV block.
    const pseudonyms = [...prompt.matchAll(/^([0-9a-f]{12})\t/gm)].map((m) => m[1]);
    expect(pseudonyms.length).toBeGreaterThan(0);
    // The response must cover every pseudonym or the app rejects it as incomplete.
    const response = [`SESSION ID:\t${sessionId}`, 'pseudonym\tchoice', ...pseudonyms.map((p) => `${p}\tpizza`)].join('\n');

    await page.getByRole('heading', { name: '8. Paste AI result' }).locator('..').getByRole('textbox').fill(response);
    await page.getByRole('button', { name: /Validate & resolve locally/i }).click();
    await expect(page.getByRole('heading', { name: '9. Final output' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Copy$/i })).toBeVisible();
  });

  test('round-trips using the csv AI reply format', async ({ page }) => {
    await createSession(page);
    const section7 = page.getByRole('heading', { name: '7. Generated AI prompt' }).locator('..');
    await section7.getByRole('button', { name: 'CSV', exact: true }).click();

    const prompt = await section7.locator('textarea').first().inputValue();
    expect(prompt).toContain('comma-separated (CSV) table');
    const sessionId = prompt.match(/SESSION ID:\s*([0-9a-f]{32})/)?.[1];
    const pseudonyms = [...prompt.matchAll(/^([0-9a-f]{12}),/gm)].map((m) => m[1]);
    expect(pseudonyms.length).toBeGreaterThan(0);
    const response = [`SESSION ID: ${sessionId}`, 'pseudonym,choice', ...pseudonyms.map((p) => `${p},pizza`)].join('\n');

    await page.getByRole('heading', { name: '8. Paste AI result' }).locator('..').getByRole('textbox').fill(response);
    await page.getByRole('button', { name: /Validate & resolve locally/i }).click();
    await expect(page.getByRole('heading', { name: '9. Final output' })).toBeVisible();
  });

  test('round-trips using the json AI reply format', async ({ page }) => {
    await createSession(page);
    const section7 = page.getByRole('heading', { name: '7. Generated AI prompt' }).locator('..');
    await section7.getByRole('button', { name: 'JSON', exact: true }).click();

    const prompt = await section7.locator('textarea').first().inputValue();
    const sessionId = prompt.match(/SESSION ID:\s*([0-9a-f]{32})/)?.[1];
    const pseudonyms = [...prompt.matchAll(/^([0-9a-f]{12})\t/gm)].map((m) => m[1]);
    expect(pseudonyms.length).toBeGreaterThan(0);
    const response = JSON.stringify({ sessionId, results: pseudonyms.map((p) => ({ pseudonym: p, choice: 'pizza' })) });

    await page.getByRole('heading', { name: '8. Paste AI result' }).locator('..').getByRole('textbox').fill(response);
    await page.getByRole('button', { name: /Validate & resolve locally/i }).click();
    await expect(page.getByRole('heading', { name: '9. Final output' })).toBeVisible();
  });

  test('cryptoshred returns the application to a clean input state', async ({ page }) => {
    await createSession(page);
    await page.getByRole('button', { name: /Shred session/i }).click();
    await expect(page.getByRole('heading', { name: '1. Load data' })).toBeVisible();
    await expect(page.getByText('Session shredded.')).toBeVisible();
    await expect(page.getByText('John Johnson')).not.toBeVisible();
  });

  test('supports pasting comma-separated input and labels the format actually used', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'CSV (comma)' }).click();
    await page.getByLabel('Paste data').fill('username,preference\nJohn Johnson,icecream\nMary Smith,pizza');
    await expect(page.getByText(/Loaded 2 rows from Pasted text \(CSV\)\./)).toBeVisible();

    await page.getByRole('button', { name: /Pseudonymize & save locally/i }).click();
    const generated = page.getByRole('heading', { name: '7. Generated AI prompt' }).locator('..').locator('textarea').first();
    const value = await generated.inputValue();
    expect(value).not.toContain('John Johnson');
    expect(value).not.toContain('Mary Smith');
  });

  test('shows the how-it-works explanation, the anonymization note, and the developer/license footer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
    await expect(page.getByText(/pseudonymization/i).first()).toBeVisible();
    await expect(page.getByText(/does not guarantee anonymity/i)).toBeVisible();

    const devLink = page.getByRole('link', { name: /Juha Itäleino/ });
    await expect(devLink).toHaveAttribute('href', 'https://github.com/jsilvanus');
    const sourceLink = page.getByRole('link', { name: /source on GitHub/i });
    await expect(sourceLink).toHaveAttribute('href', 'https://github.com/jsilvanus/de-pseudo');
    const licenseLink = page.getByRole('link', { name: /EUPL-1\.2/ });
    await expect(licenseLink).toHaveAttribute('href', 'https://github.com/jsilvanus/de-pseudo/blob/main/LICENSE');
  });
});

test.describe('ambiguous and unmatched reference text', () => {
  // Anna Johnson and Anna Benson share a first name, so a bare "Anna" is
  // ambiguous between them; "Anna Q." matches neither surname's initial and
  // has no automatic candidate at all. Neither should ever reach the
  // generated prompt unresolved.
  const referenceInput = [
    ['username', 'friend'],
    ['Anna Johnson', 'Anna Q.'],
    ['John Johnson', 'Anna'],
    ['Anna Benson', ''],
  ].map((row) => row.join('\t')).join('\n');

  async function setFriendColumnToReference(page: import('@playwright/test').Page) {
    const friendRow = page.locator('tr', { hasText: 'friend' });
    await friendRow.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Reference' }).click();
  }

  test('blocks prompt generation until ambiguous and unmatched references are resolved', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Paste data').fill(referenceInput);
    await page.getByRole('button', { name: /Pseudonymize & save locally/i }).click();
    await setFriendColumnToReference(page);

    const section4 = page.getByRole('heading', { name: '4. Resolve text references' }).locator('..');
    await expect(section4).toContainText('Unresolved references');
    await expect(section4).toContainText('"Anna Q."');
    await expect(section4).toContainText('"Anna"');
    // The UI should say *why* each one is unresolved, not just that it is.
    await expect(section4).toContainText('no automatic match');
    await expect(section4).toContainText('matches 2 people');

    const section7 = page.getByRole('heading', { name: '7. Generated AI prompt' }).locator('..');
    await expect(section7).toContainText('Prompt generation is blocked');
    await expect(section7.locator('textarea')).toHaveCount(0);

    const personSelects = section4.getByRole('combobox');
    await expect(personSelects).toHaveCount(2);

    // Even the zero-candidate "Anna Q." must still let a person be picked
    // manually — every identity is offered, not just automatic matches.
    await personSelects.nth(0).click();
    await expect(page.getByRole('option')).toHaveText(['Unresolved', 'Anna Johnson', 'John Johnson', 'Anna Benson']);
    await page.getByRole('option', { name: 'Anna Benson', exact: true }).click();

    // Resolving only one of the two must not unblock the prompt yet.
    await expect(section7).toContainText('Prompt generation is blocked');

    await personSelects.nth(1).click();
    await page.getByRole('option', { name: 'Anna Johnson', exact: true }).click();

    // Both resolved: the prompt now generates, still with no raw names in it.
    await expect(section7.locator('textarea').first()).toBeVisible();
    const prompt = await section7.locator('textarea').first().inputValue();
    expect(prompt).not.toContain('Anna Johnson');
    expect(prompt).not.toContain('Anna Benson');
    expect(prompt).not.toContain('John Johnson');
    expect(prompt).not.toContain('Anna Q.');
    expect(prompt).toMatch(/pseudonym\tfriend/);
  });

  test('auto-resolves a first-name-plus-last-initial reference with a visible note, without blocking', async ({ page }) => {
    // "Anna J." uniquely narrows to Anna Johnson (Anna Benson's initial
    // doesn't fit), so this should resolve on its own — but still say so,
    // rather than looking identical to an exact, unambiguous match.
    const initialInput = [
      ['username', 'friend'],
      ['Anna Johnson', ''],
      ['John Johnson', 'Anna J.'],
      ['Anna Benson', ''],
    ].map((row) => row.join('\t')).join('\n');

    await page.goto('/');
    await page.getByLabel('Paste data').fill(initialInput);
    await page.getByRole('button', { name: /Pseudonymize & save locally/i }).click();
    await setFriendColumnToReference(page);

    const section4 = page.getByRole('heading', { name: '4. Resolve text references' }).locator('..');
    await expect(section4).toContainText('partial match resolved to "Anna Johnson"');
    await expect(section4).toContainText('partial match resolved to "Anna Johnson" — verify');
    await expect(section4).not.toContainText('Unresolved references');

    // No manual pick needed: the prompt generates immediately, already
    // carrying the inferred match.
    const section7 = page.getByRole('heading', { name: '7. Generated AI prompt' }).locator('..');
    await expect(section7).not.toContainText('Prompt generation is blocked');
    const prompt = await section7.locator('textarea').first().inputValue();
    expect(prompt).not.toContain('Anna Johnson');
    expect(prompt).not.toContain('Anna J.');

    // John Johnson's friend column must carry a real pseudonym (Anna
    // Johnson's), not be left empty or leak the literal reference text.
    expect(prompt).toMatch(/^[0-9a-f]{12}\t[0-9a-f]{12}$/m);
  });
});
