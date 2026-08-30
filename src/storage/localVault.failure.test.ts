import { describe, expect, it } from 'vitest';
import { createVaultKey, encryptJson, decryptJson } from '../crypto/vault';
import { loadSession, saveSession, shredSession } from './localVault';

const generation = '0123456789abcdef0123456789abcdef';

async function payload(value: unknown, key: CryptoKey) {
  return encryptJson(value, key, generation);
}

describe('atomic local session storage', () => {
  it('stores and restores ciphertext and key as one session', async () => {
    await shredSession();
    const key = await createVaultKey();
    const encrypted = await payload({ name: 'Alice', choice: 'pizza' }, key);
    await saveSession({ generation, payload: encrypted }, key);

    const loaded = await loadSession();
    expect(loaded).not.toBeNull();
    await expect(decryptJson(loaded!.stored.payload, loaded!.key, generation))
      .resolves.toEqual({ name: 'Alice', choice: 'pizza' });
  });

  it('fails closed when ciphertext is missing', async () => {
    await shredSession();
    const loaded = await loadSession();
    expect(loaded).toBeNull();
  });

  it('fails closed when the key is missing', async () => {
    await shredSession();
    const key = await createVaultKey();
    const encrypted = await payload({ secret: 'value' }, key);
    await saveSession({ generation, payload: encrypted }, key);

    // The test deliberately exercises the public storage contract through a
    // separate transaction: deleting the key leaves an inconsistent state.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('de-pseudo', 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('keys', 'readwrite');
      tx.objectStore('keys').delete('active');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    expect(await loadSession()).toBeNull();
  });

  it('rejects a generation swap', async () => {
    await shredSession();
    const key = await createVaultKey();
    const encrypted = await payload({ secret: 'value' }, key);
    await saveSession({ generation, payload: encrypted }, key);

    const loaded = await loadSession();
    await expect(decryptJson(loaded!.stored.payload, loaded!.key, 'ffffffffffffffffffffffffffffffff'))
      .rejects.toThrow();
  });

  it('rejects modified ciphertext', async () => {
    await shredSession();
    const key = await createVaultKey();
    const encrypted = await payload({ secret: 'value' }, key);
    const bytes = Uint8Array.from(atob(encrypted.ciphertext), c => c.charCodeAt(0));
    bytes[bytes.length - 1] ^= 1;
    const modified = { ...encrypted, ciphertext: btoa(String.fromCharCode(...bytes)) };

    await expect(decryptJson(modified, key, generation)).rejects.toThrow();
  });

  it('shreds both key and ciphertext', async () => {
    const key = await createVaultKey();
    await saveSession({ generation, payload: await payload({ personal: true }, key) }, key);
    await shredSession();
    expect(await loadSession()).toBeNull();
  });
});
