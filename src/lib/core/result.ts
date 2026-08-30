import type { ParsedResult, ValidationResult } from './types';

export function parseLines(text: string): ParsedResult[] {
  return text.split(/\r?\n/).flatMap(line => {
    const match = line.trim().match(/^([^\s]+)\s*->\s*(.+)$/);
    return match ? [{ pseudonym: match[1], choice: match[2].trim() }] : [];
  });
}

export function parseJson(text: string): ParsedResult[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error('Expected a JSON array');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Invalid result at index ${index}`);
    const r = item as Record<string, unknown>;
    if (typeof r.pseudonym !== 'string' || !r.pseudonym || typeof r.choice !== 'string') {
      throw new Error(`Invalid result at index ${index}`);
    }
    return { pseudonym: r.pseudonym, choice: r.choice };
  });
}

export function validateResults(results: ParsedResult[], expected: string[]): ValidationResult {
  const expectedSet = new Set(expected);
  const seen = new Set<string>();
  const valid: ParsedResult[] = [];
  const unknown: ParsedResult[] = [];
  const duplicatePseudonyms: string[] = [];

  for (const result of results) {
    if (!expectedSet.has(result.pseudonym)) unknown.push(result);
    else if (seen.has(result.pseudonym)) duplicatePseudonyms.push(result.pseudonym);
    else { seen.add(result.pseudonym); valid.push(result); }
  }

  return {
    valid,
    unknown,
    duplicatePseudonyms: [...new Set(duplicatePseudonyms)],
    missingPseudonyms: expected.filter(p => !seen.has(p)),
  };
}
