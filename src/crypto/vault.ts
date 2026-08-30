const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

export type EncryptedPayload = { iv: string; ciphertext: string };

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function aad(generation: string): Uint8Array {
  return new TextEncoder().encode(`de-pseudo:v1:${generation}`);
}

export async function createVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson<T>(value: T, key: CryptoKey, generation = ''): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as BufferSource, additionalData: aad(generation) as BufferSource },
    key,
    plaintext as BufferSource,
  );
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

export async function decryptJson<T>(payload: EncryptedPayload, key: CryptoKey, generation = ''): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: base64ToBytes(payload.iv) as BufferSource, additionalData: aad(generation) as BufferSource },
    key,
    base64ToBytes(payload.ciphertext) as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/** Web Crypto provides no explicit zeroization; dropping references is the supported lifecycle. */
export function shredKey(key: CryptoKey | null): void {
  void key;
}
