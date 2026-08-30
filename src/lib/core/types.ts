export type InputRecord = Record<string, unknown>;

export type PseudonymizedRecord = Record<string, unknown> & { pseudonym: string };

export type IdentityMapping = Record<string, InputRecord>;

export type PseudonymizedDataset = {
  rows: PseudonymizedRecord[];
  mapping: IdentityMapping;
};

export type ResponseFormat = 'lines' | 'json';
export type ParsedResult = { pseudonym: string; choice: string };

export type ValidationResult = {
  valid: ParsedResult[];
  unknown: ParsedResult[];
  duplicatePseudonyms: string[];
  missingPseudonyms: string[];
};
