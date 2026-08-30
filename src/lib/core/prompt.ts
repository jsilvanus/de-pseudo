import type { DatasetSchema, ResponseFormat } from './types';

const COMMON_IDENTITY_COLUMNS = new Set([
  'username', 'user name', 'name', 'full name', 'fullname', 'first name', 'last name',
  'email', 'e-mail', 'phone', 'telephone', 'mobile', 'address', 'street address',
  'postal address', 'ssn', 'social security number',
]);

export function responseInstructions(format: ResponseFormat = 'tsv', sessionId = '<session-id>', outputFields: string[] = ['pseudonym', 'choice']): string {
  const fields = outputFields.join(', ');
  if (format === 'json') return [
    'OUTPUT FORMAT', 'Return ONLY a JSON object.',
    `{"sessionId":"${sessionId}","results":[{${outputFields.map(f => `"${f}":"<value>"`).join(',')}}]}`,
    `Set sessionId exactly to: ${sessionId}`, `Return only these fields: ${fields}.`,
    'Use every pseudonym exactly as provided. Return one object per pseudonym.',
    'Do not invent, modify, or omit pseudonyms. Do not include real names or identifying information.',
    'Do not include markdown or explanatory text.',
  ].join('\n');
  if (format === 'tsv') return [
    'OUTPUT FORMAT',
    `First line must be exactly: SESSION ID:\t${sessionId}`,
    `Then return a tab-separated table with these columns: ${fields}.`,
    'The pseudonym column must be present and must contain every pseudonym exactly once.',
    'Do not invent, modify, or omit pseudonyms. Do not include real names or identifying information.',
    'Do not include markdown or explanatory text.',
  ].join('\n');
  if (format === 'csv') return [
    'OUTPUT FORMAT',
    `First line must be exactly: SESSION ID: ${sessionId}`,
    `Then return a comma-separated (CSV) table with these columns: ${fields}.`,
    'The pseudonym column must be present and must contain every pseudonym exactly once.',
    'Quote a field in double quotes if it contains a comma, a quote, or a line break.',
    'Do not invent, modify, or omit pseudonyms. Do not include real names or identifying information.',
    'Do not include markdown or explanatory text.',
  ].join('\n');
  return [
    'OUTPUT FORMAT', `First line must be exactly: SESSION ID: ${sessionId}`,
    `Then return exactly one line for each pseudonym: <pseudonym> -> <choice>`,
    `Return only these output fields: ${fields}.`,
    'Use each pseudonym exactly as provided. Do not invent, modify, or omit pseudonyms.',
    'Do not include real names or identifying information. Do not use a markdown table or explanatory text.',
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

/** Render rows as a delimited table; used for both the AI-facing pseudonymized data block and its response format. */
export function pseudonymizedTable(rows: Record<string, unknown>[], delimiter: ',' | '\t' = '\t'): string {
  if (!rows.length) return '';
  const cell = delimiter === ',' ? csvCell : tsvCell;
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
  const delimiter = format === 'csv' ? ',' : '\t';
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
  const outputFields = schema?.output.map(f => f.name) ?? ['pseudonym', 'choice'];
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

export function generateSessionId(): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error('A cryptographically secure random source is required');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
