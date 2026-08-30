import { describe, expect, it } from 'vitest';
import { pseudonymize, applySchema, defaultSchema, buildPrompt, parseSessionResponse, validateResults, projectOutput } from '../../lib/core';
import { resolveResult } from '../result/resolveResult';

describe('de-pseudo end-to-end workflow', () => {
  it('round-trips pseudonymized TSV AI output back to the original identities', () => {
    const source = [
      { username: 'John Johnson', preference: 'icecream' },
      { username: 'Mary Smith', preference: 'pizza' },
    ];
    const base = pseudonymize(source);
    const schema = defaultSchema(source);
    schema.output = [
      { name: 'pseudonym', source: 'pseudonym' },
      { name: 'selected_food', source: 'ai' },
    ];
    const rows = applySchema(source, base.rows.map(r => r.pseudonym), schema);
    const sessionId = 'e2e-session';
    const prompt = buildPrompt(rows, 'Choose a food. {{pseudonymized values}}', 'tsv', sessionId, schema);

    expect(prompt).toContain('x');
    expect(prompt).not.toContain('John Johnson');
    expect(prompt).not.toContain('Mary Smith');

    const pseudonyms = base.rows.map(r => r.pseudonym);
    const response = `SESSION ID:\t${sessionId}\npseudonym\tselected_food\n${pseudonyms[0]}\tvanilla ice cream\n${pseudonyms[1]}\tpepperoni pizza`;
    const parsed = parseSessionResponse(response, 'tsv', sessionId);
    const validation = validateResults(parsed, pseudonyms);
    expect(validation.unknown).toEqual([]);
    expect(validation.duplicatePseudonyms).toEqual([]);
    expect(validation.missingPseudonyms).toEqual([]);

    const projected = projectOutput(parsed, schema.output);
    const resolved = JSON.parse(resolveResult(JSON.stringify(projected), base.mapping));
    expect(resolved).toEqual([
      { username: 'John Johnson', selected_food: 'vanilla ice cream' },
      { username: 'Mary Smith', selected_food: 'pepperoni pizza' },
    ]);
  });

  it('rejects a result containing a pseudonym from another session', () => {
    const response = 'SESSION ID:\tcorrect\npseudonym\tselected_food\nnot-from-session\tpizza';
    const parsed = parseSessionResponse(response, 'tsv', 'correct');
    const validation = validateResults(parsed, ['xncngdl3']);
    expect(validation.unknown).toContain('not-from-session');
  });
});
