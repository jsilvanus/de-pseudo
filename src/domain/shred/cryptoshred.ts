import { encryptJson, createVaultKey, decryptJson, shredKey } from '../../crypto/vault';
import { saveEncryptedVault, loadEncryptedVault, shredLocalVault, type PersistedVault } from '../../storage/localVault';
import { saveVaultKey, loadVaultKey, shredVaultKey } from '../../storage/localKey';

export type VaultState<T> = { key: CryptoKey; data: T; generation: string };

function generationId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createEncryptedVault<T>(data: T): Promise<VaultState<T>> {
  const key = await createVaultKey();
  const generation = generationId();
  const payload = await encryptJson(data, key);
  await saveEncryptedVault({ generation, payload });
  await saveVaultKey(key);
  return { key, data, generation };
}

export async function persistVault<T>(vault: VaultState<T>): Promise<VaultState<T>> {
  const payload = await encryptJson(vault.data, vault.key);
  await saveEncryptedVault({ generation: vault.generation, payload });
  return vault;
}

export async function restorePersistedVault<T>(): Promise<VaultState<T> | null> {
  const [stored, key] = await Promise.all([loadEncryptedVault(), loadVaultKey()]);
  if (!stored || !key || !stored.generation) return null;

  try {
    const data = await decryptJson<T>(stored.payload, key);
    return { key, data, generation: stored.generation };
  } catch {
    return null;
  }
}

/** Delete ciphertext and key reference; the generation prevents stale payload confusion. */
export async function cryptoshred<T>(vault: VaultState<T> | null): Promise<null> {
  if (vault) shredKey(vault.key);
  await Promise.all([shredLocalVault(), shredVaultKey()]);
  return null;
}
