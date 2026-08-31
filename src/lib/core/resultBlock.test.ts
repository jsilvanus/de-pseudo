import { describe, expect, it } from 'vitest';
import { parseSessionResponse } from './result';
import { responseInstructions } from './prompt';

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

describe('allowing explanation must not reopen the door to markdown-formatted data', () => {
  // Regression coverage: the "you may add explanation" note was added without
  // re-stating that the data itself still can't be a markdown table or code
  // block — that combination is exactly what let an AI's reply come back
  // with its row breaks lost (e.g. a rendered markdown table copied without
  // its newlines).
  it.each(['tsv', 'csv', 'psv'] as const)('tells the AI not to format the %s data as markdown, alongside the explanation note', (format) => {
    const instructions = responseInstructions(format, sessionId, ['pseudonym', 'choice']);
    expect(instructions).toMatch(/not.*markdown table.*code block/i);
    expect(instructions).toContain('one row per line');
    expect(instructions).toContain('--- RESULT ---');
  });

  it('tells the AI not to wrap the json reply in a markdown code block, alongside the explanation note', () => {
    const instructions = responseInstructions('json', sessionId, ['pseudonym', 'choice']);
    expect(instructions).toMatch(/not.*markdown code block/i);
    expect(instructions).toContain('--- RESULT ---');
  });
});
