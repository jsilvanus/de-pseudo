import { describe, expect, it } from 'vitest';
import { parseSessionResponse } from './result';

const sessionId = '0123456789abcdef0123456789abcdef';

describe('the "--- RESULT ---" wrapper', () => {
  it('lets a tsv reply carry explanation before and after the wrapped data', () => {
    const response = [
      "Sure, here's my reasoning: pizza is the most popular choice this week.",
      '',
      '--- RESULT ---',
      `SESSION ID:\t${sessionId}`,
      '',
      'pseudonym\tchoice',
      'abc123def456\tpizza',
      '--- END RESULT ---',
      '',
      'Let me know if you want a different suggestion!',
    ].join('\n');
    expect(parseSessionResponse(response, 'tsv', sessionId)).toEqual([
      { pseudonym: 'abc123def456', choice: 'pizza' },
    ]);
  });

  it('lets a csv reply carry explanation, matched case-insensitively with extra dashes', () => {
    const response = [
      'Notes: assigned based on stated preferences.',
      '----- Result -----',
      `SESSION ID: ${sessionId}`,
      'pseudonym,choice',
      'abc123def456,pizza',
      '----- End Result -----',
    ].join('\n');
    expect(parseSessionResponse(response, 'csv', sessionId)).toEqual([
      { pseudonym: 'abc123def456', choice: 'pizza' },
    ]);
  });

  it('lets a json reply carry explanation around the wrapped object', () => {
    const response = [
      'Here you go:',
      '--- RESULT ---',
      JSON.stringify({ sessionId, results: [{ pseudonym: 'abc123def456', choice: 'pizza' }] }),
      '--- END RESULT ---',
      'Hope that helps.',
    ].join('\n');
    expect(parseSessionResponse(response, 'json', sessionId)).toEqual([
      { pseudonym: 'abc123def456', choice: 'pizza' },
    ]);
  });

  it('still parses a plain reply with no wrapper at all (backward compatible)', () => {
    const response = [`SESSION ID:\t${sessionId}`, 'pseudonym\tchoice', 'abc123def456\tpizza'].join('\n');
    expect(parseSessionResponse(response, 'tsv', sessionId)).toEqual([
      { pseudonym: 'abc123def456', choice: 'pizza' },
    ]);
  });

  it('ignores stray data-shaped lines outside the block', () => {
    // A pseudonym-looking mention in the surrounding chat must not leak into
    // the parsed results just because it appears before the real block.
    const response = [
      'For reference, abc123def456 was also considered but not chosen.',
      '--- RESULT ---',
      `SESSION ID:\t${sessionId}`,
      'pseudonym\tchoice',
      'def456abc123\tpizza',
      '--- END RESULT ---',
    ].join('\n');
    const result = parseSessionResponse(response, 'tsv', sessionId);
    expect(result).toEqual([{ pseudonym: 'def456abc123', choice: 'pizza' }]);
  });
});
