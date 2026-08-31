import { describe, expect, it } from 'vitest';
import { applySchemas, pseudonymizeTables, type SchemaTableInput, type TableConfig } from './multiTable';
import { defaultSchema } from './schema';
import type { DatasetSchema } from './types';

describe('pseudonymizeTables', () => {
  const tables: TableConfig[] = [
    { name: 'Rooms', records: [{ room: 'Room A', size: 4 }, { room: 'Room B', size: 2 }], identityColumn: 'room' },
    { name: 'Preferences', records: [{ name: 'Alice', room: 'Room A' }, { name: 'Bob', room: 'Room B' }], identityColumn: 'name' },
  ];

  it('strips the identity column and assigns a pseudonym per row, per table', () => {
    const { tables: out } = pseudonymizeTables(tables);
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe('Rooms');
    expect(out[0].rows[0]).not.toHaveProperty('room');
    expect(out[0].rows[0].pseudonym).toMatch(/^[0-9a-f]{12}$/);
    expect(out[1].rows[0]).not.toHaveProperty('name');
  });

  it('shares one pseudonym pool so tokens never collide across tables', () => {
    const { tables: out } = pseudonymizeTables(tables);
    const allPseudonyms = out.flatMap(t => t.rows.map(r => r.pseudonym));
    expect(new Set(allPseudonyms).size).toBe(allPseudonyms.length);
  });

  it('builds one identity mapping merged across all tables', () => {
    const { tables: out, mapping } = pseudonymizeTables(tables);
    const roomPseudonym = out[0].rows[0].pseudonym;
    const personPseudonym = out[1].rows[0].pseudonym;
    expect(mapping[roomPseudonym]).toEqual({ room: 'Room A', size: 4 });
    expect(mapping[personPseudonym]).toEqual({ name: 'Alice', room: 'Room A' });
  });
});

describe('applySchemas', () => {
  const roomRecords = [{ room: 'Room A', size: 4 }, { room: 'Room B', size: 2 }];
  const prefRecords = [{ name: 'Alice', room: 'Room A', wants: 'quiet' }, { name: 'Bob', room: 'Room B', wants: 'social' }];

  function build(): SchemaTableInput[] {
    const { tables } = pseudonymizeTables([
      { name: 'Rooms', records: roomRecords, identityColumn: 'room' },
      { name: 'Preferences', records: prefRecords, identityColumn: 'name' },
    ]);
    const roomSchema = defaultSchema(roomRecords, 'room');
    const prefSchema: DatasetSchema = {
      columns: [
        { name: 'name', mode: 'pseudonymize' },
        { name: 'room', mode: 'reference', referenceTarget: 'room', referenceTable: 'Rooms' },
        { name: 'wants', mode: 'keep' },
      ],
      output: [{ name: 'name', source: 'pseudonym' }, { name: 'result', source: 'choice' }],
    };
    return [
      { name: 'Rooms', records: roomRecords, pseudonyms: tables[0].rows.map(r => r.pseudonym), schema: roomSchema, identityColumn: 'room' },
      { name: 'Preferences', records: prefRecords, pseudonyms: tables[1].rows.map(r => r.pseudonym), schema: prefSchema, identityColumn: 'name' },
    ];
  }

  it('resolves a reference in one table to the exact pseudonym another table generated for the same identity', () => {
    const inputs = build();
    const [rooms, prefs] = applySchemas(inputs);
    const roomAPseudonym = rooms.rows.find(r => r.size === 4)!.pseudonym;
    const aliceRow = prefs.rows.find(r => r.wants === 'quiet')!;
    expect(aliceRow.room).toBe(roomAPseudonym);
    expect(JSON.stringify(prefs.rows)).not.toContain('Room A');
    expect(JSON.stringify(prefs.rows)).not.toContain('Alice');
  });

  it('resolves a same-table self-reference so reciprocal pairs share the exact same token', () => {
    // Six people in three reciprocal pairs, each naming who they want to
    // room with — a same-table reference, not a cross-table one.
    const peopleRecords = [
      { name: 'Alice', wants_to_room_with: 'Bob' },
      { name: 'Bob', wants_to_room_with: 'Alice' },
      { name: 'Carol', wants_to_room_with: 'Dave' },
      { name: 'Dave', wants_to_room_with: 'Carol' },
      { name: 'Eve', wants_to_room_with: 'Frank' },
      { name: 'Frank', wants_to_room_with: 'Eve' },
    ];
    const { tables } = pseudonymizeTables([{ name: 'People', records: peopleRecords, identityColumn: 'name' }]);
    const schema: DatasetSchema = {
      columns: [
        { name: 'name', mode: 'pseudonymize' },
        { name: 'wants_to_room_with', mode: 'reference', referenceTarget: 'name' },
      ],
      output: [],
    };
    const [people] = applySchemas([{
      name: 'People', records: peopleRecords, pseudonyms: tables[0].rows.map(r => r.pseudonym), schema, identityColumn: 'name',
    }]);
    const byPseudonym = new Map(people.rows.map(r => [r.pseudonym, r.wants_to_room_with]));
    for (const [pseudonym, partner] of byPseudonym) {
      expect(byPseudonym.get(partner as string)).toBe(pseudonym);
    }
    expect(JSON.stringify(people.rows)).not.toMatch(/Alice|Bob|Carol|Dave|Eve|Frank/);
  });

  it('blocks a cross-table reference that matches no exact value, instead of leaking it', () => {
    const inputs = build();
    inputs[1].records = [{ name: 'Alice', room: 'room a (corner)', wants: 'quiet' }];
    inputs[1].pseudonyms = inputs[1].pseudonyms.slice(0, 1);
    expect(() => applySchemas(inputs)).toThrow(/Unresolved references:.*Preferences\.room.*"room a \(corner\)"/s);
  });

  it('resolves an unmatched cross-table reference via an alias override, namespaced by table', () => {
    const inputs = build();
    inputs[1].records = [{ name: 'Alice', room: 'the corner room', wants: 'quiet' }];
    inputs[1].pseudonyms = inputs[1].pseudonyms.slice(0, 1);
    const [rooms, prefs] = applySchemas(inputs, { aliases: { 'Preferences.room:the corner room': 'Room A' } });
    const roomAPseudonym = rooms.rows.find(r => r.size === 4)!.pseudonym;
    expect(prefs.rows[0].room).toBe(roomAPseudonym);
  });

  it('resolves an ambiguous cross-table reference via a row-specific cell reference', () => {
    const inputs = build();
    inputs[1].records = [{ name: 'Alice', room: 'a room', wants: 'quiet' }];
    inputs[1].pseudonyms = inputs[1].pseudonyms.slice(0, 1);
    const [rooms, prefs] = applySchemas(inputs, {
      cellReferences: [{ sourceTable: 'Preferences', sourceRow: 0, sourceColumn: 'room', targetTable: 'Rooms', targetRow: 1, targetColumn: 'room' }],
    });
    const roomBPseudonym = rooms.rows.find(r => r.size === 2)!.pseudonym;
    expect(prefs.rows[0].room).toBe(roomBPseudonym);
  });

  it('rejects a reference column that targets a table that was not provided', () => {
    const inputs = build();
    inputs[1].schema.columns.find(c => c.name === 'room')!.referenceTable = 'Nonexistent';
    expect(() => applySchemas(inputs)).toThrow(/targets unknown table "Nonexistent"/);
  });
});
