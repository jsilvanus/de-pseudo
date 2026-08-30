import { describe, expect, it } from 'vitest';
import { applySchema, defaultSchema, projectOutput } from './schema';

describe('dataset schema', () => {
  const records = [
    { username: 'Alice', food: 'ice cream', age: 42, friend: 'Bob' },
    { username: 'Bob', food: 'pizza', age: 51, friend: 'Alice' },
  ];

  it('defaults identity to pseudonymize and identity output', () => {
    const schema = defaultSchema(records);
    expect(schema.columns.find(c => c.name === 'username')?.mode).toBe('pseudonymize');
    expect(schema.output).toEqual([{ name: 'username', source: 'pseudonym' }]);
  });

  it('pseudonymizes references without exposing identities', () => {
    const schema = defaultSchema(records);
    schema.columns.find(c => c.name === 'friend')!.mode = 'reference';
    const rows = applySchema(records, ['aaa', 'bbb'], schema);
    expect(rows).toEqual([
      { pseudonym: 'aaa', food: 'ice cream', age: 42, friend: 'bbb' },
      { pseudonym: 'bbb', food: 'pizza', age: 51, friend: 'aaa' },
    ]);
    expect(JSON.stringify(rows)).not.toContain('Alice');
    expect(JSON.stringify(rows)).not.toContain('Bob');
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
