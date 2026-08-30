export type CellValue = string | number | boolean | null | CellValue[] | { [key: string]: CellValue };
export type InputRecord = Record<string, CellValue>;

export type ColumnMode = 'keep' | 'pseudonymize' | 'reference' | 'remove';
export type OutputField = { name: string; source?: string };
export type ColumnDefinition = {
  name: string;
  mode: ColumnMode;
  referenceTarget?: string;
  /** Table the reference points at, when different from this column's own table. Omitted means "this same table" — the single-table default. */
  referenceTable?: string;
  multiple?: boolean;
  output?: boolean;
};
export type DatasetSchema = { columns: ColumnDefinition[]; output: OutputField[] };

export type PseudonymizedRecord = Record<string, CellValue> & { pseudonym: string };
export type IdentityMapping = Record<string, InputRecord>;
export type CellReference = { sourceRow: number; sourceColumn: string; targetRow: number; targetColumn: string };
/** A cell reference that may cross tables. sourceTable/targetTable default to "the table this reference lives in" when omitted, matching plain CellReference behavior. */
export type TableCellReference = CellReference & { sourceTable?: string; targetTable?: string };
export type PseudonymizedDataset = { rows: PseudonymizedRecord[]; mapping: IdentityMapping; schema?: DatasetSchema; cellReferences?: CellReference[] };

export type NamedPseudonymizedTable = { name: string; rows: PseudonymizedRecord[]; schema: DatasetSchema };
export type MultiTableDataset = { tables: NamedPseudonymizedTable[]; mapping: IdentityMapping; cellReferences?: TableCellReference[] };

export type ResponseFormat = 'lines' | 'json' | 'tsv' | 'csv' | 'psv';
export type ParsedResult = { pseudonym: string; choice: string; [key: string]: CellValue };
export type ValidationResult = { valid: ParsedResult[]; unknown: ParsedResult[]; duplicatePseudonyms: string[]; missingPseudonyms: string[] };
