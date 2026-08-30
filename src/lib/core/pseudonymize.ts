import type { IdentityMapping, InputRecord, PseudonymizedDataset, PseudonymizedRecord } from './types';
import { createPseudonymGenerator, type RandomBytes } from './random';

export function pseudonymize(
  records: InputRecord[],
  usernameField = 'username',
  randomBytes?: RandomBytes,
): PseudonymizedDataset {
  const generate = createPseudonymGenerator(randomBytes);
  const mapping: IdentityMapping = {};
  const rows: PseudonymizedRecord[] = [];
  const used = new Set<string>();

  for (const record of records) {
    let pseudonym = generate();
    while (used.has(pseudonym)) pseudonym = generate();
    used.add(pseudonym);

    const identity = { ...record };
    const pseudonymized = { ...record, pseudonym } as PseudonymizedRecord;
    delete pseudonymized[usernameField];
    mapping[pseudonym] = identity;
    rows.push(pseudonymized);
  }

  return { rows, mapping };
}
