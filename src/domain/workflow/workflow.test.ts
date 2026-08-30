import { describe, expect, it, beforeEach } from 'vitest';
import { SessionVault } from '../shred/sessionVault';
import { pseudonymizeDataset } from '../dataset/pseudonymize';
import { buildPrompt } from '../prompt/buildPrompt';
import { resolveResult } from '../result/resolveResult';
import { shredSession } from '../../storage/localVault';

describe('de-pseudo end-to-end workflow', () => {
  beforeEach(async () => { await shredSession(); });

  it('pseudonymizes, prompts, resolves, persists, restores and shreds', async () => {
    const input = [
      { username: 'Alice', data: 'wants icecream' },
      { username: 'Bob', data: 'wants pizza' },
    ];

    const pseudonymized = pseudonymizeDataset(input);
    expect(pseudonymized.rows).toHaveLength(2);
    expect(pseudonymized.rows.map(r => r.username)).not.toContain('Alice');
    expect(pseudonymized.rows.map(r => r.username)).not.toContain('Bob');

    const prompt = buildPrompt(pseudonymized.rows, 'Make an order based on food preferences.');
    expect(prompt).toContain('icecream');
    expect(prompt).toContain('pizza');
    expect(prompt).not.toContain('Alice');
    expect(prompt).not.toContain('Bob');

    const [a, b] = pseudonymized.rows.map(r => r.username);
    const aiResult = `${a} -> vanilla icecream\n${b} -> pizza`;
    const resolved = resolveResult(aiResult, pseudonymized.mapping);
    expect(resolved).toContain('Alice');
    expect(resolved).toContain('Bob');
    expect(resolved).toContain('vanilla icecream');
    expect(resolved).toContain('pizza');

    const vault = new SessionVault();
    await vault.create({ pseudonymized, prompt, aiResult });
    const generation = vault.generation;
    expect(generation).toHaveLength(32);

    const restored = new SessionVault();
    await expect(restored.restore()).resolves.toEqual({ pseudonymized, prompt, aiResult });
    expect(restored.generation).toBe(generation);

    await restored.shred();
    const afterShred = new SessionVault();
    await expect(afterShred.restore()).resolves.toBeNull();
    expect(afterShred.active).toBe(false);
  });

  it('never resolves a made-up pseudonym', () => {
    const input = [{ username: 'Alice', data: 'wants tea' }];
    const pseudonymized = pseudonymizeDataset(input);
    const resolved = resolveResult('not-a-real-token -> coffee', pseudonymized.mapping);
    expect(resolved).toContain('not-a-real-token');
    expect(resolved).not.toContain('Alice');
  });
});
