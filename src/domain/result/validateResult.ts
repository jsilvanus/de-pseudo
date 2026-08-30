import type { ParsedResult } from './parseResult';

export type ValidationResult = {
  valid: ParsedResult[];
  unknown: ParsedResult[];
  duplicatePseudonyms: string[];
  missingPseudonyms: string[];
};

export function validateResult(results: ParsedResult[], expectedPseudonyms: string[]): ValidationResult {
  const expected = new Set(expectedPseudonyms);
  const seen = new Set<string>();
  const valid: ParsedResult[] = [];
  const unknown: ParsedResult[] = [];
  const duplicates: string[] = [];

  for (const result of results) {
    if (!expected.has(result.pseudonym)) {
      unknown.push(result);
      continue;
    }
    if (seen.has(result.pseudonym)) {
      duplicates.push(result.pseudonym);
      continue;
    }
    seen.add(result.pseudonym);
    valid.push(result);
  }

  return {
    valid,
    unknown,
    duplicatePseudonyms: [...new Set(duplicates)],
    missingPseudonyms: expectedPseudonyms.filter((pseudonym) => !seen.has(pseudonym)),
  };
}
