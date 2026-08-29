import { beforeEach, describe, expect, it } from 'vitest';
import { createEncryptedVault, cryptoshred, restorePersistedVault } from './cryptoshred';
import { loadEncryptedVault } from '../../storage/localVault';
import { loadVaultKey } from '../../storage/localKey';

describe('encrypted session lifecycle', () => {
  beforeEach(async () => {
    const existing = await restorePersistedVault<unknown>();
    if (existing) await cryptoshred(existing);
  });

  it('persists only encrypted payload and restores the plaintext with the key', async () => {
    const session = { identity: 'Juha', pseudonym: 'abc12345', choice: 'icecream' };
    await createEncryptedVault(session);

    const stored = await loadEncryptedVault();
    expect(stored).not.toBeNull();
    expect(JSON.stringify(stored)).not.toContain('Juha');
    expect(JSON.stringify(stored)).not.toContain('icecream');

    const restored = await restorePersistedVault<typeof session>();
    expect(restored?.data).toEqual(session);
  });

  it('cannot restore after the encrypted payload is tampered with', async () => {
    const session = { secret: 'personal data' };
    await createEncryptedVault(session);
    const stored = await loadEncryptedVault();
    expect(stored).not.toBeNull();

    const ciphertext = atob(stored!.ciphertext);
    const bytes = Uint8Array.from(ciphertext, (c) => c.charCodeAt(0));
    bytes[bytes.length - 1] ^= 1;

    const { saveEncryptedVault } = await import('../../storage/localVault');
    await saveEncryptedVault({ ...stored!, ciphertext: btoa(String.fromCharCode(...bytes)) });

    await expect(restorePersistedVault()).resolves.toBeNull();
  });

  it('shreds both encrypted data and the persisted key reference', async () => {
    const vault = await createEncryptedVault({ identity: 'Juha', secret: 'pizza' });
    expect(await loadEncryptedVault()).not.toBeNull();
    expect(await loadVaultKey()).not.toBeNull();

    await cryptoshred(vault);

    expect(await loadEncryptedVault()).toBeNull();
    expect(await loadVaultKey()).toBeNull();
    expect(await restorePersistedVault()).toBeNull();
  });

  it('fails closed when either half of the persisted vault is missing', async () => {
    await createEncryptedVault({ identity: 'Juha' });
    const { shredVaultKey } = await import('../../storage/localKey');
    await shredVaultKey();

    await expect(restorePersistedVault()).resolves.toBeNull();
  });
});
