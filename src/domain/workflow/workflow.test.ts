import { beforeEach, describe, expect, it } from 'vitest';
import {
  pseudonymize,
  defaultSchema,
  applySchema,
  buildPrompt,
  validateResults,
  parseSessionResponse,
} from '../../lib/core';
import { resolveResult } from '../result/resolve';
import { SessionVault } from '../shred/sessionVault';

const source = [
  { username: 'Alice', preference: 'wants icecream' },
  { username: 'Bob', preference: 'wants pizza' },
];

describe('de-pseudo end-to-end workflow', () => {
  beforeEach(async () => {
    const existing = new SessionVault<unknown>();
    await existing.restore();
    if (existing.active) await existing.shred();
  });

  it('pseudonymizes, prompts, resolves, persists, restores and shreds', async () => {
    const base = pseudonymize(source);
    const schema = defaultSchema(source);
    const rows = applySchema(source, base.rows.map(r => r.pseudonym), schema);
    const sessionId = 'workflow-session';

    const prompt = buildPrompt(rows, 'Make an order based on food preferences. {{pseudonymized values}}', 'tsv', sessionId, schema);
    expect(prompt).toContain('icecream');
    expect(prompt).toContain('pizza');
    expect(prompt).not.toContain('Alice');
    expect(prompt).not.toContain('Bob');

    const [a, b] = base.rows.map(r => r.pseudonym);
    const response = `SESSION ID:\t${sessionId}\npseudonym\tchoice\n${a}\tvanilla icecream\n${b}\tpizza`;
    const parsed = parseSessionResponse(response, 'tsv', sessionId);
    const validation = validateResults(parsed, [a, b]);
    expect(validation.unknown).toEqual([]);
    expect(validation.duplicatePseudonyms).toEqual([]);
    expect(validation.missingPseudonyms).toEqual([]);

    const resolved = resolveResult(JSON.stringify(parsed), base.mapping);
    expect(resolved).toContain('Alice');
    expect(resolved).toContain('Bob');
    expect(resolved).toContain('vanilla icecream');
    expect(resolved).toContain('pizza');

    const vault = new SessionVault();
    await vault.create({ base, schema, prompt, response });
    const generation = vault.generation;
    expect(generation).toHaveLength(32);

    const restored = new SessionVault();
    await expect(restored.restore()).resolves.toEqual({ base, schema, prompt, response });
    expect(restored.generation).toBe(generation);

    await restored.shred();
    const afterShred = new SessionVault();
    await expect(afterShred.restore()).resolves.toBeNull();
    expect(afterShred.active).toBe(false);
  });

  it('never resolves a made-up pseudonym', () => {
    const base = pseudonymize([{ username: 'Alice', preference: 'wants tea' }]);
    const resolved = resolveResult(JSON.stringify([{ pseudonym: 'not-a-real-token', choice: 'coffee' }]), base.mapping);
    expect(resolved).toContain('not-a-real-token');
    expect(resolved).not.toContain('Alice');
  });
});
