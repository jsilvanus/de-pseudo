export type RandomBytes = (length: number) => Uint8Array;

/** Default browser implementation. Consumers can inject their own CSPRNG. */
export function browserRandomBytes(length: number): Uint8Array {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('A cryptographically secure random source is required');
  }
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export function createPseudonymGenerator(randomBytes: RandomBytes = browserRandomBytes) {
  return function generatePseudonym(): string {
    const bytes = randomBytes(8);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
  };
}
