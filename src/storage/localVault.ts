import type { EncryptedPayload } from '../crypto/vault';

export type PersistedVault = { generation: string; payload: EncryptedPayload };

const DB_NAME = 'de-pseudo';
const DB_VERSION = 3;
const VAULT_STORE = 'vault';
const KEY_STORE = 'keys';
const RECORD_KEY = 'active';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VAULT_STORE)) db.createObjectStore(VAULT_STORE);
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local vault'));
  });
}

export async function saveSession(value: PersistedVault, key: CryptoKey): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([VAULT_STORE, KEY_STORE], 'readwrite');
    tx.objectStore(VAULT_STORE).put(value, RECORD_KEY);
    tx.objectStore(KEY_STORE).put(key, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save local session'));
    tx.onabort = () => reject(tx.error ?? new Error('Local session transaction aborted'));
  });
  db.close();
}

export async function loadSession(): Promise<{ stored: PersistedVault; key: CryptoKey } | null> {
  const db = await openDb();
  const result = await new Promise<{ stored: PersistedVault; key: CryptoKey } | null>((resolve, reject) => {
    const tx = db.transaction([VAULT_STORE, KEY_STORE], 'readonly');
    const vaultRequest = tx.objectStore(VAULT_STORE).get(RECORD_KEY);
    const keyRequest = tx.objectStore(KEY_STORE).get(RECORD_KEY);
    tx.oncomplete = () => {
      const stored = vaultRequest.result as PersistedVault | undefined;
      const key = keyRequest.result as CryptoKey | undefined;
      resolve(stored && key ? { stored, key } : null);
    };
    tx.onerror = () => reject(tx.error ?? new Error('Could not read local session'));
  });
  db.close();
  return result;
}

export async function shredSession(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([VAULT_STORE, KEY_STORE], 'readwrite');
    tx.objectStore(VAULT_STORE).delete(RECORD_KEY);
    tx.objectStore(KEY_STORE).delete(RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not shred local session'));
    tx.onabort = () => reject(tx.error ?? new Error('Local session shred aborted'));
  });
  db.close();
}
