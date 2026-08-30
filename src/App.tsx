import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, Container, FormControl, FormControlLabel, InputLabel, Link, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { pseudonymizeTables, applySchemas, buildMultiTablePrompt, parseSessionResponse, validateResults, projectOutput, defaultSchema, findReferenceCandidates, findInitialMatches, type DatasetSchema, type ResponseFormat, type MultiTableDataset, type NamedPseudonymizedTable, type SchemaTableInput } from './lib/core';
import { loadFile, loadClipboardText, type DelimitedFormat } from './lib/input/loadDataset';
import { SessionVault } from './domain/shred/sessionVault';
import { resolveText } from './domain/result/resolve';
import { ReferenceEditor, type CellReference } from './components/ReferenceEditor';

const vault = new SessionVault<MultiTableDataset>();
type RawRecord = Record<string, any>;
type LoadedTable = { name: string; rawRecords: RawRecord[]; identityColumn: string };

function guessIdentityColumn(records: RawRecord[]): string {
  if (!records.length) return '';
  const columns = Object.keys(records[0]);
  const preferred = columns.find(c => ['username', 'name', 'full name', 'fullname'].includes(c.trim().toLowerCase()));
  return preferred ?? columns[0];
}

export default function App() {
  // Tables not yet pseudonymized: the staging area for "1. Load data".
  const [tables, setTables] = useState<LoadedTable[]>([]);
  const [draftName, setDraftName] = useState('Table 1');
  const [draftRecords, setDraftRecords] = useState<RawRecord[]>([]);
  const [draftIdentityColumn, setDraftIdentityColumn] = useState('');
  const [draftPasteText, setDraftPasteText] = useState('');
  const [draftPasteFormat, setDraftPasteFormat] = useState<DelimitedFormat>('tsv');
  const [draftLoadedFrom, setDraftLoadedFrom] = useState('');

  const [dataset, setDataset] = useState<MultiTableDataset | null>(null);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [cellReferences, setCellReferences] = useState<CellReference[]>([]);
  const [task, setTask] = useState('Make an order based on food preferences.');
  const [promptDraft, setPromptDraft] = useState('');
  const [format, setFormat] = useState<ResponseFormat>('tsv');
  const [aiResult, setAiResult] = useState('');
  const [resolved, setResolved] = useState('');
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);
  const [copied, setCopied] = useState<'prompt' | 'result' | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    vault.restore().then(data => {
      if (data && Array.isArray(data.tables)) { setDataset(data); setRestored(true); }
    }).catch(() => undefined);
  }, []);

  // Once pseudonymized, raw values are reconstructed from the identity
  // mapping rather than kept in separate state — this stays correct even
  // after a restored session, where the pre-pseudonymize staging list above
  // is empty.
  const rawByTable = useMemo(
    () => dataset ? dataset.tables.map(t => t.rows.map(r => dataset.mapping[r.pseudonym] as RawRecord).filter(Boolean)) : [],
    [dataset],
  );
  const identityColumnByTable = useMemo(
    () => dataset ? dataset.tables.map(t => t.schema.columns.find(c => c.mode === 'pseudonymize')?.name ?? '') : [],
    [dataset],
  );

  function updateTableSchema(tableIndex: number, fn: (s: DatasetSchema) => DatasetSchema) {
    setDataset(d => {
      if (!d) return d;
      const next = structuredClone(d);
      next.tables[tableIndex].schema = fn(next.tables[tableIndex].schema);
      return next;
    });
  }

  const promptResult = useMemo(() => {
    if (!dataset) return { tables: [] as NamedPseudonymizedTable[], error: null as string | null, notes: [] as string[] };
    const notes: string[] = [];
    try {
      const inputs: SchemaTableInput[] = dataset.tables.map((t, i) => ({
        name: t.name,
        records: rawByTable[i],
        pseudonyms: t.rows.map(r => r.pseudonym),
        schema: t.schema,
        identityColumn: identityColumnByTable[i],
      }));
      const applied = applySchemas(inputs, { aliases, cellReferences, notes });
      return { tables: applied, error: null as string | null, notes };
    } catch (e) {
      return { tables: [] as typeof dataset.tables, error: e instanceof Error ? e.message : 'Could not resolve references.', notes: [] as string[] };
    }
  }, [dataset, rawByTable, identityColumnByTable, aliases, cellReferences]);
  const referenceError = promptResult.error;
  const referenceNotes = promptResult.notes;

  const prompt = useMemo(() => {
    if (!dataset || !vault.sessionId || referenceError) return '';
    return buildMultiTablePrompt(
      promptResult.tables.map(t => ({ name: t.name, rows: t.rows, schema: t.schema })),
      promptDraft || task,
      format,
      vault.sessionId,
    );
  }, [dataset, promptResult, promptDraft, task, format, referenceError]);

  const referenceColumnRefs = useMemo(
    () => dataset ? dataset.tables.flatMap((t, ti) => t.schema.columns
      .filter(c => c.mode === 'reference' && c.referenceTarget)
      .map(column => ({ tableIndex: ti, tableName: t.name, column }))) : [],
    [dataset],
  );

  async function copy(text: string, kind: 'prompt' | 'result') { await navigator.clipboard.writeText(text); setCopied(kind); window.setTimeout(() => setCopied(c => c === kind ? null : c), 1800); }

  async function draftLoadRecords(records: RawRecord[], source: string) {
    if (!records.length) throw new Error('No rows were found.');
    setDraftRecords(records);
    setDraftIdentityColumn(guessIdentityColumn(records));
    setDraftLoadedFrom(source);
    setError('');
  }
  async function onDraftFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try { setLoading(true); const kind = /\.xlsx?$/i.test(file.name) ? 'Excel file' : 'CSV file'; await draftLoadRecords(await loadFile(file), kind); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load file.'); } finally { setLoading(false); }
  }
  async function onDraftClipboard() {
    try { setLoading(true); const text = await navigator.clipboard.readText(); await draftLoadRecords(await loadClipboardText(text, draftPasteFormat), `OS clipboard (${draftPasteFormat.toUpperCase()})`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not read clipboard.'); } finally { setLoading(false); }
  }
  async function onDraftPasteChange(text: string, formatOverride?: DelimitedFormat) {
    setDraftPasteText(text);
    const activeFormat = formatOverride ?? draftPasteFormat;
    try { const records = await loadClipboardText(text, activeFormat); if (records.length) await draftLoadRecords(records, `Pasted text (${activeFormat.toUpperCase()})`); else if (!text.trim()) setDraftRecords([]); }
    catch { /* ignore invalid input while typing */ }
  }

  function addTable() {
    if (!draftRecords.length) { setError('Load data for this table first.'); return; }
    if (!draftIdentityColumn) { setError('Choose the identity column for this table.'); return; }
    const name = draftName.trim() || `Table ${tables.length + 1}`;
    setTables(ts => [...ts, { name, rawRecords: draftRecords, identityColumn: draftIdentityColumn }]);
    setDraftName(`Table ${tables.length + 2}`);
    setDraftRecords([]); setDraftIdentityColumn(''); setDraftPasteText(''); setDraftLoadedFrom(''); setError('');
  }
  function removeTable(index: number) { setTables(ts => ts.filter((_, i) => i !== index)); }

  async function handlePseudonymizeAll() {
    try {
      setError(''); setResolved('');
      if (!tables.length) throw new Error('Load at least one table first.');
      const { tables: baseTables, mapping } = pseudonymizeTables(tables.map(t => ({ name: t.name, records: t.rawRecords, identityColumn: t.identityColumn })));
      const schemaInputs: SchemaTableInput[] = tables.map((t, i) => {
        const schema = defaultSchema(t.rawRecords, t.identityColumn);
        // With a single table, default output is the existing, expected
        // behavior. With several, there's no reliable way to guess which one
        // the AI should actually answer for — a "rooms" table loaded first
        // is a fine example of a supporting table that should stay silent —
        // so require an explicit choice in "AI output" instead of guessing.
        if (tables.length > 1) schema.output = [];
        return { name: t.name, records: t.rawRecords, pseudonyms: baseTables[i].rows.map(r => r.pseudonym), schema, identityColumn: t.identityColumn };
      });
      const appliedTables = applySchemas(schemaInputs);
      const result: MultiTableDataset = { tables: appliedTables, mapping };
      await vault.create(result);
      setDataset(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not pseudonymize data.'); }
  }

  function mapAlias(key: string, target: string) { setAliases(a => ({ ...a, [key]: target })); }

  async function handleResolve() {
    try {
      if (!dataset || !vault.sessionId) throw new Error('Create or restore a session first.');
      const result = parseSessionResponse(aiResult, format, vault.sessionId);
      const contributing = dataset.tables.filter(t => t.schema.output.length > 0);
      const expected = (contributing.length ? contributing : dataset.tables).flatMap(t => t.rows.map(r => r.pseudonym));
      const validation = validateResults(result, expected);
      if (validation.unknown.length || validation.duplicatePseudonyms.length || validation.missingPseudonyms.length) {
        throw new Error(`Result rejected: ${validation.unknown.length} unknown, ${validation.duplicatePseudonyms.length} duplicate, ${validation.missingPseudonyms.length} missing pseudonym(s).`);
      }
      const outputFields = contributing.length ? contributing.flatMap(t => t.schema.output) : [{ name: 'pseudonym', source: 'pseudonym' }, { name: 'result', source: 'choice' }];
      const projected = projectOutput(result, outputFields);
      const mappings = dataset.tables.flatMap(t => {
        const idCol = t.schema.columns.find(c => c.mode === 'pseudonymize')?.name;
        return t.rows.map(r => ({ pseudonym: r.pseudonym, identity: String(dataset.mapping[r.pseudonym]?.[idCol ?? ''] ?? r.pseudonym) }));
      });
      setError('');
      setResolved(resolveText(JSON.stringify(projected, null, 2), mappings));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not validate AI result.'); setResolved(''); }
  }

  async function handleShred() {
    await vault.shred();
    setDataset(null);
    setTables([]); setDraftName('Table 1'); setDraftRecords([]); setDraftIdentityColumn(''); setDraftPasteText(''); setDraftLoadedFrom('');
    setAliases({}); setCellReferences([]);
    setAiResult(''); setResolved('');
    setRestored(false); setCopied(null);
    setError('Session shredded.');
    setPromptDraft(''); setFormat('tsv');
  }

  return <Container maxWidth="lg" sx={{ py: 4 }}><Stack spacing={3}>
    <Box><Typography variant="h3">🎭 de-pseudo</Typography><Typography color="text.secondary">Pseudonymize before AI. Resolve locally. Shred when finished.</Typography></Box>
    <Paper variant="outlined" sx={{ p: 3, background: 'linear-gradient(135deg, rgba(193,84,12,0.07), rgba(192,138,46,0.07))' }}><Stack spacing={2}>
      <Typography variant="h6">How it works</Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center" useFlexGap>
        <Chip label="📋 Your data" /><Typography color="text.secondary">→</Typography>
        <Chip label="🎭 Pseudonymize" /><Typography color="text.secondary">→</Typography>
        <Chip label="✏️ Build prompt" /><Typography color="text.secondary">→</Typography>
        <Chip label="🤖 AI sees only tokens" /><Typography color="text.secondary">→</Typography>
        <Chip label="🔓 Resolve locally" /><Typography color="text.secondary">→</Typography>
        <Chip label="🗑️ Shred" />
      </Stack>
      <Typography variant="body2" color="text.secondary">Names and other identifiers are swapped for random tokens before anything is copied out to an AI. You can load more than one table — a shared value like a room number gets the exact same token wherever it's referenced. The AI only ever sees tokens plus whatever data you explicitly allow through; only this browser tab holds the mapping back to real identities, and only until you shred it.</Typography>
      <Alert severity="info" icon={false}>🔍 <b>Note:</b> this provides <b>pseudonymization</b> — and, depending on what other data travels alongside it, potentially <b>anonymization</b> — of what you send to an AI system. Pseudonymization alone does not guarantee anonymity: free text, rare attribute combinations, or surrounding context can still make someone identifiable even without their name. Review what you send before it leaves this tab.</Alert>
    </Stack></Paper>
    {restored && <Alert severity="info">Encrypted local session restored. Identity mapping remains local.</Alert>}{error && <Alert severity={error === 'Session shredded.' ? 'success' : 'error'}>{error}</Alert>}

    {!dataset && <Paper sx={{ p: 3 }}><Stack spacing={2}>
      <Typography variant="h5">1. Load data</Typography>
      <Typography variant="body2" color="text.secondary">Everything is processed locally in the browser. Load one or more tables — e.g. a "Rooms" table and a "Preferences" table — then pseudonymize them together so a shared value, like a room number, resolves to the same token wherever it's referenced across tables.</Typography>

      {tables.length > 0 && <Stack spacing={1}>{tables.map((t, i) => <Paper key={i} variant="outlined" sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="body2"><b>{t.name}</b> — {t.rawRecords.length} rows, identity column "{t.identityColumn}"</Typography>
        <Button size="small" color="error" onClick={() => removeTable(i)}>Remove</Button>
      </Paper>)}</Stack>}

      <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
        <Typography variant="subtitle2">{tables.length > 0 ? 'Add another table' : 'Add a table'}</Typography>
        <TextField size="small" label="Table name" value={draftName} onChange={e => setDraftName(e.target.value)} sx={{ maxWidth: 280 }} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <input ref={fileInput} type="file" hidden accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={onDraftFile} />
          <Button variant="contained" onClick={() => fileInput.current?.click()} disabled={loading}>Load file (CSV, Excel) +</Button>
          <Button variant="outlined" onClick={onDraftClipboard} disabled={loading}>Load clipboard</Button>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center"><Typography variant="body2" color="text.secondary">Paste format:</Typography><ToggleButtonGroup size="small" exclusive value={draftPasteFormat} onChange={(_, v: DelimitedFormat | null) => { if (v) { setDraftPasteFormat(v); onDraftPasteChange(draftPasteText, v); } }}><ToggleButton value="tsv">TSV (tab)</ToggleButton><ToggleButton value="csv">CSV (comma)</ToggleButton></ToggleButtonGroup></Stack>
        <TextField label="Paste data" multiline minRows={3} value={draftPasteText} onChange={e => onDraftPasteChange(e.target.value)} placeholder={draftPasteFormat === 'csv' ? 'room,size\nRoom A,4' : 'room\tsize\nRoom A\t4'} fullWidth />
        {draftRecords.length > 0 && <>
          <Typography variant="body2">Loaded {draftRecords.length} rows from {draftLoadedFrom}.</Typography>
          <FormControl size="small" sx={{ maxWidth: 280 }}><InputLabel>Identity column</InputLabel><Select label="Identity column" value={draftIdentityColumn} onChange={e => setDraftIdentityColumn(e.target.value)}>{Object.keys(draftRecords[0]).map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</Select></FormControl>
          <TableContainer sx={{ maxHeight: 280 }}><Table stickyHeader size="small"><TableHead><TableRow>{Object.keys(draftRecords[0]).map(c => <TableCell key={c}>{c}</TableCell>)}</TableRow></TableHead><TableBody>{draftRecords.map((row, ri) => <TableRow key={ri}>{Object.keys(draftRecords[0]).map(c => <TableCell key={c}>{String(row[c] ?? '')}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer>
          <Button variant="contained" onClick={addTable}>Add this table</Button>
        </>}
      </Stack></Paper>

      {tables.length > 0 && <Button variant="contained" color="secondary" size="large" onClick={handlePseudonymizeAll}>Pseudonymize all & continue</Button>}
    </Stack></Paper>}

    {dataset && <>
      {dataset.tables.length === 1 && <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">Dataset editor</Typography><Typography variant="body2" color="text.secondary">Reference columns have a ↗ handle. Drag it directly to a pseudonymized person cell.</Typography><ReferenceEditor rows={rawByTable[0]} columns={dataset.tables[0].schema.columns.map(c => c.name)} referenceColumns={dataset.tables[0].schema.columns.filter(c => c.mode === 'reference').map(c => c.name)} pseudonymizedColumns={dataset.tables[0].schema.columns.filter(c => c.mode === 'pseudonymize').map(c => c.name)} references={cellReferences} onChange={setCellReferences} /></Stack></Paper>}

      {dataset.tables.map((t, ti) => <Paper key={t.name} sx={{ p: 3 }}><Stack spacing={2}>
        <Typography variant="h5">Privacy & columns — {t.name}</Typography>
        <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Column</TableCell><TableCell>Privacy mode</TableCell><TableCell>Reference target</TableCell></TableRow></TableHead><TableBody>
          {t.schema.columns.map((column, ci) => <TableRow key={column.name}>
            <TableCell>{column.name}</TableCell>
            <TableCell><FormControl size="small" fullWidth><InputLabel>Mode</InputLabel><Select label="Mode" value={column.mode} onChange={e => updateTableSchema(ti, s => {
              s.columns[ci].mode = e.target.value as typeof column.mode;
              if (s.columns[ci].mode === 'reference') { s.columns[ci].referenceTable = s.columns[ci].referenceTable ?? t.name; const targetIndex = dataset.tables.findIndex(x => x.name === s.columns[ci].referenceTable); s.columns[ci].referenceTarget = s.columns[ci].referenceTarget ?? identityColumnByTable[targetIndex]; }
              else { delete s.columns[ci].referenceTarget; delete s.columns[ci].referenceTable; }
              return s;
            })}><MenuItem value="keep">Keep</MenuItem><MenuItem value="pseudonymize">Pseudonymize</MenuItem><MenuItem value="reference">Reference</MenuItem><MenuItem value="remove">Remove</MenuItem></Select></FormControl></TableCell>
            <TableCell>{column.mode === 'reference' ? <Stack direction="row" spacing={1}>
              <FormControl size="small" sx={{ minWidth: 140 }}><InputLabel>Table</InputLabel><Select label="Table" value={column.referenceTable ?? t.name} onChange={e => updateTableSchema(ti, s => { s.columns[ci].referenceTable = e.target.value; const targetIndex = dataset.tables.findIndex(x => x.name === e.target.value); s.columns[ci].referenceTarget = identityColumnByTable[targetIndex]; return s; })}>{dataset.tables.map(x => <MenuItem key={x.name} value={x.name}>{x.name}</MenuItem>)}</Select></FormControl>
              <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>.{column.referenceTarget}</Typography>
            </Stack> : '—'}</TableCell>
          </TableRow>)}
        </TableBody></Table></TableContainer>
      </Stack></Paper>)}

      {referenceColumnRefs.length > 0 && <Paper sx={{ p: 3 }}><Stack spacing={2}>
        <Typography variant="h5">Resolve text references</Typography>
        {referenceError && <Alert severity="warning">{referenceError}</Alert>}
        {referenceNotes.length > 0 && <Alert severity="info">{referenceNotes.map(note => <Box key={note}>{note}</Box>)}</Alert>}
        {referenceColumnRefs.map(({ tableIndex, tableName, column }) => {
          const targetTableName = column.referenceTable ?? tableName;
          const targetIndex = dataset.tables.findIndex(x => x.name === targetTableName);
          const targetValues = (rawByTable[targetIndex] ?? []).map(r => String(r[identityColumnByTable[targetIndex]] ?? '')).filter(Boolean);
          const references = [...new Set((rawByTable[tableIndex] ?? []).map(r => String(r[column.name] ?? '')).filter(Boolean))];
          return <Box key={`${tableName}.${column.name}`}>
            <Typography fontWeight="bold">{tableName}.{column.name} → {targetTableName}.{column.referenceTarget}</Typography>
            {references.map(reference => {
              const candidates = findReferenceCandidates(targetValues, reference);
              const ambiguous = candidates.length > 1;
              const initialMatches = candidates.length === 0 ? findInitialMatches([...new Set(targetValues)], reference) : [];
              const inferred = initialMatches.length === 1 ? initialMatches[0] : null;
              const others = [...new Set(targetValues)].filter(v => !candidates.includes(v));
              const options = [...candidates, ...others];
              const aliasKey = `${tableName}.${column.name}:${reference}`;
              return <Box key={reference} sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 1, alignItems: 'center', my: 1 }}>
                <Typography>{reference}{ambiguous && <Typography component="span" variant="body2" color="warning.main"> (matches {candidates.length})</Typography>}{candidates.length === 0 && !inferred && <Typography component="span" variant="body2" color="text.secondary"> (no automatic match — choose one)</Typography>}{inferred && <Typography component="span" variant="body2" color="info.main"> (partial match resolved to "{inferred}" — verify)</Typography>}</Typography>
                <FormControl size="small"><InputLabel>Value</InputLabel><Select label="Value" value={aliases[aliasKey] ?? inferred ?? ''} onChange={e => mapAlias(aliasKey, e.target.value)}><MenuItem value=""><em>Unresolved</em></MenuItem>{options.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</Select></FormControl>
              </Box>;
            })}
          </Box>;
        })}
      </Stack></Paper>}

      <Paper sx={{ p: 3 }}><Stack spacing={2}>
        <Typography variant="h5">Prompt constructor</Typography>
        <Typography variant="body2" color="text.secondary">Describe the task below. Every table's pseudonymized data ({dataset.tables.map(t => t.name).join(', ')}) is automatically included.</Typography>
        <TextField label="Prompt" multiline minRows={6} value={promptDraft} onChange={e => setPromptDraft(e.target.value)} placeholder="Describe the task..." fullWidth />
      </Stack></Paper>

      <Paper sx={{ p: 3 }}><Stack spacing={2}>
        <Typography variant="h5">AI output</Typography>
        {dataset.tables.map((t, ti) => <Box key={t.name}>
          <Typography fontWeight="bold" sx={{ mb: 1 }}>{t.name}</Typography>
          {t.schema.columns.filter(c => c.mode !== 'remove').map(column => <FormControlLabel key={column.name} control={<Checkbox checked={t.schema.output.some(o => o.name === column.name)} onChange={e => updateTableSchema(ti, s => {
            const exists = s.output.some(o => o.name === column.name);
            s.output = e.target.checked && !exists ? [...s.output, { name: column.name, source: column.mode === 'pseudonymize' ? 'pseudonym' : column.name }] : !e.target.checked ? s.output.filter(o => o.name !== column.name) : s.output;
            return s;
          })} />} label={column.name} />)}
          <TextField size="small" label="AI-generated output field name" placeholder="selected_food" onKeyDown={e => { if (e.key === 'Enter') { const name = (e.target as HTMLInputElement).value.trim(); if (name) { updateTableSchema(ti, s => { if (!s.output.some(o => o.name === name)) s.output.push({ name }); return s; }); (e.target as HTMLInputElement).value = ''; } } }} helperText="Press Enter to add a new AI-generated field" fullWidth sx={{ mt: 1, maxWidth: 340 }} />
        </Box>)}
      </Stack></Paper>

      <Paper sx={{ p: 3 }}><Stack spacing={2}>
        <Typography variant="h5">Generated AI prompt</Typography>
        <Stack direction="row" spacing={1} alignItems="center"><Typography variant="body2" color="text.secondary">AI reply format:</Typography><ToggleButtonGroup size="small" exclusive value={format} onChange={(_, v: ResponseFormat | null) => v && setFormat(v)}><ToggleButton value="tsv">TSV</ToggleButton><ToggleButton value="csv">CSV</ToggleButton><ToggleButton value="json">JSON</ToggleButton></ToggleButtonGroup></Stack>
        {referenceError ? <Alert severity="error">Prompt generation is blocked until the unresolved references above are fixed.</Alert> : <><TextField multiline minRows={8} value={prompt} InputProps={{ readOnly: true }} fullWidth /><Button variant="outlined" onClick={() => copy(prompt, 'prompt')}>{copied === 'prompt' ? 'Copied' : 'Copy prompt'}</Button></>}
      </Stack></Paper>

      <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">Paste AI result</Typography><TextField multiline minRows={7} value={aiResult} onChange={e => setAiResult(e.target.value)} fullWidth /><Button variant="contained" onClick={handleResolve}>Validate & resolve locally</Button></Stack></Paper>
      {resolved && <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">Final output</Typography><TextField multiline minRows={5} value={resolved} InputProps={{ readOnly: true }} fullWidth /><Button variant="contained" onClick={() => copy(resolved, 'result')}>{copied === 'result' ? 'Copied' : 'Copy'}</Button></Stack></Paper>}
      <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">Cryptoshred</Typography><Button color="error" variant="contained" onClick={handleShred}>Shred session</Button></Stack></Paper>
    </>}
    <Box component="footer" sx={{ pt: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">Developed by <Link href="https://github.com/jsilvanus" target="_blank" rel="noopener noreferrer">Juha Itäleino (@jsilvanus)</Link> · <Link href="https://github.com/jsilvanus/de-pseudo" target="_blank" rel="noopener noreferrer">source on GitHub</Link></Typography>
      <Typography variant="body2" color="text.secondary">Licensed under the <Link href="https://github.com/jsilvanus/de-pseudo/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">EUPL-1.2</Link></Typography>
    </Box>
  </Stack></Container>;
}
