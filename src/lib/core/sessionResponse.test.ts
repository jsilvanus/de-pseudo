import { describe, expect, it } from 'vitest';
import { buildPrompt } from './prompt';
import { parseSessionResponse } from './result';
import { pseudonymize } from './pseudonymize';

const sessionId = '0123456789abcdef0123456789abcdef';

describe('session-bound AI response', () => {
  it('puts the same random session ID in the prompt', () => {
    const prompt = buildPrompt([{ pseudonym: 'abc123' }], 'Choose', 'lines', sessionId);
    expect(prompt).toContain(`SESSION ID: ${sessionId}`);
    expect(prompt).toContain(`SESSION ID: ${sessionId}`);
  });

  it('accepts only a response carrying the exact session ID', () => {
    const response = `SESSION ID: ${sessionId}\nabc123 -> pizza`;
    expect(parseSessionResponse(response, 'lines', sessionId)).toEqual([
      { pseudonym: 'abc123', choice: 'pizza' },
    ]);
  });

  it('rejects a response without a session ID', () => {
    expect(() => parseSessionResponse('abc123 -> pizza', 'lines', sessionId)).toThrow();
  });

  it('rejects a response from another session', () => {
    expect(() => parseSessionResponse('SESSION ID: ffffffffffffffffffffffffffffffff\nabc123 -> pizza', 'lines', sessionId)).toThrow();
  });

  it('does not expose the identity mapping in prompt material', () => {
    const dataset = pseudonymize([{ username: 'Alice', preference: 'pizza' }]);
    const prompt = buildPrompt(dataset.rows, 'Choose', 'lines', sessionId);
    expect(prompt).not.toContain('Alice');
    expect(prompt).toContain(dataset.rows[0].pseudonym);
    expect(prompt).toContain(sessionId);
  });

  it('a session ID alone cannot resolve an identity', () => {
    const dataset = pseudonymize([{ username: 'Alice', preference: 'pizza' }]);
    const prompt = buildPrompt(dataset.rows, 'Choose', 'lines', sessionId);
    const leakedMaterials = `${sessionId}\n${JSON.stringify(dataset.rows)}`;
    expect(leakedMaterials).not.toContain('Alice');
    expect(prompt).not.toContain('Alice');
  });
});
