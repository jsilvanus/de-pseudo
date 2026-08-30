import type { DatasetSchema, ResponseFormat } from './types';

export function responseInstructions(format: ResponseFormat = 'lines', sessionId = '<session-id>', outputFields: string[] = ['pseudonym', 'choice']): string {
  const fields = outputFields.join(', ');
  return format === 'json'
    ? [
        'OUTPUT FORMAT', 'Return ONLY a JSON object.',
        `{"sessionId":"<session-id>","results":[{${outputFields.map(f => `"${f}":"<value>"`).join(',')}}]}`,
        `Set sessionId exactly to: ${sessionId}`, `Return only these fields: ${fields}.`,
        'Use every pseudonym exactly as provided. Return one object per pseudonym.',
        'Do not invent, modify, or omit pseudonyms. Do not include real names or identifying information.',
        'Do not include markdown or explanatory text.',
      ].join('\n')
    : [
        'OUTPUT FORMAT', `First line must be exactly:`, `SESSION ID: ${sessionId}`,
        `Then return exactly one line for each pseudonym: <pseudonym> -> <choice>`,
        `Return only these output fields: ${fields}.`,
        'Use each pseudonym exactly as provided. Do not invent, modify, or omit pseudonyms.',
        'Do not include real names or identifying information. Do not use a markdown table or explanatory text.',
      ].join('\n');
}

export function buildPrompt(rows: unknown[], task: string, format: ResponseFormat = 'lines', sessionId?: string, schema?: DatasetSchema): string {
  const id = sessionId ?? generateSessionId();
  const outputFields = schema?.output.map(f => f.name) ?? ['pseudonym', 'choice'];
  return [`SESSION ID: ${id}`, '', task.trim(), '', responseInstructions(format, id, outputFields), '', 'DATA', JSON.stringify(rows, null, 2)].join('\n');
}

export function generateSessionId(): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error('A cryptographically secure random source is required');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
