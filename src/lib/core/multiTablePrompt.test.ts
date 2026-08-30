import { describe, expect, it } from 'vitest';
import { buildMultiTablePrompt } from './prompt';
import type { DatasetSchema } from './types';

const roomSchema: DatasetSchema = {
  columns: [{ name: 'room', mode: 'pseudonymize' }, { name: 'size', mode: 'keep' }],
  output: [],
};
const prefSchema: DatasetSchema = {
  columns: [
    { name: 'name', mode: 'pseudonymize' },
    { name: 'room', mode: 'reference', referenceTarget: 'room', referenceTable: 'Rooms' },
    { name: 'wants', mode: 'keep' },
  ],
  output: [{ name: 'name', source: 'pseudonym' }, { name: 'result', source: 'choice' }],
};

describe('buildMultiTablePrompt', () => {
  const sessionId = '0123456789abcdef0123456789abcdef';

  it('renders one labeled block per table, keeping real values out of both', () => {
    const prompt = buildMultiTablePrompt(
      [
        { name: 'Rooms', rows: [{ pseudonym: 'aaa111222333', size: 4 }], schema: roomSchema },
        { name: 'Preferences', rows: [{ pseudonym: 'bbb111222333', room: 'aaa111222333', wants: 'quiet' }], schema: prefSchema },
      ],
      'Assign each person to their preferred room.',
      'tsv',
      sessionId,
    );
    expect(prompt).toContain('--- ROOMS ---');
    expect(prompt).toContain('--- END ROOMS ---');
    expect(prompt).toContain('--- PREFERENCES ---');
    expect(prompt).toContain('aaa111222333');
    expect(prompt).toContain('bbb111222333');
    expect(prompt).toContain(`SESSION ID: ${sessionId}`);
  });

  it('only pulls output fields from tables that actually configured them', () => {
    const prompt = buildMultiTablePrompt(
      [
        { name: 'Rooms', rows: [{ pseudonym: 'aaa111222333', size: 4 }], schema: roomSchema },
        { name: 'Preferences', rows: [{ pseudonym: 'bbb111222333', room: 'aaa111222333', wants: 'quiet' }], schema: prefSchema },
      ],
      'Assign each person to their preferred room.',
      'tsv',
      sessionId,
    );
    // Rooms has no output fields configured, so the reply contract is driven
    // by Preferences alone, not a mix of unrelated field names.
    expect(prompt).toContain('Then return a tab-separated table with these columns: name, result.');
  });

  it('falls back to pseudonym/choice when no table has output fields configured', () => {
    const bareSchema: DatasetSchema = { columns: [{ name: 'x', mode: 'keep' }], output: [] };
    const prompt = buildMultiTablePrompt(
      [{ name: 'Only', rows: [{ pseudonym: 'aaa111222333', x: 'y' }], schema: bareSchema }],
      'Do something.',
      'tsv',
      sessionId,
    );
    expect(prompt).toContain('columns: pseudonym, choice.');
  });
});
