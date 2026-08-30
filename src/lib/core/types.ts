export type CellValue = string | number | boolean | null | CellValue[] | { [key: string]: CellValue };
export type InputRecord = Record<string, CellValue>;

export type ColumnMode = 'keep' | 'pseudonymize' | 'reference' | 'remove';
export type OutputField = { name: string; source?: string };
export type ColumnDefinition = {
  name: string;
  mode: ColumnMode;
  referenceTarget?: string;
  multiple?: boolean;
  output?: boolean;
};
export type DatasetSchema = { columns: ColumnDefinition[]; output: OutputField[] };

export type PseudonymizedRecord = Record<string, CellValue> & { pseudonym: string };
export type IdentityMapping = Record<string, InputRecord>;
export type PseudonymizedDataset = { rows: PseudonymizedRecord[]; mapping: IdentityMapping; schema?: DatasetSchema };

export type ResponseFormat = 'lines' | 'json';
export type ParsedResult = { pseudonym: string; choice: string; [key: string]: CellValue };
export type ValidationResult = { valid: ParsedResult[]; unknown: ParsedResult[]; duplicatePseudonyms: string[]; missingPseudonyms: string[] };
