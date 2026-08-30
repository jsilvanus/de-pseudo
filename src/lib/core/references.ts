import type { InputRecord } from './types';

export type ReferenceMatch = { value: string; candidates: string[] };
export type ReferenceResolution = { resolved: Record<string, string>; ambiguous: ReferenceMatch[]; unresolved: string[] };

export function findReferenceCandidates(values: string[], reference: string): string[] {
  const needle = reference.trim().toLocaleLowerCase();
  if (!needle) return [];
  return values.filter(value => value.toLocaleLowerCase() === needle || value.toLocaleLowerCase().split(/\s+/).includes(needle));
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
