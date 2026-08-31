import type { DatasetSchema, OutputField, ResponseFormat } from './types';

// The AI is asked to echo the pseudonym token itself under the literal
// column "pseudonym" — never under a renamed output field like "Nimi" that
// only exists so the *locally resolved* result carries that label. Using the
// custom name here would mismatch both this same instruction's own "the
// pseudonym column must be present" line and the literal "pseudonym" header
// the parser looks for.
function outputFieldName(field: OutputField): string {
  return field.source === 'pseudonym' ? 'pseudonym' : field.name;
}

const COMMON_IDENTITY_COLUMNS = new Set([
  'username', 'user name', 'name', 'full name', 'fullname', 'first name', 'last name',
  'email', 'e-mail', 'phone', 'telephone', 'mobile', 'address', 'street address',
  'postal address', 'ssn', 'social security number',
]);

// The AI may want to add explanation, reasoning, or other commentary around
// the actual answer — rather than forbidding that outright, let it, as long
// as the required data is wrapped in a block delimited by these exact marker
// lines, matching the "--- TABLE ---" / "--- END TABLE ---" convention
// already used for the data blocks sent *to* the AI. A reply with no other
// content can skip the wrapper — the parser accepts both.
const RESULT_BLOCK_NOTE = 'You may add other explanation or information elsewhere in your reply. If you do, put the required data below inside a block starting with a line that says exactly "--- RESULT ---" and ending with a line that says exactly "--- END RESULT ---" — only what is inside that block will be read as data. If your reply contains nothing else, you may omit the block and return just the data below.';

// Freeform explanation elsewhere in the reply is fine, but the data itself
// must stay parseable: a chat UI can silently drop the newlines between rows
// of a rendered markdown table on copy, and a markdown table wouldn't use the
// requested delimiter in the first place. Plain text, one row per line.
const PLAIN_ROWS_NOTE = 'Do not format the data as a markdown table or inside a code block — plain text only, with exactly one row per line.';
const PLAIN_JSON_NOTE = 'Do not wrap the JSON in a markdown code block — plain text only.';

export function responseInstructions(format: ResponseFormat = 'tsv', sessionId = '<session-id>', outputFields: string[] = ['pseudonym', 'choice']): string {
  const fields = outputFields.join(', ');
  if (format === 'json') return [
    'OUTPUT FORMAT',
    `A JSON object: {"sessionId":"${sessionId}","results":[{${outputFields.map(f => `"${f}":"<value>"`).join(',')}}]}`,
    `Set sessionId exactly to: ${sessionId}`, `Return only these fields: ${fields}.`,
    'Use every pseudonym exactly as provided. Return one object per pseudonym.',
    'Do not invent, modify, or omit pseudonyms. Do not include real names or identifying information.',
    PLAIN_JSON_NOTE,
    RESULT_BLOCK_NOTE,
  ].join('\n');
  if (format === 'tsv') return [
    'OUTPUT FORMAT',
    `First line must be exactly: SESSION ID:\t${sessionId}`,
    'Leave one blank line after the SESSION ID line.',
    `Then return a tab-separated table with these columns: ${fields}.`,
    'Leave one blank line after the header row, before the data rows.',
    'The pseudonym column must be present and must contain every pseudonym exactly once.',
    'Do not invent, modify, or omit pseudonyms. Do not include real names or identifying information.',
    PLAIN_ROWS_NOTE,
    RESULT_BLOCK_NOTE,
  ].join('\n');
  if (format === 'csv') return [
    'OUTPUT FORMAT',
    `First line must be exactly: SESSION ID: ${sessionId}`,
    'Leave one blank line after the SESSION ID line.',
    `Then return a comma-separated (CSV) table with these columns: ${fields}.`,
    'Leave one blank line after the header row, before the data rows.',
    'The pseudonym column must be present and must contain every pseudonym exactly once.',
    'Quote a field in double quotes if it contains a comma, a quote, or a line break.',
    'Do not invent, modify, or omit pseudonyms. Do not include real names or identifying information.',
    PLAIN_ROWS_NOTE,
    RESULT_BLOCK_NOTE,
  ].join('\n');
  if (format === 'psv') return [
    'OUTPUT FORMAT',
    `First line must be exactly: SESSION ID: ${sessionId}`,
    'Leave one blank line after the SESSION ID line.',
    `Then return a pipe-separated (PSV, using "|") table with these columns: ${fields}.`,
    'Leave one blank line after the header row, before the data rows.',
    'The pseudonym column must be present and must contain every pseudonym exactly once.',
    'Do not invent, modify, or omit pseudonyms. Do not include real names or identifying information.',
    PLAIN_ROWS_NOTE,
    RESULT_BLOCK_NOTE,
  ].join('\n');
  return [
    'OUTPUT FORMAT', `First line must be exactly: SESSION ID: ${sessionId}`,
    `Then return exactly one line for each pseudonym: <pseudonym> -> <choice>`,
    `Return only these output fields: ${fields}.`,
    'Use each pseudonym exactly as provided. Do not invent, modify, or omit pseudonyms.',
    'Do not include real names or identifying information.',
    PLAIN_ROWS_NOTE,
    RESULT_BLOCK_NOTE,
  ].join('\n');
}

function tsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r?\n/g, ' ').replace(/\t/g, ' ');
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value).replace(/\r?\n/g, ' ');
  return /[",]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function psvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r?\n/g, ' ').replace(/\|/g, ' ');
}

export function delimiterFor(format: ResponseFormat): ',' | '\t' | '|' {
  if (format === 'csv') return ',';
  if (format === 'psv') return '|';
  return '\t';
}

/** Render rows as a delimited table; used for both the AI-facing pseudonymized data block and its response format. */
export function pseudonymizedTable(rows: Record<string, unknown>[], delimiter: ',' | '\t' | '|' = '\t'): string {
  if (!rows.length) return '';
  const cell = delimiter === ',' ? csvCell : delimiter === '|' ? psvCell : tsvCell;
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return [columns.map(cell).join(delimiter), ...rows.map(row => columns.map(column => cell(row[column])).join(delimiter))].join('\n');
}

export function pseudonymizedTsv(rows: Record<string, unknown>[]): string {
  return pseudonymizedTable(rows, '\t');
}

function sanitizeRows(rows: Record<string, unknown>[], schema?: DatasetSchema): Record<string, unknown>[] {
  return rows.map(row => {
    const safe: Record<string, unknown> = {};
    if (typeof row.pseudonym === 'string') safe.pseudonym = row.pseudonym;

    for (const [name, value] of Object.entries(row)) {
      if (name === 'pseudonym') continue;
      if (schema) {
        const column = schema.columns.find(c => c.name === name);
        // Only explicitly retained/reference data is allowed into the AI payload.
        if (!column || column.mode === 'pseudonymize' || column.mode === 'remove') continue;
      } else if (COMMON_IDENTITY_COLUMNS.has(name.trim().toLowerCase())) {
        // Conservative fallback for callers that provide already-pseudonymized rows
        // without a schema. A schema remains the authoritative way to classify fields.
        continue;
      }
      safe[name] = value;
    }
    return safe;
  });
}

function columnIsBlocked(name: string, schema?: DatasetSchema): boolean {
  if (schema) {
    const column = schema.columns.find(c => c.name === name);
    return !column || column.mode === 'pseudonymize' || column.mode === 'remove';
  }
  return COMMON_IDENTITY_COLUMNS.has(name.trim().toLowerCase());
}

function pseudonymizedDataBlock(rows: Record<string, unknown>[], format: ResponseFormat): string {
  const delimiter = delimiterFor(format);
  return ['--- PSEUDONYMIZED DATA ---', pseudonymizedTable(rows, delimiter), '--- END PSEUDONYMIZED DATA ---'].join('\n');
}

