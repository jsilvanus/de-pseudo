export type LoadedRecord = Record<string, string | number | boolean | null>;

function parseCsv(text: string): LoadedRecord[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"') { if (quoted && next === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) { if (ch === '\r' && next === '\n') i++; row.push(cell); cell = ''; if (row.some(v => v.trim())) rows.push(row); row = []; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = (rows.shift() ?? []).map((h, i) => h.trim() || `Column ${i + 1}`);
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
}

export async function loadSpreadsheet(file: File): Promise<LoadedRecord[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('The workbook contains no sheets.');
  return XLSX.utils.sheet_to_json<LoadedRecord>(sheet, { defval: '' });
}

export async function loadFile(file: File): Promise<LoadedRecord[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return loadSpreadsheet(file);
  if (name.endsWith('.csv') || file.type === 'text/csv' || file.type === 'text/plain') return parseCsv(await file.text());
  throw new Error('Unsupported file. Please choose CSV, XLSX or XLS.');
}

export async function loadClipboardText(text: string): Promise<LoadedRecord[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.filter(v => v && typeof v === 'object');
  } catch { /* tabular clipboard fallback */ }
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  const delimiter = lines.some(line => line.includes('\t')) ? '\t' : ',';
  const rows = lines.map(line => line.split(delimiter));
  const headers = rows.shift()!.map((h, i) => h.trim() || `Column ${i + 1}`);
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
}
