import type { IdentityMapping, InputRecord, PseudonymizedDataset, PseudonymizedRecord } from './types';

function token(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
}

export function pseudonymize(records: InputRecord[], usernameField = 'username'): PseudonymizedDataset {
  const mapping: IdentityMapping = {};
  const rows: PseudonymizedRecord[] = [];
  const used = new Set<string>();

  for (const record of records) {
    let pseudonym = token();
    while (used.has(pseudonym)) pseudonym = token();
    used.add(pseudonym);

    const identity = { ...record };
    const pseudonymized = { ...record, pseudonym } as PseudonymizedRecord;
    delete pseudonymized[usernameField];
    mapping[pseudonym] = identity;
    rows.push(pseudonymized);
  }

  return { rows, mapping };
}