function expandPromptTokens(task: string, rows: Record<string, unknown>[], format: ResponseFormat, schema?: DatasetSchema): string {
  return task
    .replace(/\{\{pseudonymized values\}\}/gi, () => pseudonymizedDataBlock(rows, format))
    .replace(/\{\{([^{}]+)\}\}/g, (_, column: string) => {
      const name = column.trim();
      if (name.toLowerCase() === 'pseudonymized values') return _;
      // The schema (or, absent one, a conservative identity-column list) is the
      // authoritative privacy boundary: a blocked column must not appear at all,
      // not even as an empty "name: " label.
      if (columnIsBlocked(name, schema)) return '';
      return rows.map(row => `${name}: ${tsvCell(row[name])}`).join('\n');
    });
}

export function buildPrompt(rows: unknown[], task: string, format: ResponseFormat = 'tsv', sessionId?: string, schema?: DatasetSchema): string {
  const id = sessionId ?? generateSessionId();
  const outputFields = schema?.output.length ? [...new Set(schema.output.map(outputFieldName))] : ['pseudonym', 'choice'];
  const objectRows = rows.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  const safeRows = sanitizeRows(objectRows, schema);
  const trimmedTask = task.trim();
  const hasDataToken = /\{\{pseudonymized values\}\}/i.test(trimmedTask);
  let expandedTask = expandPromptTokens(trimmedTask, safeRows, format, schema);
  // The pseudonymized dataset is always visible to the AI, even if the task
  // text never references it via {{pseudonymized values}}.
  if (!hasDataToken) expandedTask = [expandedTask, pseudonymizedDataBlock(safeRows, format)].join('\n\n');
  return [`SESSION ID: ${id}`, '', expandedTask, '', responseInstructions(format, id, outputFields)].join('\n');
}

/**
 * Multi-table counterpart to buildPrompt: renders each table as its own
 * clearly labeled data block, all sharing one SESSION ID and one set of
 * response-format instructions. Only tables with at least one configured
 * output field contribute pseudonyms to that contract — a supporting table
 * (e.g. room sizes, referenced from a preferences table) is visible to the
 * AI as context but the AI isn't asked to answer for each of its rows,
 * unless the caller explicitly gives it output fields too.
 */
export function buildMultiTablePrompt(
  tables: { name: string; rows: unknown[]; schema?: DatasetSchema }[],
  task: string,
  format: ResponseFormat = 'tsv',
  sessionId?: string,
): string {
  const id = sessionId ?? generateSessionId();
  const contributingFields = [...new Set(tables.flatMap(t => (t.schema?.output.length ? t.schema.output.map(outputFieldName) : [])))];
  const outputFields = contributingFields.length ? contributingFields : ['pseudonym', 'choice'];

  const delimiter = delimiterFor(format);
  const blocks = tables.map(t => {
    const objectRows = t.rows.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
    const safeRows = sanitizeRows(objectRows, t.schema);
    const label = t.name.toUpperCase();
    return [`--- ${label} ---`, pseudonymizedTable(safeRows, delimiter), `--- END ${label} ---`].join('\n');
  });
  const allBlocks = blocks.join('\n\n');

  const trimmedTask = task.trim();
  const hasDataToken = /\{\{pseudonymized values\}\}/i.test(trimmedTask);
  let expandedTask = trimmedTask.replace(/\{\{pseudonymized values\}\}/gi, () => allBlocks);
  // As with the single-table prompt, the data is always visible to the AI
  // even if the task text never references it via a token.
  if (!hasDataToken) expandedTask = [expandedTask, allBlocks].join('\n\n');

  return [`SESSION ID: ${id}`, '', expandedTask, '', responseInstructions(format, id, outputFields)].join('\n');
}

export function generateSessionId(): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error('A cryptographically secure random source is required');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
