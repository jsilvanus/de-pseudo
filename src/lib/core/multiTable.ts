import { findInitialMatches } from './references';
import { createPseudonymGenerator, type RandomBytes } from './random';
import type {
  CellValue,
  DatasetSchema,
  IdentityMapping,
  InputRecord,
  NamedPseudonymizedTable,
  PseudonymizedRecord,
  TableCellReference,
} from './types';

export type TableConfig = { name: string; records: InputRecord[]; identityColumn: string };

/**
 * Pseudonymize the identity column of each table, sharing one pseudonym pool
 * and one identity mapping across all of them. Sharing the pool means a value
 * referenced from a different table (e.g. a "room" column in a preferences
 * table pointing at a rooms table's room number) resolves to the exact same
 * token the owning table already generated for it, rather than a second,
 * unrelated one.
 */
export function pseudonymizeTables(
  tables: TableConfig[],
  randomBytes?: RandomBytes,
): { tables: { name: string; rows: PseudonymizedRecord[] }[]; mapping: IdentityMapping } {
  const generate = createPseudonymGenerator(randomBytes);
  const used = new Set<string>();
  const mapping: IdentityMapping = {};

  const outTables = tables.map(({ name, records, identityColumn }) => {
    const rows = records.map((record) => {
      let pseudonym = generate();
      while (used.has(pseudonym)) pseudonym = generate();
      used.add(pseudonym);

      const identity = { ...record };
      const pseudonymized = { ...record, pseudonym } as PseudonymizedRecord;
      delete pseudonymized[identityColumn];
      mapping[pseudonym] = identity;
      return pseudonymized;
    });
    return { name, rows };
  });

  return { tables: outTables, mapping };
}

export type ReferenceOverridesMulti = {
  /** Key: `${tableName}.${columnName}:${rawReferenceText}` -> a raw identity value in the target table. */
  aliases?: Record<string, string>;
  cellReferences?: TableCellReference[];
  notes?: string[];
};

export type SchemaTableInput = {
  name: string;
  records: InputRecord[];
  pseudonyms: string[];
  schema: DatasetSchema;
  identityColumn: string;
};

type ResolveContext = {
  lookup: Map<string, string>;
  tableName: string;
  targetTableName: string;
  columnName: string;
  rowIndex: number;
  overrides: ReferenceOverridesMulti;
  pseudonymsByTable: Map<string, string[]>;
  unresolved: Set<string>;
};

function resolveStringValue(value: string, ctx: ResolveContext): string {
  const { lookup, tableName, targetTableName, columnName, rowIndex, overrides, pseudonymsByTable, unresolved } = ctx;
  if (!value.trim()) return value;

  // A drawn cell-to-cell reference is the most specific signal and always wins.
  const cellOverride = overrides.cellReferences?.find(
    (ref) => (ref.sourceTable ?? tableName) === tableName && ref.sourceRow === rowIndex && ref.sourceColumn === columnName,
  );
  if (cellOverride) {
    const targetPseudonyms = pseudonymsByTable.get(cellOverride.targetTable ?? targetTableName);
    const pseudonym = targetPseudonyms?.[cellOverride.targetRow];
    if (pseudonym) return pseudonym;
  }

  const exact = lookup.get(value);
  if (exact) return exact;

  const alias = overrides.aliases?.[`${tableName}.${columnName}:${value}`];
  const aliasResolved = alias ? lookup.get(alias) : undefined;
  if (aliasResolved) return aliasResolved;

  // A first-name-plus-last-initial-style partial match is a weaker, inferred
  // signal: only act on it when unique, and always leave a note to verify.
  const initialMatches = findInitialMatches([...lookup.keys()], value);
  if (initialMatches.length === 1) {
    const inferred = lookup.get(initialMatches[0]);
    if (inferred) {
      const targetLabel = targetTableName === tableName ? '' : ` in "${targetTableName}"`;
      overrides.notes?.push(
        `${tableName}.${columnName}: "${value}" — partial match resolved to "${initialMatches[0]}"${targetLabel}. Verify this is correct.`,
      );
      return inferred;
    }
  }

  unresolved.add(`${tableName}.${columnName}: "${value}"`);
  return value;
}

function resolveCell(value: CellValue, ctx: ResolveContext): CellValue {
  if (typeof value === 'string') return resolveStringValue(value, ctx);
  if (Array.isArray(value)) return value.map((v) => resolveCell(v, ctx));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveCell(v, ctx)]));
  }
  return value;
}

/**
 * The multi-table counterpart to applySchema: applies each table's own
 * schema, resolving `reference` columns against any table's identity column
 * (their own, by default, or another named table via `referenceTable`).
 * Blocks — throwing, listing every offending value — rather than letting an
 * unresolved or ambiguous reference fall through as raw text, exactly like
 * the single-table path.
 */
export function applySchemas(tables: SchemaTableInput[], overrides: ReferenceOverridesMulti = {}): NamedPseudonymizedTable[] {
  const pseudonymsByTable = new Map(tables.map((t) => [t.name, t.pseudonyms]));

  const lookupByTable = new Map<string, Map<string, string>>();
  for (const t of tables) {
    const lookup = new Map<string, string>();
    t.records.forEach((record, i) => {
      const value = record[t.identityColumn];
      if (value !== null && value !== undefined) lookup.set(String(value), t.pseudonyms[i]);
    });
    lookupByTable.set(t.name, lookup);
  }

  const unresolved = new Set<string>();
  const results = tables.map((t): NamedPseudonymizedTable => {
    const rows = t.records.map((record, i) => {
      const out: PseudonymizedRecord = { pseudonym: t.pseudonyms[i] };
      for (const column of t.schema.columns) {
        const value = record[column.name];
        if (column.name === t.identityColumn || column.mode === 'pseudonymize' || column.mode === 'remove') continue;
        if (column.mode !== 'reference') {
          out[column.name] = value;
          continue;
        }
        const targetTableName = column.referenceTable ?? t.name;
        const lookup = lookupByTable.get(targetTableName);
        if (!lookup) {
          throw new Error(`Reference column "${column.name}" in table "${t.name}" targets unknown table "${targetTableName}".`);
        }
        out[column.name] = resolveCell(value, {
          lookup,
          tableName: t.name,
          targetTableName,
          columnName: column.name,
          rowIndex: i,
          overrides,
          pseudonymsByTable,
          unresolved,
        });
      }
      return out;
    });
    return { name: t.name, rows, schema: t.schema };
  });

  if (unresolved.size) {
    throw new Error(
      `Unresolved references: ${[...unresolved].join(', ')}. Resolve them in "Resolve text references" before generating a prompt.`,
    );
  }

  return results;
}
