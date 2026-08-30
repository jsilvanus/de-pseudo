import { describe, expect, it } from 'vitest';
import { pseudonymize } from '../../lib/core';
import { resolveResult } from './resolve';

describe('result resolver adversarial inputs', () => {
  const input = [
    { username: 'Alice', data: 'wants ice cream' },
    { username: 'Bob', data: 'wants pizza' },
    { username: 'Carol', data: 'wants tea' },
  ];

  function makeMappings() {
    const dataset = pseudonymize(input);
    const mappings = Object.entries(dataset.mapping).map(([pseudonym, record]) => ({
      pseudonym,
      identity: String(record.username),
    }));
    return { dataset, mappings };
  }

  it('does not reveal identities for arbitrary unknown strings', () => {
    const { mappings } = makeMappings();
    const candidates = [
      '', 'Alice', 'Bob', 'Carol', 'alice', 'bob',
      'undefined', 'null', 'NaN', 'constructor', 'prototype',
      '<script>alert(1)</script>', 'xncngdl3', 'AAAAAAA!',
      '😀', '你好', 'a'.repeat(10000),
    ];

    for (const candidate of candidates) {
      const resolved = resolveResult(`${candidate} -> coffee`, mappings);
      if (!mappings.some(m => m.pseudonym === candidate)) {
        expect(resolved).not.toContain('Alice');
        expect(resolved).not.toContain('Bob');
        expect(resolved).not.toContain('Carol');
      }
    }
  });

  it('preserves punctuation and Unicode around valid pseudonyms', () => {
    const { dataset, mappings } = makeMappings();
    for (const row of dataset.rows) {
      const result = `【${row.pseudonym}】 → 🍕 café — ${row.pseudonym}!`;
      const resolved = resolveResult(result, mappings);
      expect(resolved.some(r => r.identity === dataset.mapping[row.pseudonym].username)).toBe(true);
    }
  });

  it('handles repeated valid pseudonyms deterministically', () => {
    const { dataset, mappings } = makeMappings();
    const token = dataset.rows[0].pseudonym;
    const resolved = resolveResult(`${token} -> one\n${token} -> two\n${token} -> three`, mappings);
    expect(resolved).toHaveLength(1);
    expect((resolved[0].result.match(new RegExp(String(dataset.mapping[token].username), 'g')) ?? []).length).toBe(3);
  });

  it('does not treat a token-like substring as a token', () => {
    const { dataset, mappings } = makeMappings();
    const token = dataset.rows[0].pseudonym;
    const resolved = resolveResult(`prefix-${token}-suffix -> coffee`, mappings);
    expect(resolved).toHaveLength(0);
  });

  it('survives generated random noise without throwing', () => {
    const { mappings } = makeMappings();
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789 -_.,:;()[]{}😀äöå你好';

    for (let i = 0; i < 500; i++) {
      let noise = '';
      const length = i % 101;
      for (let j = 0; j < length; j++) {
        noise += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      expect(() => resolveResult(noise, mappings)).not.toThrow();
    }
  });
});
