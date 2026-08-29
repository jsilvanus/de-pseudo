const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** Generate a copy-friendly cryptographically random pseudonym. */
export function generatePseudonym(length = 8): string {
  if (!Number.isInteger(length) || length < 4) {
    throw new Error('Pseudonym length must be an integer >= 4');
  }

  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}
