import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Container, FormControl, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import { pseudonymize, buildPrompt, parseJson, parseLines, validateResults, type ResponseFormat, type PseudonymizedDataset, type ParsedResult } from './lib/core';
import { SessionVault } from './domain/shred/sessionVault';
import { resolveResult } from './domain/result/resolveResult';

const vault = new SessionVault<PseudonymizedDataset>();

type RawRecord = Record<string, unknown>;

function parseInput(text: string): RawRecord[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.filter(v => v && typeof v === 'object') as RawRecord[];
  } catch { /* fall through to TSV */ }

  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split('\t').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split('\t');
    return Object.fromEntries(headers.map((header, i) => [header, values[i] ?? '']));
  });
}

export default function App() {
  const [input, setInput] = useState('username\tpreference\nAlice\ticecream\nBob\tpizza');
  const [dataset, setDataset] = useState<PseudonymizedDataset | null>(null);
  const [task, setTask] = useState('Make an order based on food preferences.');
  const [format, setFormat] = useState<ResponseFormat>('lines');
  const [aiResult, setAiResult] = useState('');
  const [resolved, setResolved] = useState('');
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    vault.restore().then(data => {
      if (data) { setDataset(data); setRestored(true); }
    }).catch(() => undefined);
  }, []);

  const pseudonymizedText = useMemo(() => dataset ? JSON.stringify(dataset.rows, null, 2) : '', [dataset]);

  async function handlePseudonymize() {
    try {
      setError(''); setResolved('');
      const records = parseInput(input);
      if (!records.length) throw new Error('Add at least one record.');
      const result = pseudonymize(records);
      await vault.create(result);
      setDataset(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not pseudonymize data.'); }
  }

  async function handleRestore() {
    try {
      const result = format === 'json' ? parseJson(aiResult) : parseLines(aiResult);
      if (!dataset) throw new Error('Create or restore a session first.');
      const validation = validateResults(result, dataset.rows.map(r => r.pseudonym));
      if (validation.unknown.length || validation.duplicatePseudonyms.length || validation.missingPseudonyms.length) {
        setError(`Result rejected: ${validation.unknown.length} unknown, ${validation.duplicatePseudonyms.length} duplicate, ${validation.missingPseudonyms.length} missing pseudonym(s).`);
        setResolved(''); return;
      }
      setError('');
      setResolved(resolveResult(aiResult, dataset.mapping));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not parse AI result.'); setResolved(''); }
  }

  async function handleShred() {
    await vault.shred();
    setDataset(null); setAiResult(''); setResolved(''); setRestored(false); setError('Session shredded.');
  }

  return <Container maxWidth="md" sx={{ py: 4 }}>
    <Stack spacing={3}>
      <Box><Typography variant="h3" component="h1">de-pseudo</Typography><Typography color="text.secondary">Pseudonymize before AI. Resolve locally. Shred when finished.</Typography></Box>
      {restored && <Alert severity="info">An encrypted local session was restored.</Alert>}
      {error && <Alert severity={error === 'Session shredded.' ? 'success' : 'error'}>{error}</Alert>}

      <Paper sx={{ p: 3 }}><Stack spacing={2}>
        <Typography variant="h5">1. Your data</Typography>
        <Typography variant="body2" color="text.secondary">Paste JSON array or tab-separated data. The username column is removed before the AI prompt is created.</Typography>
        <TextField multiline minRows={7} value={input} onChange={e => setInput(e.target.value)} label="Personal data" fullWidth />
        <Button variant="contained" onClick={handlePseudonymize}>Pseudonymize & save locally</Button>
      </Stack></Paper>

      {dataset && <>
        <Paper sx={{ p: 3 }}><Stack spacing={2}>
          <Typography variant="h5">2. Pseudonymized prompt</Typography>
          <TextField label="Task" value={task} onChange={e => setTask(e.target.value)} fullWidth />
          <FormControl fullWidth><InputLabel>Response format</InputLabel><Select label="Response format" value={format} onChange={e => setFormat(e.target.value as ResponseFormat)}><MenuItem value="lines">Simple lines</MenuItem><MenuItem value="json">JSON</MenuItem></Select></FormControl>
          <TextField multiline minRows={8} value={buildPrompt(pseudonymizedText, task, format)} InputProps={{ readOnly: true }} label="Copy this prompt to your AI" fullWidth />
          <Button variant="outlined" onClick={() => navigator.clipboard.writeText(buildPrompt(pseudonymizedText, task, format))}>Copy prompt</Button>
        </Stack></Paper>

        <Paper sx={{ p: 3 }}><Stack spacing={2}>
          <Typography variant="h5">3. Paste AI result</Typography>
          <TextField multiline minRows={7} value={aiResult} onChange={e => setAiResult(e.target.value)} label={format === 'json' ? 'JSON result' : 'Result'} fullWidth />
          <Button variant="contained" onClick={handleRestore}>Validate & resolve locally</Button>
        </Stack></Paper>

        {resolved && <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">4. Resolved result</Typography><TextField multiline minRows={5} value={resolved} InputProps={{ readOnly: true }} fullWidth /></Stack></Paper>}

        <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">5. Cryptoshred</Typography><Typography variant="body2" color="text.secondary">Shred removes the encrypted session and its key from local storage. The AI never receives the identity mapping.</Typography><Button color="error" variant="contained" onClick={handleShred}>Shred session</Button></Stack></Paper>
      </>}
    </Stack>
  </Container>;
}
