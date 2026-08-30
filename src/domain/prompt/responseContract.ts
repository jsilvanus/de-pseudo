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

function extractPseudonyms(rowsText: string): string[] {
  return rowsText
    .split(/\r?\n/)
    .map((line) => line.split('|')[0]?.trim())
    .filter((value): value is string => Boolean(value));
}

export function buildPromptWithContract(
  rowsText: string,
  task: string,
  format: ResponseFormat = 'lines',
): string {
  let instructions = responseInstructions(format);
  if (format === 'lines') {
    const pseudonyms = extractPseudonyms(rowsText);
    if (pseudonyms.length) {
      instructions = instructions.replace(
        '<pseudonym> -> <choice>',
        pseudonyms.map((pseudonym) => `${pseudonym} -> <choice>`).join('\n'),
      );
    }
  }
  return `${task.trim()}\n\n${instructions}\n\nDATA\n${rowsText.trim()}`;
}
