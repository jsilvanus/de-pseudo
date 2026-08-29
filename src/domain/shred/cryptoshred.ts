import { encryptJson, createVaultKey, decryptJson, shredKey, type EncryptedPayload } from '../../crypto/vault';
import { saveEncryptedVault, loadEncryptedVault, shredLocalVault } from '../../storage/localVault';
import { saveVaultKey, loadVaultKey, shredVaultKey } from '../../storage/localKey';

export type VaultState<T> = {
  key: CryptoKey;
  data: T;
};

/** Create a local encrypted session. Plaintext session data is never persisted. */
export async function createEncryptedVault<T>(data: T): Promise<VaultState<T>> {
  const key = await createVaultKey();
  const encrypted = await encryptJson(data, key);
  await saveEncryptedVault(encrypted);
  await saveVaultKey(key);
  return { key, data };
}

export async function persistVault<T>(vault: VaultState<T>): Promise<VaultState<T>> {
  const encrypted = await encryptJson(vault.data, vault.key);
  await saveEncryptedVault(encrypted);
  return vault;
}

export async function restorePersistedVault<T>(): Promise<VaultState<T> | null> {
  const [payload, key] = await Promise.all([loadEncryptedVault(), loadVaultKey()]);
  if (!payload || !key) return null;

  try {
    const data = await decryptJson<T>(payload, key);
    return { key, data };
  } catch {
    // A ciphertext/key mismatch must never expose or partially restore data.
    return null;
  }
}

export async function restoreVault<T>(payload: EncryptedPayload, key: CryptoKey): Promise<T> {
  return decryptJson<T>(payload, key);
}

/** Destroy encrypted state and remove the only application-persisted key reference. */
export async function cryptoshred<T>(vault: VaultState<T> | null): Promise<null> {
  if (vault) shredKey(vault.key);
  await Promise.all([shredLocalVault(), shredVaultKey()]);
  return null;
}
