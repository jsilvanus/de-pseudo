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
    expect(schema.output).toEqual([{ name: 'username', source: 'pseudonym' }]);
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
