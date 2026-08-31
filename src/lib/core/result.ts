import type { ParsedResult, ValidationResult, ResponseFormat } from './types';

export type SessionResponse = { sessionId: string; results: ParsedResult[] };

export function extractSessionId(text: string): string {
  const match = text.match(/^SESSION ID:\s*([0-9a-f]{32})\s*$/im);
  if (!match) throw new Error('AI response is missing a valid session ID');
  return match[1];
}

export function assertSessionId(text: string, expected: string): void {
  const actual = extractSessionId(text);
  if (actual !== expected) throw new Error('AI response belongs to a different session');
}

// The AI may add explanation or other commentary around the actual answer
// (see RESULT_BLOCK_NOTE in prompt.ts) — when it wraps the required data in
// a "--- RESULT ---" / "--- END RESULT ---" block, parse only what's inside
// that block. A reply with no such block is parsed as-is, unchanged from
// before this convention existed.
const RESULT_BLOCK_RE = /^-{2,}\s*RESULT\s*-{2,}\s*\r?\n([\s\S]*?)\r?\n-{2,}\s*END\s+RESULT\s*-{2,}\s*$/im;

function extractResultBlock(text: string): string {
  return text.match(RESULT_BLOCK_RE)?.[1] ?? text;
}

function parseDelimitedRows(text: string, delimiter: string): ParsedResult[] {
  const lines = text.split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean);
  const data = lines.filter(l => !/^SESSION ID:/i.test(l));
  if (!data.length) return [];
  const header = data[0].split(delimiter).map(v => v.trim());
  const pseudoIndex = header.findIndex(v => v.toLowerCase() === 'pseudonym');
  if (pseudoIndex < 0) throw new Error('Delimited response must contain a pseudonym column');
  return data.slice(1).map((line, index) => {
    const values = line.split(delimiter);
    const pseudonym = (values[pseudoIndex] ?? '').trim();
    if (!pseudonym) throw new Error(`Delimited result row ${index + 2} has no pseudonym`);
    const result: ParsedResult = { pseudonym, choice: '' };
    header.forEach((name, i) => { if (name && name.toLowerCase() !== 'pseudonym') result[name] = (values[i] ?? '').trim(); });
    const choice = result.choice ?? result[header.find(h => h.toLowerCase() !== 'pseudonym') ?? 'choice'] ?? '';
    result.choice = String(choice);
    return result;
  });
}

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
    if (typeof r.pseudonym !== 'string' || !r.pseudonym || typeof r.choice !== 'string') throw new Error(`Invalid result at index ${index}`);
    return { pseudonym: r.pseudonym, choice: r.choice };
  });
}

export function parseSessionResponse(text: string, format: ResponseFormat, expectedSessionId: string): ParsedResult[] {
  const body = extractResultBlock(text);
  if (format === 'json') {
    const value: unknown = JSON.parse(body.trim());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON response object');
    const r = value as Record<string, unknown>;
    if (r.sessionId !== expectedSessionId || !Array.isArray(r.results)) throw new Error('AI response has an invalid session ID');
    return parseJson(JSON.stringify(r.results));
  }
  if (format === 'tsv' || format === 'csv' || format === 'psv') {
    // The session id line may sit inside or outside the "--- RESULT ---"
    // block, so it's checked against the full original reply either way.
    assertSessionId(text, expectedSessionId);
    const delimiter = format === 'csv' ? ',' : format === 'psv' ? '|' : '\t';
    return parseDelimitedRows(body, delimiter);
  }
  assertSessionId(text, expectedSessionId);
  return parseLines(body);
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
  return { valid, unknown, duplicatePseudonyms: [...new Set(duplicatePseudonyms)], missingPseudonyms: expected.filter(p => !seen.has(p)) };
}
