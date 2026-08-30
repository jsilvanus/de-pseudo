import { describe, expect, it } from 'vitest';
import { buildPromptWithContract, responseInstructions } from './responseContract';
import { parseJsonResult, parseLineResult } from '../result/parseResult';
import { validateResult } from '../result/validateResult';

describe('response contracts', () => {
  it('builds a line-format contract without identities', () => {
    const prompt = buildPromptWithContract('abc123 | wants pizza', 'Choose food', 'lines');
    expect(prompt).toContain('abc123 -> <choice>');
    expect(prompt).not.toContain('Alice');
  });

  it('builds a JSON contract', () => {
    const instructions = responseInstructions('json');
    expect(instructions).toContain('JSON array');
    expect(instructions).toContain('pseudonym');
  });

  it('parses line results', () => {
    expect(parseLineResult('abc123 -> pizza\ndef456 -> icecream'))
      .toEqual([{ pseudonym: 'abc123', choice: 'pizza' }, { pseudonym: 'def456', choice: 'icecream' }]);
  });

  it('parses JSON results', () => {
    expect(parseJsonResult('[{"pseudonym":"abc123","choice":"pizza"}]'))
      .toEqual([{ pseudonym: 'abc123', choice: 'pizza' }]);
  });

  it('rejects incomplete JSON records', () => {
    expect(() => parseJsonResult('[{"pseudonym":"abc123"}]')).toThrow();
  });

  it('reports unknown, duplicate and missing pseudonyms', () => {
    const validation = validateResult(
      [
        { pseudonym: 'abc123', choice: 'pizza' },
        { pseudonym: 'abc123', choice: 'icecream' },
        { pseudonym: 'evil999', choice: 'secret' },
      ],
      ['abc123', 'def456'],
    );
    expect(validation.valid).toHaveLength(1);
    expect(validation.duplicatePseudonyms).toEqual(['abc123']);
    expect(validation.unknown[0].pseudonym).toBe('evil999');
    expect(validation.missingPseudonyms).toEqual(['def456']);
  });
});
