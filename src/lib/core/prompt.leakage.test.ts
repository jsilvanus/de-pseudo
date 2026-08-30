import { describe, expect, it } from 'vitest';
import { buildPrompt, pseudonymizedTsv } from './prompt';

describe('prompt privacy boundary', () => {
  const rows = [
    { pseudonym: 'xncngdl3', preference: 'icecream', friend: 'fnfifk32' },
    { pseudonym: 'fnfifk32', preference: 'pizza', friend: 'xncngdl3' },
  ];

  it('never includes real identities when building a prompt', () => {
    const prompt = buildPrompt(rows, 'Choose food. {{pseudonymized values}}', 'tsv', 'session-123');
    expect(prompt).not.toContain('John Johnson');
    expect(prompt).not.toContain('Mary Smith');
    expect(prompt).not.toContain('John');
    expect(prompt).not.toContain('Mary');
    expect(prompt).toContain('xncngdl3');
    expect(prompt).toContain('fnfifk32');
  });

  it('does not leak identity-like source columns through a requested column token', () => {
    const prompt = buildPrompt([
      { pseudonym: 'xncngdl3', name: 'John Johnson', food: 'icecream' },
    ], 'Return {{food}} only. {{pseudonymized values}}', 'tsv', 'session-123');
    expect(prompt).not.toContain('John Johnson');
    expect(prompt).toContain('food: icecream');
  });

  it('sanitizes tabs and newlines inside pseudonymized cells', () => {
    const tsv = pseudonymizedTsv([{ pseudonym: 'abc', note: 'hello\tworld\nsecret' }]);
    expect(tsv).toBe('pseudonym\tnote\nabc\thello world secret');
    expect(tsv.split('\n')).toHaveLength(2);
  });

  it('keeps session id but does not derive it from identity data', () => {
    const prompt = buildPrompt(rows, '{{pseudonymized values}}', 'tsv', 'session-123');
    expect(prompt).toContain('SESSION ID: session-123');
    expect(prompt).not.toContain('John Johnson');
  });
});
