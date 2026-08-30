import { encryptJson, createVaultKey, decryptJson, shredKey } from '../../crypto/vault';
import { saveSession, loadSession, shredSession } from '../../storage/localVault';

export type VaultState<T> = { key: CryptoKey; data: T; generation: string };

function generationId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createEncryptedVault<T>(data: T): Promise<VaultState<T>> {
  const key = await createVaultKey();
  const generation = generationId();
  const payload = await encryptJson(data, key, generation);
  await saveSession({ generation, payload }, key);
  return { key, data, generation };
}

export async function persistVault<T>(vault: VaultState<T>): Promise<VaultState<T>> {
  const payload = await encryptJson(vault.data, vault.key, vault.generation);
  await saveSession({ generation: vault.generation, payload }, vault.key);
  return vault;
}

export async function restorePersistedVault<T>(): Promise<VaultState<T> | null> {
  const session = await loadSession();
  if (!session || !session.stored.generation) return null;
  try {
    const data = await decryptJson<T>(session.stored.payload, session.key, session.stored.generation);
    return { key: session.key, data, generation: session.stored.generation };
  } catch {
    return null;
  }
}

export async function cryptoshred<T>(vault: VaultState<T> | null): Promise<null> {
  if (vault) shredKey(vault.key);
  await shredSession();
  return null;
}
