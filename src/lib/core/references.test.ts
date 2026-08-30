import { describe, expect, it } from 'vitest';
import { findInitialMatches, findReferenceCandidates, resolveReferenceAliases } from './references';

describe('findReferenceCandidates', () => {
  const targets = ['Anna Johnson', 'John Johnson', 'Anna Benson'];

  it('matches an exact full value', () => {
    expect(findReferenceCandidates(targets, 'Anna Johnson')).toEqual(['Anna Johnson']);
  });

  it('is ambiguous when a first name matches more than one person', () => {
    // "Anna" is a name token shared by two different people; both are
    // legitimate candidates, so both must come back rather than one being
    // silently preferred.
    const candidates = findReferenceCandidates(targets, 'Anna');
    expect(candidates).toEqual(['Anna Johnson', 'Anna Benson']);
    expect(candidates).toHaveLength(2);
  });

  it('does not match an abbreviated last name', () => {
    // "Anna B." isn't an exact value and isn't a single whitespace-delimited
    // token of any target, so it must not be treated as a match at all.
    expect(findReferenceCandidates(targets, 'Anna B.')).toEqual([]);
  });

  it('matches case-insensitively', () => {
    expect(findReferenceCandidates(targets, 'anna johnson')).toEqual(['Anna Johnson']);
    expect(findReferenceCandidates(targets, 'JOHN')).toEqual(['John Johnson']);
  });

  it('returns nothing for an unrelated or empty reference', () => {
    expect(findReferenceCandidates(targets, 'Mary')).toEqual([]);
    expect(findReferenceCandidates(targets, '')).toEqual([]);
    expect(findReferenceCandidates(targets, '   ')).toEqual([]);
  });
});

describe('findInitialMatches', () => {
  const targets = ['Anna Johnson', 'John Johnson', 'Anna Benson'];

  it('matches first name plus a last-initial with a trailing period', () => {
    expect(findInitialMatches(targets, 'Anna J.')).toEqual(['Anna Johnson']);
  });

  it('matches first name plus a bare last-initial, no period', () => {
    expect(findInitialMatches(targets, 'Anna J')).toEqual(['Anna Johnson']);
    expect(findInitialMatches(targets, 'Anna B')).toEqual(['Anna Benson']);
  });

  it('matches case-insensitively', () => {
    expect(findInitialMatches(targets, 'anna j.')).toEqual(['Anna Johnson']);
  });

  it('returns every candidate when the initial matches more than one person', () => {
    const ambiguousTargets = [...targets, 'Anna Jones'];
    expect(findInitialMatches(ambiguousTargets, 'Anna J.')).toEqual(['Anna Johnson', 'Anna Jones']);
  });

  it('does not match a bare first name with no initial', () => {
    // A single-token reference carries no last-initial signal at all — that
    // stays the job of findReferenceCandidates's ambiguity handling.
    expect(findInitialMatches(targets, 'Anna')).toEqual([]);
  });

  it('does not match when the last-initial does not fit', () => {
    expect(findInitialMatches(targets, 'Anna Q.')).toEqual([]);
  });

  it('does not match a multi-letter abbreviation as an initial', () => {
    // Only a single letter counts as an initial; this stays deliberately
    // narrow so it doesn't start guessing at arbitrary abbreviations.
    expect(findInitialMatches(targets, 'Anna Jo')).toEqual([]);
  });

  it('returns nothing for an empty reference', () => {
    expect(findInitialMatches(targets, '')).toEqual([]);
    expect(findInitialMatches(targets, '   ')).toEqual([]);
  });
});

describe('resolveReferenceAliases', () => {
  const records = [
    { username: 'Anna Johnson' },
    { username: 'John Johnson' },
    { username: 'Anna Benson' },
  ];

  it('resolves a reference with exactly one candidate', () => {
    const result = resolveReferenceAliases(records, 'username', { 'friend:John Johnson': 'John Johnson' });
    expect(result.resolved).toEqual({ 'friend:John Johnson': 'John Johnson' });
    expect(result.ambiguous).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });

  it('reports a reference matching multiple people as ambiguous, not resolved', () => {
    const result = resolveReferenceAliases(records, 'username', { 'friend:Anna': 'Anna' });
    expect(result.resolved).toEqual({});
    expect(result.ambiguous).toEqual([{ value: 'friend:Anna', candidates: ['Anna Johnson', 'Anna Benson'] }]);
    expect(result.unresolved).toEqual([]);
  });

  it('reports a reference matching nobody as unresolved, not resolved', () => {
    const result = resolveReferenceAliases(records, 'username', { 'friend:Anna B.': 'Anna B.' });
    expect(result.resolved).toEqual({});
    expect(result.ambiguous).toEqual([]);
    expect(result.unresolved).toEqual(['friend:Anna B.']);
  });

  it('classifies a mix of aliases independently', () => {
    const result = resolveReferenceAliases(records, 'username', {
      'friend:John Johnson': 'John Johnson',
      'friend:Anna': 'Anna',
      'friend:Anna B.': 'Anna B.',
    });
    expect(result.resolved).toEqual({ 'friend:John Johnson': 'John Johnson' });
    expect(result.ambiguous.map((a) => a.value)).toEqual(['friend:Anna']);
    expect(result.unresolved).toEqual(['friend:Anna B.']);
  });
});
