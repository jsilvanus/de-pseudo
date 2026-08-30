import type { CellValue, DatasetSchema, InputRecord, PseudonymizedRecord } from './types';

export function defaultSchema(records: InputRecord[], identityColumn = 'username'): DatasetSchema {
  const names = [...new Set(records.flatMap(r => Object.keys(r)))];
  return {
    columns: names.map(name => ({
      name,
      mode: name === identityColumn ? 'pseudonymize' : 'keep',
      referenceTarget: undefined,
      output: name === identityColumn,
    })),
    // Include a slot for the AI's answer by default so the final resolved
    // output actually shows what the AI decided, not just the resolved
    // identity on its own.
    output: [
      { name: identityColumn, source: 'pseudonym' },
      { name: 'result', source: 'choice' },
    ],
  };
}

function pseudonymizeReference(value: CellValue, lookup: Map<string, string>): CellValue {
  if (typeof value === 'string') return lookup.get(value) ?? value;
  if (Array.isArray(value)) return value.map(v => pseudonymizeReference(v, lookup));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pseudonymizeReference(v, lookup)]));
  }
  return value;
}

export function applySchema(
  records: InputRecord[],
  pseudonyms: string[],
  schema: DatasetSchema,
  identityColumn = 'username',
): PseudonymizedRecord[] {
  const targetIndexes = new Map(schema.columns.map(column => [column.name, column]));
  const lookupByTarget = new Map<string, Map<string, string>>();

  for (const column of schema.columns) {
    if (column.mode !== 'reference' || !column.referenceTarget) continue;
    const target = targetIndexes.get(column.referenceTarget);
    if (!target || target.mode !== 'pseudonymize') {
      throw new Error(`Reference column "${column.name}" targets "${column.referenceTarget}", which is not a pseudonymized column.`);
    }
    const targetLookup = new Map<string, string>();
    records.forEach((record, i) => {
      const value = record[column.referenceTarget!];
      if (value !== null && value !== undefined) targetLookup.set(String(value), pseudonyms[i]);
    });
    lookupByTarget.set(column.referenceTarget, targetLookup);
  }

  return records.map((record, i) => {
    const out: PseudonymizedRecord = { pseudonym: pseudonyms[i] };
    for (const column of schema.columns) {
      const value = record[column.name];
      if (column.name === identityColumn || column.mode === 'pseudonymize' || column.mode === 'remove') continue;
      if (column.mode === 'reference') {
        const lookup = lookupByTarget.get(column.referenceTarget ?? '');
        if (!lookup) throw new Error(`Reference column "${column.name}" has no valid reference target.`);
        out[column.name] = pseudonymizeReference(value, lookup);
      } else out[column.name] = value;
    }
    return out;
  });
}

export function projectOutput(rows: Record<string, CellValue>[], output: DatasetSchema['output']): Record<string, CellValue>[] {
  return rows.map(row => Object.fromEntries(output.map(field => [field.name, row[field.source ?? field.name] ?? null])));
}
