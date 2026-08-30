import { describe, expect, it } from 'vitest';
import { buildPrompt, pseudonymizedTable } from './prompt';
import { parseSessionResponse, validateResults } from './result';

const sessionId = '0123456789abcdef0123456789abcdef';

describe('csv response format', () => {
  it('describes a comma-separated table in the prompt instructions', () => {
    const prompt = buildPrompt([{ pseudonym: 'abc123def456' }], 'Choose', 'csv', sessionId);
    expect(prompt).toContain('comma-separated (CSV) table');
    expect(prompt).toContain(`SESSION ID: ${sessionId}`);
  });

  it('renders the pseudonymized data block as CSV, quoting a value containing a comma', () => {
    const prompt = buildPrompt(
      [{ pseudonym: 'abc123def456', note: 'Springfield, Apt 2' }],
      '{{pseudonymized values}}',
      'csv',
      sessionId,
    );
    expect(prompt).toContain('pseudonym,note');
    expect(prompt).toContain('abc123def456,"Springfield, Apt 2"');
    // The tsv (default) rendering must be unaffected by the csv format existing.
    expect(pseudonymizedTable([{ pseudonym: 'abc123def456', note: 'a,b' }])).toBe('pseudonym\tnote\nabc123def456\ta,b');
  });

  it('round-trips a csv AI response back through parsing and validation', () => {
    const response = [
      `SESSION ID: ${sessionId}`,
      'pseudonym,choice',
      'abc123def456,vanilla icecream',
      'def456abc123,pizza',
    ].join('\n');
    const parsed = parseSessionResponse(response, 'csv', sessionId);
    expect(parsed).toEqual([
      { pseudonym: 'abc123def456', choice: 'vanilla icecream' },
      { pseudonym: 'def456abc123', choice: 'pizza' },
    ]);
    const validation = validateResults(parsed, ['abc123def456', 'def456abc123']);
    expect(validation.unknown).toEqual([]);
    expect(validation.missingPseudonyms).toEqual([]);
  });

  it('does not un-quote a comma embedded in a response value (known limitation, like the tsv parser)', () => {
    // The response parser, like its tsv counterpart, splits naively on the
    // delimiter rather than doing full quote-aware CSV parsing. A quoted
    // comma in an AI's answer will corrupt that one field rather than being
    // silently swallowed into the wrong column or another row.
    const response = [`SESSION ID: ${sessionId}`, 'pseudonym,choice', 'abc123def456,"vanilla, chocolate"'].join('\n');
    const parsed = parseSessionResponse(response, 'csv', sessionId);
    expect(parsed).toEqual([{ pseudonym: 'abc123def456', choice: '"vanilla' }]);
  });

  it('rejects a csv response without the session ID', () => {
    expect(() => parseSessionResponse('pseudonym,choice\nabc,pizza', 'csv', sessionId)).toThrow();
  });
});
