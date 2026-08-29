import { describe, expect, it } from 'vitest';
import { createVaultKey, decryptJson, encryptJson } from '../../crypto/vault';

describe('cryptographic vault', () => {
  it('round-trips encrypted data', async () => {
    const key = await createVaultKey();
    const original = { identity: 'Juha', choice: 'icecream' };
    const encrypted = await encryptJson(original, key);

    await expect(decryptJson(encrypted, key)).resolves.toEqual(original);
  });

  it('rejects tampered ciphertext', async () => {
    const key = await createVaultKey();
    const encrypted = await encryptJson({ secret: 'personal data' }, key);
    const bytes = Uint8Array.from(atob(encrypted.ciphertext), (c) => c.charCodeAt(0));
    bytes[0] ^= 1;
    const tampered = { ...encrypted, ciphertext: btoa(String.fromCharCode(...bytes)) };

    await expect(decryptJson(tampered, key)).rejects.toThrow();
  });
});
