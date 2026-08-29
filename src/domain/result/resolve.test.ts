import { describe, expect, it } from 'vitest';
import { findPseudonyms, resolveResult, resolveText } from './resolve';

const mappings = [
  { pseudonym: 'abc12345', identity: 'Juha' },
  { pseudonym: 'xyz98765', identity: 'Anna' },
];

describe('result resolution', () => {
  it('resolves known pseudonyms', () => {
    expect(resolveText('abc12345 -> icecream\nxyz98765 -> pizza', mappings))
      .toBe('Juha -> icecream\nAnna -> pizza');
  });

  it('resolves repeated occurrences', () => {
    expect(resolveText('abc12345 chose abc12345', mappings)).toBe('Juha chose Juha');
  });

  it('does not resolve unknown pseudonyms', () => {
    expect(resolveText('unknown12 -> pizza', mappings)).toBe('unknown12 -> pizza');
  });

  it('does not match a pseudonym embedded inside another token', () => {
    expect(resolveText('xabc12345y', mappings)).toBe('xabc12345y');
  });

  it('finds only known pseudonyms', () => {
    expect(findPseudonyms('abc12345 and missing99', mappings)).toEqual(['abc12345']);
  });

  it('returns one resolved result per referenced person', () => {
    expect(resolveResult('abc12345 -> icecream\nxyz98765 -> pizza', mappings)).toEqual([
      { pseudonym: 'abc12345', identity: 'Juha', result: 'Juha -> icecream\nxyz98765 -> pizza' },
      { pseudonym: 'xyz98765', identity: 'Anna', result: 'abc12345 -> icecream\nAnna -> pizza' },
    ]);
  });

  it('handles special characters in mappings safely', () => {
    const special = [{ pseudonym: 'a+b.c?', identity: 'Special' }];
    expect(resolveText('a+b.c? selected', special)).toBe('Special selected');
  });
});
