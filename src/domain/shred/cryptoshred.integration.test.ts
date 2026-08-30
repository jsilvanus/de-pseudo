import { beforeEach, describe, expect, it } from 'vitest';
import { createEncryptedVault, cryptoshred, restorePersistedVault } from './cryptoshred';
import { loadSession, saveSession, shredSession } from '../../storage/localVault';

describe('encrypted session lifecycle', () => {
  beforeEach(async () => {
    await shredSession();
  });

  it('persists only encrypted payload and restores the plaintext with the persisted key', async () => {
    const session = { identity: 'Juha', pseudonym: 'abc12345', choice: 'icecream' };
    await createEncryptedVault(session);

    const stored = await loadSession();
    expect(stored).not.toBeNull();
    expect(JSON.stringify(stored?.stored)).not.toContain('Juha');
    expect(JSON.stringify(stored?.stored)).not.toContain('icecream');

    const restored = await restorePersistedVault<typeof session>();
    expect(restored?.data).toEqual(session);
  });

  it('cannot restore after the encrypted payload is tampered with', async () => {
    await createEncryptedVault({ secret: 'personal data' });
    const stored = await loadSession();
    expect(stored).not.toBeNull();

    const ciphertext = atob(stored!.stored.payload.ciphertext);
    const bytes = Uint8Array.from(ciphertext, c => c.charCodeAt(0));
    bytes[bytes.length - 1] ^= 1;

    await saveSession(
      {
        generation: stored!.stored.generation,
        payload: {
          ...stored!.stored.payload,
          ciphertext: btoa(String.fromCharCode(...bytes)),
        },
      },
      stored!.key,
    );

    await expect(restorePersistedVault()).resolves.toBeNull();
  });

  it('shreds both encrypted data and the persisted key reference', async () => {
    const vault = await createEncryptedVault({ identity: 'Juha', secret: 'pizza' });
    expect(await loadSession()).not.toBeNull();

    await cryptoshred(vault);

    expect(await loadSession()).toBeNull();
    expect(await restorePersistedVault()).toBeNull();
  });

  it('fails closed when the persisted key is missing', async () => {
    await createEncryptedVault({ identity: 'Juha' });
    const stored = await loadSession();
    expect(stored).not.toBeNull();

    // Remove both persisted records; restore must fail closed.
    await shredSession();
    await expect(restorePersistedVault()).resolves.toBeNull();
  });
});
