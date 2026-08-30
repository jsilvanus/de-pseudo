import { test, expect, type Page } from '@playwright/test';

// Finnish is the default language for real visitors, but these functional
// tests assert on the original English copy — force English before every
// navigation so the workflow assertions stay language-independent of the
// i18n default. Not applied to the 'internationalization' suite below,
// which specifically exercises the default language and the switcher.
async function forceEnglish({ page }: { page: Page }) {
  await page.addInitScript(() => localStorage.setItem('de-pseudo-language', 'en'));
}

const input = [
  ['username', 'preference'],
  ['John Johnson', 'icecream'],
  ['Mary Smith', 'pizza'],
].map(row => row.join('\t')).join('\n');

/** Fills the "add a table" wizard once and commits it — the identity column
 * defaults correctly for a "username" column, so no extra selection needed. */
async function addTable(page: Page, name: string, pasteText: string, identityColumn?: string) {
  await page.getByLabel('Table name').fill(name);
  await page.getByLabel('Paste data').fill(pasteText);
  if (identityColumn) {
    const identitySelect = page.locator('.MuiFormControl-root', { hasText: 'Identity column' }).getByRole('combobox');
    await identitySelect.click();
    await page.getByRole('option', { name: identityColumn, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Add this table' }).click();
}

async function createSession(page: Page) {
  await page.goto('/');
  await addTable(page, 'Table 1', input);
  await page.getByRole('button', { name: /Pseudonymize all & continue/i }).click();
}

test.describe('de-pseudo browser workflow', () => {
  test.beforeEach(forceEnglish);

  test('pseudonymizes tabular input and keeps real identities out of the generated prompt', async ({ page }) => {
    await createSession(page);
    await expect(page.getByRole('heading', { name: 'Dataset editor' })).toBeVisible();
    const generated = page.getByRole('heading', { name: 'Generated AI prompt' }).locator('..').locator('textarea').first();
    const value = await generated.inputValue();
    expect(value).toMatch(/SESSION ID:/);
    expect(value).not.toContain('John Johnson');
    expect(value).not.toContain('Mary Smith');
  });

  test('validates a tsv AI response (the default reply format) and exposes only the final local copy action', async ({ page }) => {
    await createSession(page);
    const promptSection = page.getByRole('heading', { name: 'Generated AI prompt' }).locator('..');
    await expect(promptSection.getByRole('button', { name: 'TSV', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const prompt = await promptSection.locator('textarea').first().inputValue();
    const sessionId = prompt.match(/SESSION ID:\s*([0-9a-f]{32})/)?.[1];
    expect(sessionId).toBeTruthy();
    // Pseudonyms are 12-char hex tokens, one per row, in the leading column of
    // the auto-appended "--- TABLE 1 ---" TSV block.
    const pseudonyms = [...prompt.matchAll(/^([0-9a-f]{12})\t/gm)].map((m) => m[1]);
    expect(pseudonyms.length).toBeGreaterThan(0);
    // The response must cover every pseudonym or the app rejects it as incomplete.
    const response = [`SESSION ID:\t${sessionId}`, 'pseudonym\tchoice', ...pseudonyms.map((p) => `${p}\tpizza`)].join('\n');

    await page.getByRole('heading', { name: 'Paste AI result' }).locator('..').getByRole('textbox').fill(response);
    await page.getByRole('button', { name: /Validate & resolve locally/i }).click();
    await expect(page.getByRole('heading', { name: 'Final output' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Copy$/i })).toBeVisible();
  });

  test('round-trips using the csv AI reply format', async ({ page }) => {
    await createSession(page);
    const promptSection = page.getByRole('heading', { name: 'Generated AI prompt' }).locator('..');
    await promptSection.getByRole('button', { name: 'CSV', exact: true }).click();

    const prompt = await promptSection.locator('textarea').first().inputValue();
    expect(prompt).toContain('comma-separated (CSV) table');
    const sessionId = prompt.match(/SESSION ID:\s*([0-9a-f]{32})/)?.[1];
    const pseudonyms = [...prompt.matchAll(/^([0-9a-f]{12}),/gm)].map((m) => m[1]);
    expect(pseudonyms.length).toBeGreaterThan(0);
    const response = [`SESSION ID: ${sessionId}`, 'pseudonym,choice', ...pseudonyms.map((p) => `${p},pizza`)].join('\n');

    await page.getByRole('heading', { name: 'Paste AI result' }).locator('..').getByRole('textbox').fill(response);
    await page.getByRole('button', { name: /Validate & resolve locally/i }).click();
    await expect(page.getByRole('heading', { name: 'Final output' })).toBeVisible();
  });

  test('round-trips using the json AI reply format', async ({ page }) => {
    await createSession(page);
    const promptSection = page.getByRole('heading', { name: 'Generated AI prompt' }).locator('..');
    await promptSection.getByRole('button', { name: 'JSON', exact: true }).click();

    const prompt = await promptSection.locator('textarea').first().inputValue();
    const sessionId = prompt.match(/SESSION ID:\s*([0-9a-f]{32})/)?.[1];
    const pseudonyms = [...prompt.matchAll(/^([0-9a-f]{12})\t/gm)].map((m) => m[1]);
    expect(pseudonyms.length).toBeGreaterThan(0);
    const response = JSON.stringify({ sessionId, results: pseudonyms.map((p) => ({ pseudonym: p, choice: 'pizza' })) });

    await page.getByRole('heading', { name: 'Paste AI result' }).locator('..').getByRole('textbox').fill(response);
    await page.getByRole('button', { name: /Validate & resolve locally/i }).click();
    await expect(page.getByRole('heading', { name: 'Final output' })).toBeVisible();
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
    await expect(page.getByText(/Loaded 2 rows from Pasted text \(CSV\)/)).toBeVisible();
    await page.getByRole('button', { name: 'Add this table' }).click();
    // Once committed, the table list names the same source/format instead.
    await expect(page.getByText('Table 1 — 2 rows, identity column "username"')).toBeVisible();

    await page.getByRole('button', { name: /Pseudonymize all & continue/i }).click();
    const generated = page.getByRole('heading', { name: 'Generated AI prompt' }).locator('..').locator('textarea').first();
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

test.describe('multiple tables', () => {
  test.beforeEach(forceEnglish);

  // The exact motivating case: a "Rooms" table with no people in it, and a
  // "Preferences" table naming a person and the room they're in. Both the
  // person's name and the room number must be pseudonymized, and the room
  // token referenced from Preferences must be the identical token Rooms
  // itself generated for that room.
  test('shares one pseudonym per identity across tables and resolves a cross-table reference', async ({ page }) => {
    await page.goto('/');
    await addTable(page, 'Rooms', 'room\tsize\nRoom A\t4\nRoom B\t2', 'room');
    await addTable(page, 'Preferences', 'name\troom\twants\nAlice\tRoom A\tquiet\nBob\tRoom B\tsocial', 'name');

    await expect(page.getByText('Rooms — 2 rows, identity column "room"')).toBeVisible();
    await expect(page.getByText('Preferences — 2 rows, identity column "name"')).toBeVisible();

    await page.getByRole('button', { name: /Pseudonymize all & continue/i }).click();

    // Single-table-only UI must not appear once there's more than one table.
    await expect(page.getByRole('heading', { name: 'Dataset editor' })).toHaveCount(0);

    // Point Preferences.room at Rooms (mode defaults to same-table on switch).
    const prefsPrivacy = page.getByRole('heading', { name: 'Privacy & columns — Preferences' }).locator('..');
    const roomRow = prefsPrivacy.locator('tr', { hasText: 'room' });
    await roomRow.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Reference' }).click();
    await roomRow.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'Rooms', exact: true }).click();
    await expect(roomRow).toContainText('.room');

    // Neither table has output configured by default once there's more than
    // one table — there's no safe way to guess which one the AI answers for.
    const aiOutput = page.getByRole('heading', { name: 'AI output' }).locator('..');
    const prefsOutputBlock = aiOutput.locator('p:has-text("Preferences")').locator('..');
    await prefsOutputBlock.getByRole('checkbox', { name: 'name', exact: true }).check();
    await prefsOutputBlock.getByRole('textbox', { name: 'AI-generated output field name' }).fill('assigned_room');
    await prefsOutputBlock.getByRole('textbox', { name: 'AI-generated output field name' }).press('Enter');

    const promptSection = page.getByRole('heading', { name: 'Generated AI prompt' }).locator('..');
    const prompt = await promptSection.locator('textarea').first().inputValue();
    expect(prompt).toContain('--- ROOMS ---');
    expect(prompt).toContain('--- PREFERENCES ---');
    expect(prompt).not.toContain('Alice');
    expect(prompt).not.toContain('Bob');
    expect(prompt).not.toContain('Room A');
    expect(prompt).not.toContain('Room B');
    expect(prompt).toContain('Then return a tab-separated table with these columns: name, assigned_room.');

    const roomsBlock = prompt.split('--- ROOMS ---')[1].split('--- END ROOMS ---')[0];
    const roomPseudonym = roomsBlock.trim().split('\n')[1].split('\t')[0];
    expect(roomPseudonym).toMatch(/^[0-9a-f]{12}$/);
    // The exact same token Rooms generated for "Room A" must appear as the
    // reference value in Preferences — not a second, unrelated token.
    const prefsBlock = prompt.split('--- PREFERENCES ---')[1].split('--- END PREFERENCES ---')[0];
    expect(prefsBlock).toContain(roomPseudonym);

    const sessionId = prompt.match(/SESSION ID:\s*([0-9a-f]{32})/)?.[1];
    const prefPseudonyms = prefsBlock.trim().split('\n').slice(1).map(l => l.split('\t')[0]);
    const response = [`SESSION ID:\t${sessionId}`, 'pseudonym\tassigned_room', `${prefPseudonyms[0]}\tvanilla suite`, `${prefPseudonyms[1]}\tparty suite`].join('\n');

    await page.getByRole('heading', { name: 'Paste AI result' }).locator('..').getByRole('textbox').fill(response);
    await page.getByRole('button', { name: /Validate & resolve locally/i }).click();

    const finalOutput = page.getByRole('heading', { name: 'Final output' }).locator('..').locator('textarea').first();
    await expect(finalOutput).toBeVisible();
    const finalValue = JSON.parse(await finalOutput.inputValue());
    expect(finalValue).toEqual([
      { name: 'Alice', assigned_room: 'vanilla suite' },
      { name: 'Bob', assigned_room: 'party suite' },
    ]);
  });

  test('blocks a cross-table reference that matches no room exactly, and lets it be resolved manually', async ({ page }) => {
    await page.goto('/');
    await addTable(page, 'Rooms', 'room\tsize\nRoom A\t4\nRoom B\t2', 'room');
    await addTable(page, 'Preferences', 'name\troom\nAlice\troom a (corner)', 'name');
    await page.getByRole('button', { name: /Pseudonymize all & continue/i }).click();

    const prefsPrivacy = page.getByRole('heading', { name: 'Privacy & columns — Preferences' }).locator('..');
    const roomRow = prefsPrivacy.locator('tr', { hasText: 'room' });
    await roomRow.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Reference' }).click();
    await roomRow.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'Rooms', exact: true }).click();

    const referencesSection = page.getByRole('heading', { name: 'Resolve text references' }).locator('..');
    await expect(referencesSection).toContainText('Unresolved references');
    await expect(referencesSection).toContainText('"room a (corner)"');

    const promptSection = page.getByRole('heading', { name: 'Generated AI prompt' }).locator('..');
    await expect(promptSection).toContainText('Prompt generation is blocked');

    await referencesSection.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Room A', exact: true }).click();

    await expect(promptSection).not.toContainText('Prompt generation is blocked');
    const prompt = await promptSection.locator('textarea').first().inputValue();
    expect(prompt).not.toContain('room a (corner)');
    expect(prompt).not.toContain('Room A');
  });

  test('restores every table, correctly, after a fresh page load', async ({ page, context }) => {
    await page.goto('/');
    await addTable(page, 'Rooms', 'room\tsize\nRoom A\t4\nRoom B\t2', 'room');
    await addTable(page, 'Preferences', 'name\troom\twants\nAlice\tRoom A\tquiet\nBob\tRoom B\tsocial', 'name');
    await page.getByRole('button', { name: /Pseudonymize all & continue/i }).click();

    // Enable output for Preferences so there's a real reply contract to
    // resolve against once restored — otherwise every table's pseudonym
    // would be "expected" by default, which isn't what this test is about.
    const aiOutput = page.getByRole('heading', { name: 'AI output' }).locator('..');
    const prefsOutputBlock = aiOutput.locator('p:has-text("Preferences")').locator('..');
    await prefsOutputBlock.getByRole('checkbox', { name: 'name', exact: true }).check();

    const promptBefore = await page.getByRole('heading', { name: 'Generated AI prompt' }).locator('..').locator('textarea').first().inputValue();
    const sessionId = promptBefore.match(/SESSION ID:\s*([0-9a-f]{32})/)?.[1];

    // A brand-new page in the same browser context: no in-memory React state
    // carries over, only whatever is in this origin's IndexedDB.
    const fresh = await context.newPage();
    await fresh.goto('/');

    await expect(fresh.getByText('Encrypted local session restored: Rooms, Preferences.')).toBeVisible();
    await expect(fresh.getByRole('heading', { name: 'Privacy & columns — Rooms' })).toBeVisible();
    await expect(fresh.getByRole('heading', { name: 'Privacy & columns — Preferences' })).toBeVisible();

    const promptAfter = fresh.getByRole('heading', { name: 'Generated AI prompt' }).locator('..').locator('textarea').first();
    const promptAfterValue = await promptAfter.inputValue();
    expect(promptAfterValue).toContain(`SESSION ID: ${sessionId}`);
    expect(promptAfterValue).toContain('--- ROOMS ---');
    expect(promptAfterValue).toContain('--- PREFERENCES ---');

    // The restored session resolves an AI response exactly like the original
    // one would have, using the session ID it came back with.
    const prefsBlock = promptAfterValue.split('--- PREFERENCES ---')[1].split('--- END PREFERENCES ---')[0];
    const prefPseudonyms = prefsBlock.trim().split('\n').slice(1).map(l => l.split('\t')[0]);
    const response = [`SESSION ID:\t${sessionId}`, 'pseudonym\tchoice', `${prefPseudonyms[0]}\tvanilla`, `${prefPseudonyms[1]}\tparty`].join('\n');
    await fresh.getByRole('heading', { name: 'Paste AI result' }).locator('..').getByRole('textbox').fill(response);
    await fresh.getByRole('button', { name: /Validate & resolve locally/i }).click();
    await expect(fresh.getByRole('heading', { name: 'Final output' })).toBeVisible();
  });
});

test.describe('ambiguous and unmatched reference text', () => {
  test.beforeEach(forceEnglish);

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

  async function setFriendColumnToReference(page: Page) {
    const friendRow = page.locator('tr', { hasText: 'friend' });
    await friendRow.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Reference' }).click();
  }

  test('blocks prompt generation until ambiguous and unmatched references are resolved', async ({ page }) => {
    await page.goto('/');
    await addTable(page, 'Table 1', referenceInput);
    await page.getByRole('button', { name: /Pseudonymize all & continue/i }).click();
    await setFriendColumnToReference(page);

    const referencesSection = page.getByRole('heading', { name: 'Resolve text references' }).locator('..');
    await expect(referencesSection).toContainText('Unresolved references');
    await expect(referencesSection).toContainText('"Anna Q."');
    await expect(referencesSection).toContainText('"Anna"');
    // The UI should say *why* each one is unresolved, not just that it is.
    await expect(referencesSection).toContainText('no automatic match');
    await expect(referencesSection).toContainText('matches 2');

    const promptSection = page.getByRole('heading', { name: 'Generated AI prompt' }).locator('..');
    await expect(promptSection).toContainText('Prompt generation is blocked');
    await expect(promptSection.locator('textarea')).toHaveCount(0);

    const personSelects = referencesSection.getByRole('combobox');
    await expect(personSelects).toHaveCount(2);

    // Even the zero-candidate "Anna Q." must still let a person be picked
    // manually — every identity is offered, not just automatic matches.
    await personSelects.nth(0).click();
    await expect(page.getByRole('option')).toHaveText(['Unresolved', 'Anna Johnson', 'John Johnson', 'Anna Benson']);
    await page.getByRole('option', { name: 'Anna Benson', exact: true }).click();

    // Resolving only one of the two must not unblock the prompt yet.
    await expect(promptSection).toContainText('Prompt generation is blocked');

    await personSelects.nth(1).click();
    await page.getByRole('option', { name: 'Anna Johnson', exact: true }).click();

    // Both resolved: the prompt now generates, still with no raw names in it.
    await expect(promptSection.locator('textarea').first()).toBeVisible();
    const prompt = await promptSection.locator('textarea').first().inputValue();
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
    await addTable(page, 'Table 1', initialInput);
    await page.getByRole('button', { name: /Pseudonymize all & continue/i }).click();
    await setFriendColumnToReference(page);

    const referencesSection = page.getByRole('heading', { name: 'Resolve text references' }).locator('..');
    await expect(referencesSection).toContainText('partial match resolved to "Anna Johnson"');
    await expect(referencesSection).toContainText('partial match resolved to "Anna Johnson" — verify');
    await expect(referencesSection).not.toContainText('Unresolved references');

    // No manual pick needed: the prompt generates immediately, already
    // carrying the inferred match.
    const promptSection = page.getByRole('heading', { name: 'Generated AI prompt' }).locator('..');
    await expect(promptSection).not.toContainText('Prompt generation is blocked');
    const prompt = await promptSection.locator('textarea').first().inputValue();
    expect(prompt).not.toContain('Anna Johnson');
    expect(prompt).not.toContain('Anna J.');

    // John Johnson's friend column must carry a real pseudonym (Anna
    // Johnson's), not be left empty or leak the literal reference text.
    expect(prompt).toMatch(/^[0-9a-f]{12}\t[0-9a-f]{12}$/m);
  });
});

test.describe('internationalization', () => {
  test('defaults to Finnish for a first-time visitor and offers a top-right language switcher', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Näin se toimii' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '1. Lataa tiedot' })).toBeVisible();

    const switcher = page.getByRole('group', { name: 'Kieli' });
    await expect(switcher).toBeVisible();
    const headerBox = await page.locator('h3', { hasText: 'de-pseudo' }).boundingBox();
    const switcherBox = await switcher.boundingBox();
    expect(switcherBox).toBeTruthy();
    expect(headerBox).toBeTruthy();
    // The switcher sits to the right of and roughly level with the title.
    expect(switcherBox!.x).toBeGreaterThan(headerBox!.x);
  });

  test('switches the whole UI to English and Swedish and persists the choice across reloads', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Näin se toimii' })).toBeVisible();
    const switcher = page.getByRole('group', { name: /Kieli|Language|Språk/ });

    await switcher.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '1. Load data' })).toBeVisible();

    await switcher.getByRole('button', { name: 'SV', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Så här fungerar det' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '1. Ladda data' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Så här fungerar det' })).toBeVisible();
  });
});
