import { describe, expect, it } from 'vitest';
import { pseudonymizeDataset } from '../dataset/pseudonymize';
import { resolveResult } from './resolveResult';

describe('result resolver adversarial inputs', () => {
  const input = [
    { username: 'Alice', data: 'wants ice cream' },
    { username: 'Bob', data: 'wants pizza' },
    { username: 'Carol', data: 'wants tea' },
  ];

  it('does not reveal identities for arbitrary unknown strings', () => {
    const { mapping } = pseudonymizeDataset(input);
    const candidates = [
      '', 'Alice', 'Bob', 'Carol', 'alice', 'bob',
      'undefined', 'null', 'NaN', 'constructor', 'prototype',
      '<script>alert(1)</script>', 'xncngdl3', 'AAAAAAA!',
      '😀', '你好', 'a'.repeat(10000),
    ];

    for (const candidate of candidates) {
      const resolved = resolveResult(`${candidate} -> coffee`, mapping);
      if (!Object.keys(mapping).includes(candidate)) {
        expect(resolved).not.toContain('Alice');
        expect(resolved).not.toContain('Bob');
        expect(resolved).not.toContain('Carol');
      }
    }
  });

  it('preserves punctuation and Unicode around valid pseudonyms', () => {
    const { rows, mapping } = pseudonymizeDataset(input);
    for (const row of rows) {
      const result = `【${row.username}】 → 🍕 café — ${row.username}!`;
      const resolved = resolveResult(result, mapping);
      expect(resolved).toContain(mapping[row.username]);
    }
  });

  it('handles repeated valid pseudonyms deterministically', () => {
    const { rows, mapping } = pseudonymizeDataset(input);
    const token = rows[0].username;
    const resolved = resolveResult(`${token} -> one\n${token} -> two\n${token} -> three`, mapping);
    expect((resolved.match(new RegExp(mapping[token], 'g')) ?? []).length).toBe(3);
  });

  it('does not treat a token-like substring as a token', () => {
    const { rows, mapping } = pseudonymizeDataset(input);
    const token = rows[0].username;
    const resolved = resolveResult(`prefix-${token}-suffix -> coffee`, mapping);
    expect(resolved).not.toContain(mapping[token]);
  });

  it('survives generated random noise without throwing', () => {
    const { mapping } = pseudonymizeDataset(input);
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789 -_.,:;()[]{}😀äöå你好';

    for (let i = 0; i < 500; i++) {
      let noise = '';
      const length = i % 101;
      for (let j = 0; j < length; j++) {
        noise += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      expect(() => resolveResult(noise, mapping)).not.toThrow();
    }
  });
});
