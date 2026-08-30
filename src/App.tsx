import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Container, FormControl, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import { pseudonymize, buildPrompt, parseJson, parseLines, validateResults, type ResponseFormat, type PseudonymizedDataset } from './lib/core';
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
  const [copied, setCopied] = useState<'prompt' | 'data' | 'result' | null>(null);

  useEffect(() => {
    vault.restore().then(data => {
      if (data) { setDataset(data); setRestored(true); }
    }).catch(() => undefined);
  }, []);

  const pseudonymizedText = useMemo(() => dataset ? JSON.stringify(dataset.rows, null, 2) : '', [dataset]);
  const prompt = useMemo(() => dataset ? buildPrompt(dataset.rows, task, format) : '', [dataset, task, format]);

  async function copy(text: string, kind: 'prompt' | 'data' | 'result') {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied(current => current === kind ? null : current), 1800);
  }

  async function handlePseudonymize() {
    try {
      setError(''); setResolved(''); setCopied(null);
      const records = parseInput(input);
      if (!records.length) throw new Error('Add at least one record.');
      const result = pseudonymize(records);
      await vault.create(result);
      setDataset(result);
      // Raw input is no longer needed by the UI. The encrypted local vault
      // retains only the mapping required for later local resolution.
      setInput('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not pseudonymize data.'); }
  }

  async function handleResolve() {
    try {
      if (!dataset) throw new Error('Create or restore a session first.');
      const result = format === 'json' ? parseJson(aiResult) : parseLines(aiResult);
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
    setDataset(null); setInput(''); setAiResult(''); setResolved(''); setRestored(false); setCopied(null); setError('Session shredded.');
  }

  return <Container maxWidth="md" sx={{ py: 4 }}>
    <Stack spacing={3}>
      <Box><Typography variant="h3" component="h1">de-pseudo</Typography><Typography color="text.secondary">Pseudonymize before AI. Resolve locally. Shred when finished.</Typography></Box>
      {restored && <Alert severity="info">An encrypted local session was restored. Your identity mapping remains local.</Alert>}
      {error && <Alert severity={error === 'Session shredded.' ? 'success' : 'error'}>{error}</Alert>}

      {!dataset && <Paper sx={{ p: 3 }}><Stack spacing={2}>
        <Typography variant="h5">1. Your data</Typography>
        <Typography variant="body2" color="text.secondary">Paste JSON array or tab-separated data. This field is cleared immediately after successful pseudonymization.</Typography>
        <TextField multiline minRows={7} value={input} onChange={e => setInput(e.target.value)} label="Personal data" fullWidth autoComplete="off" />
        <Button variant="contained" onClick={handlePseudonymize}>Pseudonymize & save locally</Button>
      </Stack></Paper>}

      {dataset && <>
        <Paper sx={{ p: 3 }}><Stack spacing={2}>
          <Typography variant="h5">1. Pseudonymized data</Typography>
          <Typography variant="body2" color="text.secondary">Safe to copy to an external AI: usernames have been removed and replaced with pseudonyms.</Typography>
          <TextField multiline minRows={7} value={pseudonymizedText} InputProps={{ readOnly: true }} fullWidth />
          <Button variant="outlined" onClick={() => copy(pseudonymizedText, 'data')}>{copied === 'data' ? 'Copied' : 'Copy pseudonymized data'}</Button>
        </Stack></Paper>

        <Paper sx={{ p: 3 }}><Stack spacing={2}>
          <Typography variant="h5">2. AI prompt</Typography>
          <TextField label="Task" value={task} onChange={e => setTask(e.target.value)} fullWidth />
          <FormControl fullWidth><InputLabel>Response format</InputLabel><Select label="Response format" value={format} onChange={e => setFormat(e.target.value as ResponseFormat)}><MenuItem value="lines">Simple lines</MenuItem><MenuItem value="json">JSON</MenuItem></Select></FormControl>
          <TextField multiline minRows={8} value={prompt} InputProps={{ readOnly: true }} label="Copy this prompt to your AI" fullWidth />
          <Button variant="outlined" onClick={() => copy(prompt, 'prompt')}>{copied === 'prompt' ? 'Copied' : 'Copy prompt'}</Button>
        </Stack></Paper>

        <Paper sx={{ p: 3 }}><Stack spacing={2}>
          <Typography variant="h5">3. Paste AI result</Typography>
          <Typography variant="body2" color="text.secondary">Only validated pseudonyms can be resolved to identities. The AI result stays local until you choose to resolve it.</Typography>
          <TextField multiline minRows={7} value={aiResult} onChange={e => setAiResult(e.target.value)} label={format === 'json' ? 'JSON result' : 'Result'} fullWidth autoComplete="off" />
          <Button variant="contained" onClick={handleResolve}>Validate & resolve locally</Button>
        </Stack></Paper>

        {resolved && <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">4. Resolved result</Typography><TextField multiline minRows={5} value={resolved} InputProps={{ readOnly: true }} fullWidth /><Button variant="outlined" onClick={() => copy(resolved, 'result')}>{copied === 'result' ? 'Copied' : 'Copy resolved result'}</Button></Stack></Paper>}

        <Paper sx={{ p: 3 }}><Stack spacing={2}><Typography variant="h5">5. Cryptoshred</Typography><Typography variant="body2" color="text.secondary">Shred permanently removes the encrypted local session and its key. After shredding, the identity mapping cannot be recovered by this app.</Typography><Button color="error" variant="contained" onClick={handleShred}>Shred session</Button></Stack></Paper>
      </>}
    </Stack>
  </Container>;
}
