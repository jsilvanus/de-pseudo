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

export function pseudonymizedTsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return [columns.map(tsvCell).join('\t'), ...rows.map(row => columns.map(column => tsvCell(row[column])).join('\t'))].join('\n');
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

function expandPromptTokens(task: string, rows: Record<string, unknown>[]): string {
  return task
    .replace(/\{\{pseudonymized values\}\}/gi, () => [
      '--- PSEUDONYMIZED DATA ---', pseudonymizedTsv(rows), '--- END PSEUDONYMIZED DATA ---',
    ].join('\n'))
    .replace(/\{\{([^{}]+)\}\}/g, (_, column: string) => {
      const name = column.trim();
      if (name.toLowerCase() === 'pseudonymized values') return _;
      return rows.map(row => `${name}: ${tsvCell(row[name])}`).join('\n');
    });
}

export function buildPrompt(rows: unknown[], task: string, format: ResponseFormat = 'tsv', sessionId?: string, schema?: DatasetSchema): string {
  const id = sessionId ?? generateSessionId();
  const outputFields = schema?.output.map(f => f.name) ?? ['pseudonym', 'choice'];
  const objectRows = rows.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  const safeRows = sanitizeRows(objectRows, schema);
  const expandedTask = expandPromptTokens(task.trim(), safeRows);
  return [`SESSION ID: ${id}`, '', expandedTask, '', responseInstructions(format, id, outputFields)].join('\n');
}

export function generateSessionId(): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error('A cryptographically secure random source is required');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
