import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, Container, FormControl, FormControlLabel, InputLabel, Link, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { pseudonymizeTables, applySchemas, buildMultiTablePrompt, parseSessionResponse, validateResults, projectOutput, defaultSchema, findReferenceCandidates, findInitialMatches, pseudonymizedTable, delimiterFor, type DatasetSchema, type ResponseFormat, type MultiTableDataset, type NamedPseudonymizedTable, type SchemaTableInput } from './lib/core';
import { loadFile, loadClipboardText, type DelimitedFormat } from './lib/input/loadDataset';
import { SessionVault } from './domain/shred/sessionVault';
import { resolveText } from './domain/result/resolve';
import { ReferenceEditor, type CellReference } from './components/ReferenceEditor';
import { HowItWorks } from './components/HowItWorks';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { useLanguage } from './i18n/LanguageContext';

const vault = new SessionVault<MultiTableDataset>();
type RawRecord = Record<string, any>;
type LoadedTable = { name: string; rawRecords: RawRecord[]; identityColumn: string };
/** 'idtext' is a structured entry mode (a growing list of id/free-text row
 * pairs), not a text delimiter — it never reaches loadClipboardText. */
type InputFormat = DelimitedFormat | 'idtext';
type IdTextRow = { id: string; text: string };
/** The final locally-resolved output can be rendered in any of these — unlike
 * ResponseFormat, there's no 'lines' variant here, since that shape only
 * makes sense as a hint to the AI, not as a table export format. */
type FinalFormat = 'json' | 'tsv' | 'csv' | 'psv';

function guessIdentityColumn(records: RawRecord[]): string {
  if (!records.length) return '';
  const columns = Object.keys(records[0]);
  const preferred = columns.find(c => ['username', 'name', 'full name', 'fullname'].includes(c.trim().toLowerCase()));
  return preferred ?? columns[0];
}

