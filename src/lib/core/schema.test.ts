import { describe, expect, it } from 'vitest';
import { applySchema, defaultSchema, projectOutput } from './schema';

describe('dataset schema', () => {
  const records = [
    { username: 'Alice', employeeId: 'A1', food: 'ice cream', age: 42, friend: 'Bob' },
    { username: 'Bob', employeeId: 'B1', food: 'pizza', age: 51, friend: 'Alice' },
  ];

  it('defaults identity to pseudonymize and identity output', () => {
    const schema = defaultSchema(records);
    expect(schema.columns.find(c => c.name === 'username')?.mode).toBe('pseudonymize');
    expect(schema.output).toEqual([
      { name: 'username', source: 'pseudonym' },
      { name: 'result', source: 'choice' },
    ]);
  });

  it('uses the explicitly selected reference target', () => {
    const targetRecords = records.map((r, i) => ({ ...r, friend: i === 0 ? 'B1' : 'A1' }));
    const schema = defaultSchema(targetRecords);
    schema.columns.find(c => c.name === 'employeeId')!.mode = 'pseudonymize';
    schema.columns.find(c => c.name === 'friend')!.mode = 'reference';
    schema.columns.find(c => c.name === 'friend')!.referenceTarget = 'employeeId';
    const rows = applySchema(targetRecords, ['aaa', 'bbb'], schema);
    expect(rows[0].friend).toBe('bbb');
    expect(rows[1].friend).toBe('aaa');
    expect(rows[0].employeeId).toBeUndefined();
    expect(rows[0].pseudonym).toBe('aaa');
  });

  it('pseudonymizes references to the selected identity field', () => {
    const schema = defaultSchema(records);
    schema.columns.find(c => c.name === 'friend')!.mode = 'reference';
    schema.columns.find(c => c.name === 'friend')!.referenceTarget = 'username';
    const rows = applySchema(records, ['aaa', 'bbb'], schema);
    expect(rows[0].friend).toBe('bbb');
    expect(rows[1].friend).toBe('aaa');
    expect(JSON.stringify(rows)).not.toContain('Alice');
    expect(JSON.stringify(rows)).not.toContain('Bob');
  });

  it('rejects a reference target that is not pseudonymized', () => {
    const schema = defaultSchema(records);
    schema.columns.find(c => c.name === 'friend')!.mode = 'reference';
    schema.columns.find(c => c.name === 'friend')!.referenceTarget = 'employeeId';
    expect(() => applySchema(records, ['aaa', 'bbb'], schema)).toThrow(/not a pseudonymized column/);
  });

  it('blocks reference text that is ambiguous or does not exactly match a person, instead of leaking it', () => {
    // "Anna Q." doesn't match either surname's initial, and "Anna" alone
    // matches two people (Anna Johnson and Anna Benson) — neither should
    // silently pass through as raw text.
    const people = [
      { username: 'Anna Johnson', friend: 'Anna Q.' },
      { username: 'John Johnson', friend: 'Anna' },
      { username: 'Anna Benson', friend: '' },
    ];
    const schema = defaultSchema(people);
    schema.columns.find(c => c.name === 'friend')!.mode = 'reference';
    schema.columns.find(c => c.name === 'friend')!.referenceTarget = 'username';
    expect(() => applySchema(people, ['aaa', 'bbb', 'ccc'], schema)).toThrow(
      /Unresolved references:.*"Anna Q\.".*"Anna"/s,
    );
  });

  it('resolves unmatched reference text via a manually chosen alias', () => {
    const people = [
      { username: 'Anna Johnson', friend: 'the redhead' },
      { username: 'John Johnson', friend: '' },
      { username: 'Anna Benson', friend: '' },
    ];
    const schema = defaultSchema(people);
    schema.columns.find(c => c.name === 'friend')!.mode = 'reference';
    schema.columns.find(c => c.name === 'friend')!.referenceTarget = 'username';
    const rows = applySchema(people, ['aaa', 'bbb', 'ccc'], schema, 'username', {
      aliases: { 'friend:the redhead': 'Anna Benson' },
    });
    expect(rows[0].friend).toBe('ccc');
    expect(JSON.stringify(rows)).not.toContain('redhead');
  });

  it('auto-resolves a unique first-name-plus-last-initial reference, with a note', () => {
    const people = [
      { username: 'Anna Johnson', friend: 'Anna J.' },
      { username: 'John Johnson', friend: '' },
      { username: 'Anna Benson', friend: '' },
    ];
    const schema = defaultSchema(people);
    schema.columns.find(c => c.name === 'friend')!.mode = 'reference';
    schema.columns.find(c => c.name === 'friend')!.referenceTarget = 'username';
    const notes: string[] = [];
    const rows = applySchema(people, ['aaa', 'bbb', 'ccc'], schema, 'username', { notes });
    // "Anna J." resolves to Anna Johnson herself here (row 0), i.e. its own
    // pseudonym — the point of this case is just that it resolves at all,
    // without throwing and without a manual override.
    expect(rows[0].friend).toBe('aaa');
    expect(notes).toEqual(['friend: "Anna J." — partial match resolved to "Anna Johnson". Verify this is correct.']);
  });

  it('does not guess when an initial matches more than one person', () => {
    const people = [
      { username: 'Anna Johnson', friend: '' },
      { username: 'Anna Jones', friend: 'Anna J.' },
      { username: 'Bob Smith', friend: '' },
    ];
    const schema = defaultSchema(people);
    schema.columns.find(c => c.name === 'friend')!.mode = 'reference';
    schema.columns.find(c => c.name === 'friend')!.referenceTarget = 'username';
    const notes: string[] = [];
    expect(() => applySchema(people, ['aaa', 'bbb', 'ccc'], schema, 'username', { notes })).toThrow(
      /Unresolved references:.*"Anna J\."/,
    );
    expect(notes).toEqual([]);
  });

  it('lets an explicit alias override an inferred initial match', () => {
    const people = [
      { username: 'Anna Johnson', friend: 'Anna J.' },
      { username: 'John Johnson', friend: '' },
      { username: 'Anna Benson', friend: '' },
    ];
    const schema = defaultSchema(people);
    schema.columns.find(c => c.name === 'friend')!.mode = 'reference';
    schema.columns.find(c => c.name === 'friend')!.referenceTarget = 'username';
    const notes: string[] = [];
    // "Anna J." would infer Anna Johnson, but the user explicitly chose
    // someone else — their choice must win, and no inference note is logged.
    const rows = applySchema(people, ['aaa', 'bbb', 'ccc'], schema, 'username', {
      aliases: { 'friend:Anna J.': 'Anna Benson' },
      notes,
    });
    expect(rows[0].friend).toBe('ccc');
    expect(notes).toEqual([]);
  });

  it('resolves an ambiguous reference via a row-specific cell reference, which takes precedence', () => {
    const people = [
      { username: 'Anna Johnson', friend: '' },
      { username: 'John Johnson', friend: 'Anna' },
      { username: 'Anna Benson', friend: '' },
    ];
    const schema = defaultSchema(people);
    schema.columns.find(c => c.name === 'friend')!.mode = 'reference';
    schema.columns.find(c => c.name === 'friend')!.referenceTarget = 'username';
    const rows = applySchema(people, ['aaa', 'bbb', 'ccc'], schema, 'username', {
      cellReferences: [{ sourceRow: 1, sourceColumn: 'friend', targetRow: 2, targetColumn: 'username' }],
      // A conflicting alias is present too; the cell reference should win.
      aliases: { 'friend:Anna': 'Anna Johnson' },
    });
    expect(rows[1].friend).toBe('ccc');
  });

  it('removes selected input columns', () => {
    const schema = defaultSchema(records);
    schema.columns.find(c => c.name === 'age')!.mode = 'remove';
    const rows = applySchema(records, ['aaa', 'bbb'], schema);
    expect(rows[0]).not.toHaveProperty('age');
  });

  it('projects only selected output fields', () => {
    expect(projectOutput(
      [{ pseudonym: 'aaa', choice: 'pizza', age: 42 }],
      [{ name: 'person', source: 'pseudonym' }, { name: 'food', source: 'choice' }],
    )).toEqual([{ person: 'aaa', food: 'pizza' }]);
  });
});
