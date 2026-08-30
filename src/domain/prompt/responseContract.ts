export type ResponseFormat = 'lines' | 'json';

export function responseInstructions(format: ResponseFormat): string {
  if (format === 'json') {
    return [
      'OUTPUT FORMAT',
      'Return ONLY a JSON array.',
      'For every pseudonym, return exactly one object with this shape:',
      '[{"pseudonym":"<pseudonym>","choice":"<choice>"}]',
      'Rules:',
      '- Use each pseudonym exactly as provided.',
      '- Return one object for every pseudonym.',
      '- Do not invent, modify, or omit pseudonyms.',
      '- Do not include real names or identifying information.',
      '- Do not include markdown or explanatory text.',
    ].join('\n');
  }

  return [
    'OUTPUT FORMAT',
    'Return exactly one line for each pseudonym:',
    '<pseudonym> -> <choice>',
    'Rules:',
    '- Use each pseudonym exactly as provided.',
    '- Return one line for every pseudonym.',
    '- Do not invent, modify, or omit pseudonyms.',
    '- Do not include real names or identifying information.',
    '- Do not use a markdown table or explanatory text.',
  ].join('\n');
}

export function buildPromptWithContract(
  rowsText: string,
  task: string,
  format: ResponseFormat = 'lines',
): string {
  return `${task.trim()}\n\n${responseInstructions(format)}\n\nDATA\n${rowsText.trim()}`;
}
