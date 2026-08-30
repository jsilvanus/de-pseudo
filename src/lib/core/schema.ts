import { findInitialMatches } from './references';
import type { CellReference, CellValue, DatasetSchema, InputRecord, PseudonymizedRecord } from './types';

/**
 * Manual disambiguation for reference-column free text that doesn't exactly
 * match a target identity value (e.g. "Anna" when both "Anna Johnson" and
 * "Anna Benson" exist). `cellReferences` pin a specific cell to a specific
 * row and take precedence; `aliases` resolve every occurrence of a given
 * free-text value in a column to a chosen target identity value, keyed by
 * `${columnName}:${rawReferenceText}`. `notes`, if provided, is pushed to
 * whenever a value is resolved by inference rather than an exact match or an
 * explicit choice, so the caller can surface it for the user to verify.
 */
export type ReferenceOverrides = {
  aliases?: Record<string, string>;
  cellReferences?: CellReference[];
  notes?: string[];
};

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

function resolveReferenceValue(
  value: string,
  lookup: Map<string, string>,
  columnName: string,
  rowIndex: number,
  overrides: ReferenceOverrides,
  pseudonymByRow: string[],
  unresolved: Set<string>,
): string {
  if (!value.trim()) return value;

  // A drawn cell-to-cell reference is the most specific signal available and
  // always wins, regardless of what the cell's text says.
  const cellOverride = overrides.cellReferences?.find(
    (ref) => ref.sourceRow === rowIndex && ref.sourceColumn === columnName,
  );
  if (cellOverride) {
    const pseudonym = pseudonymByRow[cellOverride.targetRow];
    if (pseudonym) return pseudonym;
  }

  const exact = lookup.get(value);
  if (exact) return exact;

  // Otherwise fall back to a manually chosen alias for this exact free-text
  // value in this column (e.g. "Anna" -> "Anna Benson").
  const alias = overrides.aliases?.[`${columnName}:${value}`];
  const aliasResolved = alias ? lookup.get(alias) : undefined;
  if (aliasResolved) return aliasResolved;

  // A first-name-plus-last-initial match (e.g. "Anna J." for "Anna Johnson")
  // is a weaker, inferred signal, so only act on it when it is unique, and
  // always record a note — this must stay visibly different from a
  // confirmed exact match or explicit choice, not silently identical to one.
  const initialMatches = findInitialMatches([...lookup.keys()], value);
  if (initialMatches.length === 1) {
    const inferred = lookup.get(initialMatches[0]);
    if (inferred) {
      overrides.notes?.push(`${columnName}: "${value}" was matched to "${initialMatches[0]}" by first name and last initial — verify this is correct.`);
      return inferred;
    }
  }

  unresolved.add(`${columnName}: "${value}"`);
  return value;
}

function pseudonymizeReference(
  value: CellValue,
  lookup: Map<string, string>,
  columnName: string,
  rowIndex: number,
  overrides: ReferenceOverrides,
  pseudonymByRow: string[],
  unresolved: Set<string>,
): CellValue {
  if (typeof value === 'string') {
    return resolveReferenceValue(value, lookup, columnName, rowIndex, overrides, pseudonymByRow, unresolved);
  }
  if (Array.isArray(value)) {
    return value.map((v) => pseudonymizeReference(v, lookup, columnName, rowIndex, overrides, pseudonymByRow, unresolved));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, pseudonymizeReference(v, lookup, columnName, rowIndex, overrides, pseudonymByRow, unresolved)]),
    );
  }
  return value;
}

export function applySchema(
  records: InputRecord[],
  pseudonyms: string[],
  schema: DatasetSchema,
  identityColumn = 'username',
  overrides: ReferenceOverrides = {},
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

  const unresolved = new Set<string>();
  const rows = records.map((record, i) => {
    const out: PseudonymizedRecord = { pseudonym: pseudonyms[i] };
    for (const column of schema.columns) {
      const value = record[column.name];
      if (column.name === identityColumn || column.mode === 'pseudonymize' || column.mode === 'remove') continue;
      if (column.mode === 'reference') {
        const lookup = lookupByTarget.get(column.referenceTarget ?? '');
        if (!lookup) throw new Error(`Reference column "${column.name}" has no valid reference target.`);
        out[column.name] = pseudonymizeReference(value, lookup, column.name, i, overrides, pseudonyms, unresolved);
      } else out[column.name] = value;
    }
    return out;
  });

  // A reference that can't be tied to a person must never fall through to the
  // AI as raw text: that would be exactly the identity leak this schema
  // exists to prevent. Block the whole dataset until it's resolved instead of
  // silently ignoring the ambiguity.
  if (unresolved.size) {
    throw new Error(
      `Unresolved references: ${[...unresolved].join(', ')}. Resolve them in "Resolve text references" before generating a prompt.`,
    );
  }

  return rows;
}

export function projectOutput(rows: Record<string, CellValue>[], output: DatasetSchema['output']): Record<string, CellValue>[] {
  return rows.map(row => Object.fromEntries(output.map(field => [field.name, row[field.source ?? field.name] ?? null])));
}