export default function App() {
  const { t, language } = useLanguage();
  // Tables not yet pseudonymized: the staging area for "1. Load data".
  const [tables, setTables] = useState<LoadedTable[]>([]);
  const [draftName, setDraftName] = useState(t('tableDefaultName', { n: 1 }));
  const [draftNameEdited, setDraftNameEdited] = useState(false);
  const [draftRecords, setDraftRecords] = useState<RawRecord[]>([]);
  const [draftIdentityColumn, setDraftIdentityColumn] = useState('');
  const [draftPasteText, setDraftPasteText] = useState('');
  const [draftPasteFormat, setDraftPasteFormat] = useState<InputFormat>('tsv');
  const [draftLoadedFrom, setDraftLoadedFrom] = useState('');
  const [idTextRows, setIdTextRows] = useState<IdTextRow[]>([{ id: '', text: '' }]);

  const [dataset, setDataset] = useState<MultiTableDataset | null>(null);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [cellReferences, setCellReferences] = useState<CellReference[]>([]);
  const [task, setTask] = useState(t('defaultTask'));
  const [taskEdited, setTaskEdited] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [format, setFormat] = useState<ResponseFormat>('tsv');
  const [aiResult, setAiResult] = useState('');
  const [resolvedProjected, setResolvedProjected] = useState<Record<string, unknown>[] | null>(null);
  const [resolvedMappings, setResolvedMappings] = useState<{ pseudonym: string; identity: string }[]>([]);
  const [finalFormat, setFinalFormat] = useState<FinalFormat>('json');
  const [error, setError] = useState('');
  // Kept separate from the top-of-page `error` banner so a failed
  // validate-and-resolve shows its error right next to the button that
  // triggered it, instead of requiring a scroll back up to see it.
  const [resolveError, setResolveError] = useState('');
  const [restored, setRestored] = useState(false);
  const [copied, setCopied] = useState<'prompt' | 'result' | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const newOutputFieldInputs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    vault.restore().then(data => {
      if (data && Array.isArray(data.tables)) { setDataset(data); setRestored(true); }
    }).catch(() => undefined);
  }, []);

  // Keep the still-untouched draft defaults following the selected language
  // — once the user types their own table name or task, stop overwriting it.
  useEffect(() => { if (!draftNameEdited) setDraftName(t('tableDefaultName', { n: tables.length + 1 })); }, [language]);
  useEffect(() => { if (!taskEdited) setTask(t('defaultTask')); }, [language]);

  // "ID + free text" is structured manual entry rather than a pasted blob: every
  // filled row becomes a draft record live, keyed to a fixed "id" identity column.
  useEffect(() => {
    if (draftPasteFormat !== 'idtext') return;
    const filled = idTextRows.filter(r => r.id.trim() || r.text.trim());
    setDraftRecords(filled.map(r => ({ id: r.id.trim(), text: r.text })));
    setDraftIdentityColumn('id');
    setDraftLoadedFrom(t('manualEntrySource'));
  }, [idTextRows, draftPasteFormat, language]);

  // Keep the encrypted vault in sync with every schema edit (privacy mode,
  // reference targets, AI output fields) — not just the initial
  // pseudonymize — so a page reload restores the configuration as it was
  // left, not just the raw pseudonymized data.
  useEffect(() => { if (dataset) vault.update(dataset).catch(() => undefined); }, [dataset]);

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

  // A tap target alongside "press Enter" — some mobile keyboards show a
  // "Next"/"Go" key on this field that moves focus instead of firing the
  // keydown Enter handler, leaving the field with no way to submit.
  function addOutputField(ti: number) {
    const input = newOutputFieldInputs.current[ti];
    const name = input?.value.trim();
    if (!name) return;
    updateTableSchema(ti, s => { if (!s.output.some(o => o.name === name)) s.output.push({ name }); return s; });
    if (input) input.value = '';
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

  // Rendered fresh from the underlying resolved data whenever the chosen
  // final-output format changes — no need to re-validate the AI's reply.
  const finalOutputText = useMemo(() => {
    if (!resolvedProjected) return '';
    const rendered = finalFormat === 'json'
      ? JSON.stringify(resolvedProjected, null, 2)
      : pseudonymizedTable(resolvedProjected, delimiterFor(finalFormat));
    return resolveText(rendered, resolvedMappings);
  }, [resolvedProjected, resolvedMappings, finalFormat]);

  async function copy(text: string, kind: 'prompt' | 'result') { await navigator.clipboard.writeText(text); setCopied(kind); window.setTimeout(() => setCopied(c => c === kind ? null : c), 1800); }

  async function draftLoadRecords(records: RawRecord[], source: string) {
    if (!records.length) throw new Error(t('errNoRows'));
    setDraftRecords(records);
    setDraftIdentityColumn(guessIdentityColumn(records));
    setDraftLoadedFrom(source);
    setError('');
  }
  async function onDraftFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try { setLoading(true); const kind = /\.xlsx?$/i.test(file.name) ? t('excelFile') : t('csvFile'); await draftLoadRecords(await loadFile(file), kind); }
    catch (e) { setError(e instanceof Error ? e.message : t('errLoadFile')); } finally { setLoading(false); }
  }
  async function onDraftClipboard() {
    if (draftPasteFormat === 'idtext') return;
    try { setLoading(true); const text = await navigator.clipboard.readText(); await draftLoadRecords(await loadClipboardText(text, draftPasteFormat), t('clipboardSource', { format: draftPasteFormat.toUpperCase() })); }
    catch (e) { setError(e instanceof Error ? e.message : t('errReadClipboard')); } finally { setLoading(false); }
  }
  async function onDraftPasteChange(text: string, formatOverride?: DelimitedFormat) {
    setDraftPasteText(text);
    const activeFormat = formatOverride ?? (draftPasteFormat === 'idtext' ? 'tsv' : draftPasteFormat);
    try { const records = await loadClipboardText(text, activeFormat); if (records.length) await draftLoadRecords(records, t('pastedSource', { format: activeFormat.toUpperCase() })); else if (!text.trim()) setDraftRecords([]); }
    catch { /* ignore invalid input while typing */ }
  }

  function updateIdTextRow(index: number, field: keyof IdTextRow, value: string) {
    setIdTextRows(rows => {
      const next = rows.map((r, i) => i === index ? { ...r, [field]: value } : r);
      const last = next[next.length - 1];
      if (last.id.trim() || last.text.trim()) next.push({ id: '', text: '' });
      return next;
    });
  }
  function removeIdTextRow(index: number) {
    setIdTextRows(rows => { const next = rows.filter((_, i) => i !== index); return next.length ? next : [{ id: '', text: '' }]; });
  }

  function addTable() {
    if (!draftRecords.length) { setError(t('errLoadDataFirst')); return; }
    if (!draftIdentityColumn) { setError(t('errChooseIdentityColumn')); return; }
    const name = draftName.trim() || t('tableDefaultName', { n: tables.length + 1 });
    setTables(ts => [...ts, { name, rawRecords: draftRecords, identityColumn: draftIdentityColumn }]);
    setDraftName(t('tableDefaultName', { n: tables.length + 2 }));
    setDraftNameEdited(false);
    setDraftRecords([]); setDraftIdentityColumn(''); setDraftPasteText(''); setDraftLoadedFrom(''); setIdTextRows([{ id: '', text: '' }]); setError('');
  }
  function removeTable(index: number) { setTables(ts => ts.filter((_, i) => i !== index)); }

  async function handlePseudonymizeAll() {
    try {
      setError(''); setResolvedProjected(null); setResolveError('');
      if (!tables.length) throw new Error(t('errLoadAtLeastOne'));
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
    } catch (e) { setError(e instanceof Error ? e.message : t('errPseudonymize')); }
  }

  function mapAlias(key: string, target: string) { setAliases(a => ({ ...a, [key]: target })); }

  async function handleResolve() {
    try {
      if (!dataset || !vault.sessionId) throw new Error(t('errNoSession'));
      const result = parseSessionResponse(aiResult, format, vault.sessionId);
      const contributing = dataset.tables.filter(t => t.schema.output.length > 0);
      const expected = (contributing.length ? contributing : dataset.tables).flatMap(t => t.rows.map(r => r.pseudonym));
      const validation = validateResults(result, expected);
      if (validation.unknown.length || validation.duplicatePseudonyms.length || validation.missingPseudonyms.length) {
        throw new Error(t('errResultRejected', { unknown: validation.unknown.length, duplicate: validation.duplicatePseudonyms.length, missing: validation.missingPseudonyms.length }));
      }
      const outputFields = contributing.length ? contributing.flatMap(t => t.schema.output) : [{ name: 'pseudonym', source: 'pseudonym' }, { name: 'result', source: 'choice' }];
      const projected = projectOutput(result, outputFields);
      const mappings = dataset.tables.flatMap(t => {
        const idCol = t.schema.columns.find(c => c.mode === 'pseudonymize')?.name;
        return t.rows.map(r => ({ pseudonym: r.pseudonym, identity: String(dataset.mapping[r.pseudonym]?.[idCol ?? ''] ?? r.pseudonym) }));
      });
      setResolveError('');
      setResolvedProjected(projected);
      setResolvedMappings(mappings);
    } catch (e) { setResolveError(e instanceof Error ? e.message : t('errValidate')); setResolvedProjected(null); }
  }

  async function handleShred() {
    await vault.shred();
    setDataset(null);
    setTables([]); setDraftName(t('tableDefaultName', { n: 1 })); setDraftNameEdited(false); setDraftRecords([]); setDraftIdentityColumn(''); setDraftPasteText(''); setDraftLoadedFrom(''); setIdTextRows([{ id: '', text: '' }]);
    setAliases({}); setCellReferences([]);
    setAiResult(''); setResolvedProjected(null); setResolvedMappings([]); setResolveError('');
    setRestored(false); setCopied(null);
    setError(t('sessionShredded'));
    setPromptDraft(''); setFormat('tsv');
  }

  return <Container maxWidth="lg" sx={{ py: 4 }}><Stack spacing={3}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
      <Box><Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
        <Typography variant="h3">🎭 de-pseudo</Typography>
        <Chip label={`v${__APP_VERSION__}`} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
      </Stack><Typography color="text.secondary">{t('appTagline')}</Typography></Box>
      <LanguageSwitcher />
    </Stack>
    <HowItWorks />
    {restored && dataset && <Alert severity="info">{t('sessionRestored', { tables: dataset.tables.map(tbl => tbl.name).join(', ') })}</Alert>}{error && <Alert severity={error === t('sessionShredded') ? 'success' : 'error'}>{error}</Alert>}

    {!dataset && <Paper sx={{ p: 3 }}><Stack spacing={2}>
      <Typography variant="h5">{t('loadDataTitle')}</Typography>
      <Typography variant="body2" color="text.secondary">{t('loadDataDescription')}</Typography>

      {tables.length > 0 && <Stack spacing={1}>{tables.map((tbl, i) => <Paper key={i} variant="outlined" sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="body2">{t('tableRowSummary', { name: tbl.name, rows: tbl.rawRecords.length, column: tbl.identityColumn })}</Typography>
        <Button size="small" color="error" onClick={() => removeTable(i)}>{t('remove')}</Button>
      </Paper>)}</Stack>}

      <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
        <Typography variant="subtitle2">{tables.length > 0 ? t('addAnotherTable') : t('addTableTitle')}</Typography>
        <TextField size="small" label={t('tableNameLabel')} value={draftName} onChange={e => { setDraftName(e.target.value); setDraftNameEdited(true); }} sx={{ maxWidth: 280 }} />
        {draftPasteFormat !== 'idtext' && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <input ref={fileInput} type="file" hidden accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={onDraftFile} />
          <Button variant="contained" onClick={() => fileInput.current?.click()} disabled={loading}>{t('loadFile')}</Button>
          <Button variant="outlined" onClick={onDraftClipboard} disabled={loading}>{t('loadClipboard')}</Button>
        </Stack>}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap><Typography variant="body2" color="text.secondary">{t('pasteFormatLabel')}</Typography><ToggleButtonGroup size="small" exclusive value={draftPasteFormat} onChange={(_, v: InputFormat | null) => {
          if (!v) return;
          setDraftPasteFormat(v);
          if (v === 'idtext') { setDraftPasteText(''); setDraftRecords([]); setDraftIdentityColumn(''); }
          else { setIdTextRows([{ id: '', text: '' }]); onDraftPasteChange(draftPasteText, v); }
        }}><ToggleButton value="tsv">{t('formatTsvLong')}</ToggleButton><ToggleButton value="csv">{t('formatCsvLong')}</ToggleButton><ToggleButton value="psv">{t('formatPsvLong')}</ToggleButton><ToggleButton value="idtext">{t('formatIdTextLong')}</ToggleButton></ToggleButtonGroup></Stack>
        {draftPasteFormat === 'idtext' ? <Stack spacing={1}>
          {idTextRows.map((row, i) => <Stack key={i} direction="row" spacing={1} alignItems="center">
            <TextField size="small" label={t('idBoxLabel')} value={row.id} onChange={e => updateIdTextRow(i, 'id', e.target.value)} sx={{ maxWidth: 200 }} />
            <TextField size="small" label={t('textBoxLabel')} value={row.text} onChange={e => updateIdTextRow(i, 'text', e.target.value)} fullWidth multiline maxRows={4} />
            {(row.id.trim() || row.text.trim()) && <Button size="small" color="error" onClick={() => removeIdTextRow(i)}>{t('remove')}</Button>}
          </Stack>)}
        </Stack> : <TextField label={t('pasteDataLabel')} multiline minRows={3} value={draftPasteText} onChange={e => onDraftPasteChange(e.target.value)} placeholder={draftPasteFormat === 'csv' ? 'room,size\nRoom A,4' : draftPasteFormat === 'psv' ? 'room|size\nRoom A|4' : 'room\tsize\nRoom A\t4'} fullWidth />}
        {draftRecords.length > 0 && <>
          <Typography variant="body2">{t('loadedRows', { count: draftRecords.length, source: draftLoadedFrom })}</Typography>
          {draftPasteFormat !== 'idtext' && <FormControl size="small" sx={{ maxWidth: 280 }}><InputLabel>{t('identityColumn')}</InputLabel><Select label={t('identityColumn')} value={draftIdentityColumn} onChange={e => setDraftIdentityColumn(e.target.value)}>{Object.keys(draftRecords[0]).map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</Select></FormControl>}
          {draftPasteFormat !== 'idtext' && <TableContainer sx={{ maxHeight: 280 }}><Table stickyHeader size="small"><TableHead><TableRow>{Object.keys(draftRecords[0]).map(c => <TableCell key={c}>{c}</TableCell>)}</TableRow></TableHead><TableBody>{draftRecords.map((row, ri) => <TableRow key={ri}>{Object.keys(draftRecords[0]).map(c => <TableCell key={c}>{String(row[c] ?? '')}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer>}
          <Button variant="contained" onClick={addTable}>{t('addThisTable')}</Button>
        </>}
      </Stack></Paper>

      {tables.length > 0 && <Button variant="contained" color="secondary" size="large" onClick={handlePseudonymizeAll}>{t('pseudonymizeAndContinue')}</Button>}
    </Stack></Paper>}

    {dataset && <>
      {dataset.tables.length === 1 && <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">{t('datasetEditorTitle')}</Typography><Typography variant="body2" color="text.secondary">{t('datasetEditorDescription')}</Typography><ReferenceEditor rows={rawByTable[0]} columns={dataset.tables[0].schema.columns.map(c => c.name)} referenceColumns={dataset.tables[0].schema.columns.filter(c => c.mode === 'reference').map(c => c.name)} pseudonymizedColumns={dataset.tables[0].schema.columns.filter(c => c.mode === 'pseudonymize').map(c => c.name)} references={cellReferences} onChange={setCellReferences} /></Stack></Paper>}

      {dataset.tables.map((tbl, ti) => <Paper key={tbl.name} sx={{ p: 3 }}><Stack spacing={2}>
        <Typography variant="h5">{t('privacyColumnsTitle', { table: tbl.name })}</Typography>
        <TableContainer><Table size="small"><TableHead><TableRow><TableCell>{t('colColumn')}</TableCell><TableCell>{t('colPrivacyMode')}</TableCell><TableCell>{t('colReferenceTarget')}</TableCell></TableRow></TableHead><TableBody>
          {tbl.schema.columns.map((column, ci) => <TableRow key={column.name}>
            <TableCell>{column.name}</TableCell>
            <TableCell><FormControl size="small" fullWidth><InputLabel>{t('modeLabel')}</InputLabel><Select label={t('modeLabel')} value={column.mode} onChange={e => updateTableSchema(ti, s => {
              s.columns[ci].mode = e.target.value as typeof column.mode;
              if (s.columns[ci].mode === 'reference') { s.columns[ci].referenceTable = s.columns[ci].referenceTable ?? tbl.name; const targetIndex = dataset.tables.findIndex(x => x.name === s.columns[ci].referenceTable); s.columns[ci].referenceTarget = s.columns[ci].referenceTarget ?? identityColumnByTable[targetIndex]; }
              else { delete s.columns[ci].referenceTarget; delete s.columns[ci].referenceTable; }
              return s;
            })}><MenuItem value="keep">{t('modeKeep')}</MenuItem><MenuItem value="pseudonymize">{t('modePseudonymize')}</MenuItem><MenuItem value="reference">{t('modeReference')}</MenuItem><MenuItem value="remove">{t('modeRemove')}</MenuItem></Select></FormControl></TableCell>
            <TableCell>{column.mode === 'reference' ? <Stack direction="row" spacing={1}>
              <FormControl size="small" sx={{ minWidth: 140 }}><InputLabel>{t('tableLabel')}</InputLabel><Select label={t('tableLabel')} value={column.referenceTable ?? tbl.name} onChange={e => updateTableSchema(ti, s => { s.columns[ci].referenceTable = e.target.value; const targetIndex = dataset.tables.findIndex(x => x.name === e.target.value); s.columns[ci].referenceTarget = identityColumnByTable[targetIndex]; return s; })}>{dataset.tables.map(x => <MenuItem key={x.name} value={x.name}>{x.name}</MenuItem>)}</Select></FormControl>
              <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>.{column.referenceTarget}</Typography>
            </Stack> : '—'}</TableCell>
          </TableRow>)}
        </TableBody></Table></TableContainer>
      </Stack></Paper>)}

      {referenceColumnRefs.length > 0 && <Paper sx={{ p: 3 }}><Stack spacing={2}>
        <Typography variant="h5">{t('resolveReferencesTitle')}</Typography>
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
                <Typography>{reference}{ambiguous && <Typography component="span" variant="body2" color="warning.main">{t('matchesCount', { count: candidates.length })}</Typography>}{candidates.length === 0 && !inferred && <Typography component="span" variant="body2" color="text.secondary">{t('noAutoMatch')}</Typography>}{inferred && <Typography component="span" variant="body2" color="info.main">{t('partialMatch', { value: inferred })}</Typography>}</Typography>
                <FormControl size="small"><InputLabel>{t('valueLabel')}</InputLabel><Select label={t('valueLabel')} value={aliases[aliasKey] ?? inferred ?? ''} onChange={e => mapAlias(aliasKey, e.target.value)}><MenuItem value=""><em>{t('unresolved')}</em></MenuItem>{options.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</Select></FormControl>
              </Box>;
            })}
          </Box>;
        })}
      </Stack></Paper>}

      <Paper sx={{ p: 3 }}><Stack spacing={2}>
        <Typography variant="h5">{t('promptConstructorTitle')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('promptConstructorDescription', { tables: dataset.tables.map(tbl => tbl.name).join(', ') })}</Typography>
        <TextField label={t('promptLabel')} multiline minRows={6} value={promptDraft} onChange={e => setPromptDraft(e.target.value)} placeholder={t('promptPlaceholder')} fullWidth />
      </Stack></Paper>

      <Paper sx={{ p: 3 }}><Stack spacing={2}>
        <Typography variant="h5">{t('aiOutputTitle')}</Typography>
        {dataset.tables.map((tbl, ti) => <Box key={tbl.name}>
          <Typography fontWeight="bold" sx={{ mb: 1 }}>{tbl.name}</Typography>
          {tbl.schema.columns.filter(c => c.mode !== 'remove').map(column => <FormControlLabel key={column.name} control={<Checkbox checked={tbl.schema.output.some(o => o.name === column.name)} onChange={e => updateTableSchema(ti, s => {
            const exists = s.output.some(o => o.name === column.name);
            s.output = e.target.checked && !exists ? [...s.output, { name: column.name, source: column.mode === 'pseudonymize' ? 'pseudonym' : column.name }] : !e.target.checked ? s.output.filter(o => o.name !== column.name) : s.output;
            return s;
          })} />} label={column.name} />)}
          {tbl.schema.output.filter(o => !tbl.schema.columns.some(c => c.name === o.name)).map(field => <FormControlLabel key={field.name} control={<Checkbox checked onChange={() => updateTableSchema(ti, s => { s.output = s.output.filter(o => o.name !== field.name); return s; })} />} label={field.name} />)}
          <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1, maxWidth: 420 }}>
            <TextField size="small" label={t('aiFieldNameLabel')} placeholder="selected_food" inputRef={el => { newOutputFieldInputs.current[ti] = el; }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOutputField(ti); } }} helperText={t('aiFieldHelper')} fullWidth />
            <Button variant="outlined" size="small" onClick={() => addOutputField(ti)} startIcon={<AddRoundedIcon />} sx={{ mt: 0.25, flexShrink: 0 }}>{t('addField')}</Button>
          </Stack>
        </Box>)}
      </Stack></Paper>

      <Paper sx={{ p: 3 }}><Stack spacing={2}>
        <Typography variant="h5">{t('generatedPromptTitle')}</Typography>
        <Stack direction="row" spacing={1} alignItems="center"><Typography variant="body2" color="text.secondary">{t('aiReplyFormatLabel')}</Typography><ToggleButtonGroup size="small" exclusive value={format} onChange={(_, v: ResponseFormat | null) => v && setFormat(v)}><ToggleButton value="tsv">{t('formatTsvShort')}</ToggleButton><ToggleButton value="csv">{t('formatCsvShort')}</ToggleButton><ToggleButton value="psv">{t('formatPsvShort')}</ToggleButton><ToggleButton value="json">{t('formatJson')}</ToggleButton></ToggleButtonGroup></Stack>
        {referenceError ? <Alert severity="error">{t('promptBlocked')}</Alert> : <><TextField multiline minRows={8} value={prompt} InputProps={{ readOnly: true }} fullWidth /><Button variant="outlined" onClick={() => copy(prompt, 'prompt')}>{copied === 'prompt' ? t('copied') : t('copyPrompt')}</Button></>}
      </Stack></Paper>

      <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">{t('pasteAiResultTitle')}</Typography><TextField multiline minRows={7} value={aiResult} onChange={e => setAiResult(e.target.value)} fullWidth /><Button variant="contained" onClick={handleResolve}>{t('validateAndResolve')}</Button>{resolveError && <Alert severity="error">{resolveError}</Alert>}</Stack></Paper>
      {resolvedProjected && <Paper sx={{ p: 3 }}><Stack spacing={2}>
        <Typography variant="h5">{t('finalOutputTitle')}</Typography>
        <Stack direction="row" spacing={1} alignItems="center"><Typography variant="body2" color="text.secondary">{t('finalOutputFormatLabel')}</Typography><ToggleButtonGroup size="small" exclusive value={finalFormat} onChange={(_, v: FinalFormat | null) => v && setFinalFormat(v)}><ToggleButton value="json">{t('formatJson')}</ToggleButton><ToggleButton value="tsv">{t('formatTsvShort')}</ToggleButton><ToggleButton value="csv">{t('formatCsvShort')}</ToggleButton><ToggleButton value="psv">{t('formatPsvShort')}</ToggleButton></ToggleButtonGroup></Stack>
        <TextField multiline minRows={5} value={finalOutputText} InputProps={{ readOnly: true }} fullWidth />
        <Button variant="contained" onClick={() => copy(finalOutputText, 'result')}>{copied === 'result' ? t('copied') : t('copy')}</Button>
      </Stack></Paper>}
      <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">{t('cryptoshredTitle')}</Typography><Button color="error" variant="contained" onClick={handleShred}>{t('shredSession')}</Button></Stack></Paper>
    </>}
    <Box component="footer" sx={{ pt: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">{t('developedBy')} <Link href="https://github.com/jsilvanus" target="_blank" rel="noopener noreferrer">Juha Itäleino (@jsilvanus)</Link> · <Link href="https://github.com/jsilvanus/de-pseudo" target="_blank" rel="noopener noreferrer">{t('sourceOnGithub')}</Link></Typography>
      <Typography variant="body2" color="text.secondary">{t('licensedUnderThe')} <Link href="https://github.com/jsilvanus/de-pseudo/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">EUPL-1.2</Link></Typography>
    </Box>
  </Stack></Container>;
}
