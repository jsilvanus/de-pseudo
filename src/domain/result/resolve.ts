import type { PseudonymMapping } from '../dataset/types';

export type ResolvedResult = {
  pseudonym: string;
  identity: string;
  result: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace every known pseudonym with its identity locally. */
export function resolveText(text: string, mappings: PseudonymMapping[]): string {
  return mappings.reduce((resolved, { pseudonym, identity }) => {
    return resolved.replace(new RegExp(`\\b${escapeRegExp(pseudonym)}\\b`, 'g'), identity);
  }, text);
}

/** Find which known pseudonyms occur in an AI response. */
export function findPseudonyms(text: string, mappings: PseudonymMapping[]): string[] {
  return mappings
    .filter(({ pseudonym }) => new RegExp(`\\b${escapeRegExp(pseudonym)}\\b`).test(text))
    .map(({ pseudonym }) => pseudonym);
}

export function resolveResult(text: string, mappings: PseudonymMapping[]): ResolvedResult[] {
  return mappings.flatMap(({ pseudonym, identity }) => {
    if (!new RegExp(`\\b${escapeRegExp(pseudonym)}\\b`).test(text)) return [];
    return [{ pseudonym, identity, result: resolveText(text, [{ pseudonym, identity }]) }];
  });
}
