import type { PseudonymMapping } from '../dataset/types';

export type ResolvedResult = {
  pseudonym: string;
  identity: string;
  result: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pseudonyms are alphanumeric, so a plain `\b` boundary treats a hyphen as a
 * separator and would match a pseudonym hidden inside a larger decoy token
 * like `prefix-<pseudonym>-suffix`. Require the pseudonym to not be directly
 * touching another alphanumeric character or a hyphen on either side.
 */
function tokenPattern(pseudonym: string, flags = ''): RegExp {
  return new RegExp(`(?<![a-zA-Z0-9-])${escapeRegExp(pseudonym)}(?![a-zA-Z0-9-])`, flags);
}

/** Replace every known pseudonym with its identity locally. */
export function resolveText(text: string, mappings: PseudonymMapping[]): string {
  return mappings.reduce((resolved, { pseudonym, identity }) => {
    return resolved.replace(tokenPattern(pseudonym, 'g'), identity);
  }, text);
}

/** Find which known pseudonyms occur in an AI response. */
export function findPseudonyms(text: string, mappings: PseudonymMapping[]): string[] {
  return mappings
    .filter(({ pseudonym }) => tokenPattern(pseudonym).test(text))
    .map(({ pseudonym }) => pseudonym);
}

export function resolveResult(text: string, mappings: PseudonymMapping[]): ResolvedResult[] {
  return mappings.flatMap(({ pseudonym, identity }) => {
    if (!tokenPattern(pseudonym).test(text)) return [];
    return [{ pseudonym, identity, result: resolveText(text, [{ pseudonym, identity }]) }];
  });
}
