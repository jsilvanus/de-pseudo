import { describe, expect, it } from 'vitest';
import { formatPseudonymizedRows, pseudonymize, toPseudonymizedRows } from './pseudonymize';

describe('pseudonymize', () => {
  it('creates one mapping per input row', () => {
    const dataset = pseudonymize([
      { identity: 'Juha', data: { preference: 'icecream' } },
      { identity: 'Anna', data: { preference: 'pizza' } },
    ]);
    expect(dataset.rows).toHaveLength(2);
    expect(dataset.mappings).toEqual([
      { pseudonym: dataset.rows[0].pseudonym, identity: 'Juha' },
      { pseudonym: dataset.rows[1].pseudonym, identity: 'Anna' },
    ]);
  });

  it('generates distinct pseudonyms for normal input', () => {
    const dataset = pseudonymize(Array.from({ length: 100 }, (_, i) => ({ identity: `user-${i}`, data: {} })));
    expect(new Set(dataset.rows.map((row) => row.pseudonym)).size).toBe(100);
  });

  it('does not put identities in the pseudonymized rows', () => {
    const dataset = pseudonymize([{ identity: 'Juha', data: { preference: 'icecream' } }]);
    expect(toPseudonymizedRows(dataset)).toEqual([{ pseudonym: dataset.rows[0].pseudonym, data: { preference: 'icecream' } }]);
  });

  it('formats pseudonymized rows without identity', () => {
    const text = formatPseudonymizedRows([{ pseudonym: 'abc12345', data: { preference: 'pizza', note: 'Friday' } }]);
    expect(text).toBe('abc12345 | pizza | Friday');
    expect(text).not.toContain('Juha');
  });

  it('handles empty data values', () => {
    expect(formatPseudonymizedRows([{ pseudonym: 'abc12345', data: { preference: '' } }])).toBe('abc12345');
  });
});
