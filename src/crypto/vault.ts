const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

export type EncryptedPayload = {
  iv: string;
  ciphertext: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function createVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson<T>(value: T, key: CryptoKey): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, plaintext);

  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptJson<T>(payload: EncryptedPayload, key: CryptoKey): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: base64ToBytes(payload.iv) },
    key,
    base64ToBytes(payload.ciphertext),
  );

  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/** Best-effort destruction of a non-extractable CryptoKey reference. */
export function shredKey(key: CryptoKey | null): void {
  // CryptoKey objects cannot be explicitly zeroized by the Web Crypto API.
  // Dropping every application reference lets the browser reclaim the key.
  void key;
}
