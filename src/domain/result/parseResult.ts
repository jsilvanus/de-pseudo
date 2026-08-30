export type ParsedResult = { pseudonym: string; choice: string };

export function parseLineResult(text: string): ParsedResult[] {
  const result: ParsedResult[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^([^\s]+)\s*->\s*(.+)$/);
    if (match) result.push({ pseudonym: match[1], choice: match[2].trim() });
  }
  return result;
}

export function parseJsonResult(text: string): ParsedResult[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error('Expected a JSON array');

  return value.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Invalid result at index ${index}`);
    const record = item as Record<string, unknown>;
    if (typeof record.pseudonym !== 'string' || !record.pseudonym || typeof record.choice !== 'string') {
      throw new Error(`Invalid result at index ${index}`);
    }
    return { pseudonym: record.pseudonym, choice: record.choice };
  });
}
