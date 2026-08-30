import { beforeEach, describe, expect, it } from 'vitest';
import { SessionVault } from './sessionVault';
import { shredSession } from '../../storage/localVault';

const sample = { input: 'name\tdata\nA\tpizza', prompt: 'choose', result: 'x -> pizza' };

describe('SessionVault', () => {
  beforeEach(async () => {
    await shredSession();
  });

  it('starts inactive', () => {
    const vault = new SessionVault<typeof sample>();
    expect(vault.active).toBe(false);
    expect(vault.data).toBeNull();
    expect(vault.sessionId).toBeNull();
  });

  it('creates an active encrypted session with a random session id', async () => {
    const vault = new SessionVault<typeof sample>();
    await vault.create(sample);
    expect(vault.active).toBe(true);
    expect(vault.data).toEqual(sample);
    expect(vault.sessionId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('updates persisted state without changing the session id', async () => {
    const vault = new SessionVault<typeof sample>();
    await vault.create(sample);
    const sessionId = vault.sessionId;

    const changed = { ...sample, result: 'changed' };
    await vault.update(changed);

    expect(vault.data).toEqual(changed);
    expect(vault.sessionId).toBe(sessionId);

    const restored = new SessionVault<typeof sample>();
    await expect(restored.restore()).resolves.toEqual(changed);
    expect(restored.sessionId).toBe(sessionId);
  });

  it('clears its active state after shred and cannot restore the destroyed session', async () => {
    const vault = new SessionVault<typeof sample>();
    await vault.create(sample);
    await vault.shred();
    expect(vault.active).toBe(false);
    expect(vault.data).toBeNull();
    expect(vault.sessionId).toBeNull();

    const restored = new SessionVault<typeof sample>();
    await expect(restored.restore()).resolves.toBeNull();
    expect(restored.active).toBe(false);
  });
});
