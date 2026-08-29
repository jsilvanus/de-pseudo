import type { Dataset, PseudonymizedRow } from '../dataset/types';
import { generatePseudonym } from './pseudonymizer';

export type InputRow = {
  identity: string;
  data: Record<string, string>;
};

export function pseudonymize(rows: InputRow[]): Dataset {
  const used = new Set<string>();
  const datasetRows = rows.map((row) => {
    let pseudonym = generatePseudonym();
    while (used.has(pseudonym)) pseudonym = generatePseudonym();
    used.add(pseudonym);

    return { pseudonym, identity: row.identity, data: { ...row.data } };
  });

  return {
    rows: datasetRows,
    mappings: datasetRows.map(({ pseudonym, identity }) => ({ pseudonym, identity })),
  };
}

export function toPseudonymizedRows(dataset: Dataset): PseudonymizedRow[] {
  return dataset.rows.map(({ pseudonym, data }) => ({ pseudonym, data: { ...data } }));
}

export function formatPseudonymizedRows(rows: PseudonymizedRow[]): string {
  return rows
    .map(({ pseudonym, data }) => {
      const values = Object.values(data).filter((value) => value.trim() !== '');
      return `${pseudonym}${values.length ? ` | ${values.join(' | ')}` : ''}`;
    })
    .join('\n');
}
