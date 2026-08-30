import type { ResponseFormat } from './types';

export function responseInstructions(format: ResponseFormat = 'lines'): string {
  return format === 'json'
    ? [
        'OUTPUT FORMAT',
        'Return ONLY a JSON array.',
        '[{"pseudonym":"<pseudonym>","choice":"<choice>"}]',
        'Use every pseudonym exactly as provided. Return one object per pseudonym.',
        'Do not invent, modify, or omit pseudonyms. Do not include real names or identifying information.',
        'Do not include markdown or explanatory text.',
      ].join('\n')
    : [
        'OUTPUT FORMAT',
        'Return exactly one line for each pseudonym:',
        '<pseudonym> -> <choice>',
        'Use every pseudonym exactly as provided. Return one line per pseudonym.',
        'Do not invent, modify, or omit pseudonyms. Do not include real names or identifying information.',
        'Do not use a markdown table or explanatory text.',
      ].join('\n');
}

export function buildPrompt(rows: unknown[], task: string, format: ResponseFormat = 'lines'): string {
  return `${task.trim()}\n\n${responseInstructions(format)}\n\nDATA\n${JSON.stringify(rows, null, 2)}`;
}
