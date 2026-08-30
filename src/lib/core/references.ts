import type { InputRecord } from './types';

export type ReferenceMatch = { value: string; candidates: string[] };
export type ReferenceResolution = { resolved: Record<string, string>; ambiguous: ReferenceMatch[]; unresolved: string[] };

export function findReferenceCandidates(values: string[], reference: string): string[] {
  const needle = reference.trim().toLocaleLowerCase();
  if (!needle) return [];
  return values.filter(value => value.toLocaleLowerCase() === needle || value.toLocaleLowerCase().split(/\s+/).includes(needle));
}

/**
 * Does `reference` look like "<first name> <last-initial>" (e.g. "Anna J" or
 * "Anna J.") for this specific full name? Only a single-letter last token
 * counts as an initial, and the first name must match exactly — this is
 * deliberately narrow so it only fires on genuine initials, not arbitrary
 * abbreviations.
 */
function matchesFirstNameAndInitial(reference: string, fullValue: string): boolean {
  const refTokens = reference.trim().split(/\s+/);
  if (refTokens.length < 2) return false;
  const initial = refTokens[refTokens.length - 1].replace(/\.$/, '');
  if (initial.length !== 1) return false;

  const valueTokens = fullValue.trim().split(/\s+/);
  if (valueTokens.length < 2) return false;
  const valueFirst = valueTokens.slice(0, -1).join(' ').toLocaleLowerCase();
  const valueLast = valueTokens[valueTokens.length - 1];
  const refFirst = refTokens.slice(0, -1).join(' ').toLocaleLowerCase();

  return refFirst === valueFirst && valueLast.toLocaleLowerCase().startsWith(initial.toLocaleLowerCase());
}

/**
 * Values matched by first name plus a last-name initial, e.g. "Anna J." for
 * "Anna Johnson". Kept separate from findReferenceCandidates because an
 * initial match is a weaker, inferred signal that callers should flag as
 * such rather than treat identically to an exact or full-token match.
 */
export function findInitialMatches(values: string[], reference: string): string[] {
  const trimmed = reference.trim();
  if (!trimmed) return [];
  return values.filter(value => matchesFirstNameAndInitial(trimmed, value));
}

export function resolveReferenceAliases(records: InputRecord[], targetColumn: string, aliases: Record<string, string>): ReferenceResolution {
  const targets = [...new Set(records.map(r => String(r[targetColumn] ?? '')).filter(Boolean))];
  const resolved: Record<string, string> = {};
  const ambiguous: ReferenceMatch[] = [];
  const unresolved: string[] = [];
  for (const [reference, target] of Object.entries(aliases)) {
    const candidates = findReferenceCandidates(targets, target);
    if (candidates.length === 1) resolved[reference] = candidates[0];
    else if (candidates.length > 1) ambiguous.push({ value: reference, candidates });
    else unresolved.push(reference);
  }
  return { resolved, ambiguous, unresolved };
}
