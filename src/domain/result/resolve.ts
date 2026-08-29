import type { PseudonymMapping } from '../dataset/types';

export type ResolvedResult = {
  pseudonym: string;
  identity: string;
  result: string;
};

export function resolveResult(text: string, mappings: PseudonymMapping[]): ResolvedResult[] {
  return mappings.flatMap(({ pseudonym, identity }) => {
    const escaped = pseudonym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'g');
    if (!pattern.test(text)) return [];

    return [{ pseudonym, identity, result: text.replace(pattern, pseudonym).trim() }];
  });
}
