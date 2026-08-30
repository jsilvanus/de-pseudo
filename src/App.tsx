import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Checkbox, Container, FormControl, FormControlLabel, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import { pseudonymize, applySchema, buildPrompt, parseSessionResponse, validateResults, projectOutput, defaultSchema, type DatasetSchema, type ResponseFormat, type PseudonymizedDataset } from './lib/core';
import { SessionVault } from './domain/shred/sessionVault';
import { resolveResult } from './domain/result/resolveResult';

const vault = new SessionVault<PseudonymizedDataset>();
type RawRecord = Record<string, any>;

function parseInput(text: string): RawRecord[] {
  const trimmed = text.trim(); if (!trimmed) return [];
  try { const parsed = JSON.parse(trimmed); if (Array.isArray(parsed)) return parsed.filter(v => v && typeof v === 'object'); } catch { /* TSV fallback */ }
  const lines = trimmed.split(/\r?\n/).filter(Boolean); const headers = lines[0].split('\t').map(h => h.trim());
  return lines.slice(1).map(line => Object.fromEntries(headers.map((header, i) => [header, line.split('\t')[i] ?? ''])));
}

export default function App() {
  const [input, setInput] = useState('username\tpreference\tfriend\nAlice\ticecream\tBob\nBob\tpizza\tAlice');
  const [dataset, setDataset] = useState<PseudonymizedDataset | null>(null);
  const [schema, setSchema] = useState<DatasetSchema | null>(null);
  const [task, setTask] = useState('Make an order based on food preferences.');
  const [format, setFormat] = useState<ResponseFormat>('lines');
  const [aiResult, setAiResult] = useState(''); const [resolved, setResolved] = useState(''); const [error, setError] = useState('');
  const [restored, setRestored] = useState(false); const [copied, setCopied] = useState<'prompt' | 'data' | 'result' | null>(null);

  useEffect(() => { vault.restore().then(data => { if (data) { setDataset(data); setSchema(data.schema ?? null); setRestored(true); } }).catch(() => undefined); }, []);
  const pseudonymizedText = useMemo(() => dataset ? JSON.stringify(dataset.rows, null, 2) : '', [dataset]);
  const promptRows = useMemo(() => dataset && schema ? applySchema(Object.values(dataset.mapping), dataset.rows.map(r => r.pseudonym), schema) : dataset?.rows ?? [], [dataset, schema]);
  const prompt = useMemo(() => dataset && vault.sessionId ? buildPrompt(promptRows, task, format, vault.sessionId, schema ?? undefined) : '', [dataset, promptRows, task, format, schema]);

  async function copy(text: string, kind: 'prompt' | 'data' | 'result') { await navigator.clipboard.writeText(text); setCopied(kind); window.setTimeout(() => setCopied(c => c === kind ? null : c), 1800); }
  function updateSchema(fn: (s: DatasetSchema) => DatasetSchema) { setSchema(s => s ? fn(structuredClone(s)) : s); }

  async function handlePseudonymize() {
    try {
      setError(''); setResolved(''); const records = parseInput(input); if (!records.length) throw new Error('Add at least one record.');
      const base = pseudonymize(records); const nextSchema = defaultSchema(records);
      const rows = applySchema(records, base.rows.map(r => r.pseudonym), nextSchema);
      const result = { ...base, rows, schema: nextSchema }; await vault.create(result);
      setDataset(result); setSchema(nextSchema); setInput('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not pseudonymize data.'); }
  }

  async function handleResolve() {
    try {
      if (!dataset || !schema || !vault.sessionId) throw new Error('Create or restore a session first.');
      const result = parseSessionResponse(aiResult, format, vault.sessionId); const validation = validateResults(result, dataset.rows.map(r => r.pseudonym));
      if (validation.unknown.length || validation.duplicatePseudonyms.length || validation.missingPseudonyms.length) throw new Error(`Result rejected: ${validation.unknown.length} unknown, ${validation.duplicatePseudonyms.length} duplicate, ${validation.missingPseudonyms.length} missing pseudonym(s).`);
      const projected = projectOutput(result, schema.output); setError(''); setResolved(JSON.stringify(resolveResult(JSON.stringify(projected), dataset.mapping), null, 2));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not validate AI result.'); setResolved(''); }
  }

  async function handleShred() { await vault.shred(); setDataset(null); setSchema(null); setInput(''); setAiResult(''); setResolved(''); setRestored(false); setCopied(null); setError('Session shredded.'); }

  return <Container maxWidth="md" sx={{ py: 4 }}><Stack spacing={3}>
    <Box><Typography variant="h3">de-pseudo</Typography><Typography color="text.secondary">Pseudonymize before AI. Resolve locally. Shred when finished.</Typography></Box>
    {restored && <Alert severity="info">Encrypted local session restored. Identity mapping remains local.</Alert>}
    {error && <Alert severity={error === 'Session shredded.' ? 'success' : 'error'}>{error}</Alert>}
    {!dataset && <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">1. Your data</Typography><TextField multiline minRows={7} value={input} onChange={e => setInput(e.target.value)} label="Personal data" fullWidth autoComplete="off" /><Button variant="contained" onClick={handlePseudonymize}>Pseudonymize & save locally</Button></Stack></Paper>}
    {dataset && schema && <>
      <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">1. Privacy & columns</Typography><Typography variant="body2" color="text.secondary">Choose what the AI receives. Identity mappings and original values remain in the encrypted local vault.</Typography>
        {schema.columns.map((column, i) => <Box key={column.name} sx={{ display: 'grid', gridTemplateColumns: 'minmax(100px,1fr) minmax(150px,1fr) auto', gap: 1, alignItems: 'center' }}>
          <Typography>{column.name}</Typography><FormControl size="small"><InputLabel>Mode</InputLabel><Select label="Mode" value={column.mode} onChange={e => updateSchema(s => { s.columns[i].mode = e.target.value as any; return s; })}><MenuItem value="keep">Keep</MenuItem><MenuItem value="pseudonymize">Pseudonymize</MenuItem><MenuItem value="reference">Reference</MenuItem><MenuItem value="remove">Remove</MenuItem></Select></FormControl>
          {column.mode === 'reference' ? <FormControl size="small"><InputLabel>Target</InputLabel><Select label="Target" value={column.referenceTarget ?? 'username'} onChange={e => updateSchema(s => { s.columns[i].referenceTarget = e.target.value; return s; })}>{schema.columns.filter(c => c.mode === 'pseudonymize').map(c => <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>)}</Select></FormControl> : <span />}
        </Box>)}
      </Stack></Paper>
      <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">2. AI output</Typography><Typography variant="body2" color="text.secondary">Select only the fields you want the AI to return.</Typography>
        {schema.columns.filter(c => c.mode !== 'remove').map(column => <FormControlLabel key={column.name} control={<Checkbox checked={schema.output.some(o => o.name === column.name)} onChange={e => updateSchema(s => { const exists = s.output.some(o => o.name === column.name); s.output = e.target.checked && !exists ? [...s.output, { name: column.name, source: column.name === 'username' ? 'pseudonym' : column.name }] : !e.target.checked ? s.output.filter(o => o.name !== column.name) : s.output; return s; })} />} label={column.name} />)}
        <TextField label="AI-generated output field name" placeholder="selected_food" onKeyDown={e => { if (e.key === 'Enter') { const name = (e.target as HTMLInputElement).value.trim(); if (name) { updateSchema(s => { if (!s.output.some(o => o.name === name)) s.output.push({ name }); return s; }); (e.target as HTMLInputElement).value = ''; } } }} helperText="Press Enter to add a new AI-generated field" />
      </Stack></Paper>
      <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">3. Pseudonymized data</Typography><TextField multiline minRows={6} value={JSON.stringify(promptRows, null, 2)} InputProps={{ readOnly: true }} fullWidth /><Button variant="outlined" onClick={() => copy(JSON.stringify(promptRows, null, 2), 'data')}>{copied === 'data' ? 'Copied' : 'Copy pseudonymized data'}</Button></Stack></Paper>
      <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">4. AI prompt</Typography><TextField label="Task" value={task} onChange={e => setTask(e.target.value)} fullWidth /><FormControl fullWidth><InputLabel>Response format</InputLabel><Select label="Response format" value={format} onChange={e => setFormat(e.target.value as ResponseFormat)}><MenuItem value="lines">Simple lines</MenuItem><MenuItem value="json">JSON</MenuItem></Select></FormControl><TextField multiline minRows={8} value={prompt} InputProps={{ readOnly: true }} fullWidth /><Button variant="outlined" onClick={() => copy(prompt, 'prompt')}>{copied === 'prompt' ? 'Copied' : 'Copy prompt'}</Button></Stack></Paper>
      <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">5. Paste AI result</Typography><TextField multiline minRows={7} value={aiResult} onChange={e => setAiResult(e.target.value)} fullWidth /><Button variant="contained" onClick={handleResolve}>Validate & resolve locally</Button></Stack></Paper>
      {resolved && <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">6. Resolved result</Typography><TextField multiline minRows={5} value={resolved} InputProps={{ readOnly: true }} fullWidth /><Button variant="outlined" onClick={() => copy(resolved, 'result')}>{copied === 'result' ? 'Copied' : 'Copy resolved result'}</Button></Stack></Paper>}
      <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">7. Cryptoshred</Typography><Typography color="text.secondary">Permanently remove the encrypted session and key.</Typography><Button color="error" variant="contained" onClick={handleShred}>Shred session</Button></Stack></Paper>
    </>}
  </Stack></Container>;
}
