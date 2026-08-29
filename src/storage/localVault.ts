import type { EncryptedPayload } from '../crypto/vault';

const DB_NAME = 'de-pseudo';
const STORE_NAME = 'vault';
const RECORD_KEY = 'active';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local vault'));
  });
}

export async function saveEncryptedVault(payload: EncryptedPayload): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(payload, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save local vault'));
    tx.onabort = () => reject(tx.error ?? new Error('Local vault transaction aborted'));
  });
  db.close();
}

export async function loadEncryptedVault(): Promise<EncryptedPayload | null> {
  const db = await openDb();
  const value = await new Promise<EncryptedPayload | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(RECORD_KEY);
    request.onsuccess = () => resolve(request.result as EncryptedPayload | undefined);
    request.onerror = () => reject(request.error ?? new Error('Could not read local vault'));
  });
  db.close();
  return value ?? null;
}

/** Delete all application vault records. */
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
