import { describe, expect, it, vi } from 'vitest';
import { SessionVault } from './sessionVault';

const sample = { input: 'name\tdata\nA\tpizza', prompt: 'choose', result: 'x -> pizza' };

describe('SessionVault', () => {
  it('starts inactive', () => {
    const vault = new SessionVault<typeof sample>();
    expect(vault.active).toBe(false);
    expect(vault.data).toBeNull();
  });

  it('creates an active session', async () => {
    const vault = new SessionVault<typeof sample>();
    await vault.create(sample);
    expect(vault.active).toBe(true);
    expect(vault.data).toEqual(sample);
  });

  it('keeps the previous state when persistence fails', async () => {
    const vault = new SessionVault<typeof sample>();
    await vault.create(sample);
    const original = vault.data;

    const { persistVault } = await import('./cryptoshred');
    const spy = vi.spyOn(await import('./cryptoshred'), 'persistVault').mockRejectedValueOnce(new Error('storage failure'));

    await expect(vault.update({ ...sample, result: 'changed' })).rejects.toThrow('storage failure');
    expect(vault.data).toEqual(original);
    spy.mockRestore();
  });

  it('clears its active state after shred', async () => {
    const vault = new SessionVault<typeof sample>();
    await vault.create(sample);
    await vault.shred();
    expect(vault.active).toBe(false);
    expect(vault.data).toBeNull();
  });
});
