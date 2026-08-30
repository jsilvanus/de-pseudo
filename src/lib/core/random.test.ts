import { describe, expect, it } from 'vitest';
import { createPseudonymGenerator } from './random';

describe('platform-neutral randomness', () => {
  it('uses an injected byte source', () => {
    const generator = createPseudonymGenerator(() => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(generator()).toBe('010203040506');
  });

  it('does not require globalThis.crypto when randomness is injected', () => {
    const generator = createPseudonymGenerator(length => new Uint8Array(length).fill(0xab));
    expect(generator()).toBe('abababababab');
  });
});
