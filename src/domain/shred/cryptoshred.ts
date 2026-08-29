import { encryptJson, createVaultKey, decryptJson, shredKey, type EncryptedPayload } from '../../crypto/vault';
import { saveEncryptedVault, shredLocalVault } from '../../storage/localVault';

export type VaultState<T> = {
  key: CryptoKey;
  data: T;
};

/** Create an in-memory vault and persist only encrypted state. */
export async function createEncryptedVault<T>(data: T): Promise<VaultState<T>> {
  const key = await createVaultKey();
  const encrypted = await encryptJson(data, key);
  await saveEncryptedVault(encrypted);
  return { key, data };
}

export async function restoreVault<T>(payload: EncryptedPayload, key: CryptoKey): Promise<T> {
  return decryptJson<T>(payload, key);
}

/**
 * Cryptoshred the application vault.
 *
 * The browser cannot explicitly zeroize a CryptoKey. We therefore remove all
 * application references to the key and delete the encrypted local state.
 */
export async function cryptoshred<T>(vault: VaultState<T> | null): Promise<null> {
  if (vault) shredKey(vault.key);
  await shredLocalVault();
  return null;
}
