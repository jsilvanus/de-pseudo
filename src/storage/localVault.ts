import type { EncryptedPayload } from '../crypto/vault';

export type PersistedVault = {
  generation: string;
  payload: EncryptedPayload;
};

const DB_NAME = 'de-pseudo';
const STORE_NAME = 'vault';
const RECORD_KEY = 'active';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local vault'));
  });
}

export async function saveEncryptedVault(value: PersistedVault): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save local vault'));
    tx.onabort = () => reject(tx.error ?? new Error('Local vault transaction aborted'));
  });
  db.close();
}

export async function loadEncryptedVault(): Promise<PersistedVault | null> {
  const db = await openDb();
  const value = await new Promise<PersistedVault | undefined>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(RECORD_KEY);
    request.onsuccess = () => resolve(request.result as PersistedVault | undefined);
    request.onerror = () => reject(request.error ?? new Error('Could not read local vault'));
  });
  db.close();
  return value ?? null;
}

export async function shredLocalVault(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not shred local vault'));
    tx.onabort = () => reject(tx.error ?? new Error('Local vault shred aborted'));
  });
  db.close();
}
