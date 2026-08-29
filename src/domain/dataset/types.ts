export type DatasetRow = {
  pseudonym: string;
  identity: string;
  data: Record<string, string>;
};

export type PseudonymizedRow = {
  pseudonym: string;
  data: Record<string, string>;
};

export type PseudonymMapping = {
  pseudonym: string;
  identity: string;
};

export type Dataset = {
  rows: DatasetRow[];
  mappings: PseudonymMapping[];
};
