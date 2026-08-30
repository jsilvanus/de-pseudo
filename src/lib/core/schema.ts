import type { CellValue, DatasetSchema, InputRecord, PseudonymizedRecord } from './types';

export function defaultSchema(records: InputRecord[], identityColumn = 'username'): DatasetSchema {
  const names = [...new Set(records.flatMap(r => Object.keys(r)))];
  return {
    columns: names.map(name => ({
      name,
      mode: name === identityColumn ? 'pseudonymize' : 'keep',
      output: name === identityColumn,
    })),
    output: [{ name: identityColumn, source: 'pseudonym' }],
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
  const identityIndex = new Map(records.map((r, i) => [String(r[identityColumn]), pseudonyms[i]]));
  return records.map((record, i) => {
    const out: PseudonymizedRecord = { pseudonym: pseudonyms[i] };
    for (const column of schema.columns) {
      const value = record[column.name];
      if (column.name === identityColumn || column.mode === 'pseudonymize') continue;
      if (column.mode === 'remove') continue;
      out[column.name] = column.mode === 'reference'
        ? pseudonymizeReference(value, identityIndex)
        : value;
    }
    return out;
  });
}

export function projectOutput(
  rows: Record<string, CellValue>[],
  output: DatasetSchema['output'],
): Record<string, CellValue>[] {
  return rows.map(row => Object.fromEntries(
    output.map(field => [field.name, row[field.source ?? field.name] ?? null]),
  ));
}
