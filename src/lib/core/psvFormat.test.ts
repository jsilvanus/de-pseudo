import { describe, expect, it } from 'vitest';
import { buildPrompt, pseudonymizedTable } from './prompt';
import { parseSessionResponse, validateResults } from './result';

const sessionId = '0123456789abcdef0123456789abcdef';

describe('psv response format', () => {
  it('describes a pipe-separated table in the prompt instructions', () => {
    const prompt = buildPrompt([{ pseudonym: 'abc123def456' }], 'Choose', 'psv', sessionId);
    expect(prompt).toContain('pipe-separated (PSV, using "|") table');
    expect(prompt).toContain(`SESSION ID: ${sessionId}`);
  });

  it('renders the pseudonymized data block as PSV, stripping a literal pipe from a value', () => {
    const prompt = buildPrompt(
      [{ pseudonym: 'abc123def456', note: 'Room A | Wing 2' }],
      '{{pseudonymized values}}',
      'psv',
      sessionId,
    );
    expect(prompt).toContain('pseudonym|note');
    expect(prompt).toContain('abc123def456|Room A   Wing 2');
    // The tsv (default) rendering must be unaffected by the psv format existing.
    expect(pseudonymizedTable([{ pseudonym: 'abc123def456', note: 'a|b' }])).toBe('pseudonym\tnote\nabc123def456\ta|b');
  });

  it('round-trips a psv AI response back through parsing and validation', () => {
    const response = [
      `SESSION ID: ${sessionId}`,
      'pseudonym|choice',
      'abc123def456|vanilla icecream',
      'def456abc123|pizza',
    ].join('\n');
    const parsed = parseSessionResponse(response, 'psv', sessionId);
    expect(parsed).toEqual([
      { pseudonym: 'abc123def456', choice: 'vanilla icecream' },
      { pseudonym: 'def456abc123', choice: 'pizza' },
    ]);
    const validation = validateResults(parsed, ['abc123def456', 'def456abc123']);
    expect(validation.unknown).toEqual([]);
    expect(validation.missingPseudonyms).toEqual([]);
  });

  it('rejects a psv response without the session ID', () => {
    expect(() => parseSessionResponse('pseudonym|choice\nabc|pizza', 'psv', sessionId)).toThrow();
  });
});
