import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, Box, Button, Container, Paper, Stack, TextField, Typography } from '@mui/material';
import { pseudonymize, formatPseudonymizedRows } from './domain/pseudonym/pseudonymize';
import type { Dataset } from './domain/dataset/types';
import { resolveText, findPseudonyms } from './domain/result/resolve';
import { SessionVault } from './domain/shred/sessionVault';

const sample = `username\tdata\nJuha\twants icecream\nAnna\twants pizza`;

type Session = {
  input: string;
  dataset: Dataset | null;
  prompt: string;
  result: string;
};

function parseInput(value: string) {
  const lines = value.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const separator = lines[0].includes('\t') ? '\t' : '|';
  const headers = lines[0].split(separator).map((x) => x.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(separator).map((x) => x.trim());
    return {
      identity: cells[0] ?? '',
      data: Object.fromEntries(headers.slice(1).map((header, i) => [header, cells[i + 1] ?? ''])),
    };
  }).filter((row) => row.identity);
}

function App() {
  const [input, setInput] = useState(sample);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [prompt, setPrompt] = useState('Make an order based on the food preferences.');
  const [result, setResult] = useState('');
  const [vault] = useState(() => new SessionVault<Session>());
  const [restoring, setRestoring] = useState(true);
  const [shredded, setShredded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    vault.restore().then((restored) => {
      if (!active) return;
      if (restored) {
        setInput(restored.input);
        setDataset(restored.dataset);
        setPrompt(restored.prompt);
        setResult(restored.result);
      }
      setRestoring(false);
    }).catch(() => {
      if (active) {
        setError('Could not restore the encrypted local session.');
        setRestoring(false);
      }
    });
    return () => { active = false; };
  }, [vault]);

  const pseudonymized = useMemo(() => dataset
    ? formatPseudonymizedRows(dataset.rows.map(({ pseudonym, data }) => ({ pseudonym, data })))
    : '', [dataset]);

  const saveSession = async (next: Session) => {
    try {
      await vault.update(next);
      setError(null);
    } catch {
      setError('Could not save the encrypted local session.');
    }
  };

  const handlePseudonymize = async () => {
    const rows = parseInput(input);
    if (!rows.length) {
      setError('Enter at least one data row.');
      return;
    }
    const nextDataset = pseudonymize(rows);
    const next = { input, dataset: nextDataset, prompt, result: '' };
    setDataset(nextDataset);
    setResult('');
    setShredded(false);
    await saveSession(next);
  };

  const handleShred = async () => {
    try {
      await vault.shred();
      setDataset(null);
      setInput('');
      setPrompt('');
      setResult('');
      setShredded(true);
      setError(null);
    } catch {
      setError('Cryptoshred failed. Local state was not cleared.');
    }
  };

  const handlePromptChange = async (value: string) => {
    setPrompt(value);
    if (dataset) await saveSession({ input, dataset, prompt: value, result });
  };

  const handleResultChange = async (value: string) => {
    setResult(value);
    if (dataset) await saveSession({ input, dataset, prompt, result: value });
  };

  const resolved = dataset && result ? resolveText(result, dataset.mappings) : '';
  const known = dataset && result ? findPseudonyms(result, dataset.mappings) : [];

  if (restoring) {
    return <Container maxWidth="md" sx={{ py: 8 }}><Typography>Restoring encrypted local session…</Typography></Container>;
  }

  return <Container maxWidth="md" sx={{ py: 5 }}>
    <Stack spacing={3}>
      <Box>
        <Typography variant="h3" fontWeight={700}>de-pseudo</Typography>
        <Typography color="text.secondary">Local-first prompt pseudonymization and cryptoshred.</Typography>
        <Typography variant="caption" color="text.secondary">{vault.active ? 'Encrypted local session active' : 'No persistent session'}</Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {shredded && <Alert severity="info">The encrypted local session, key reference, and active personal data have been shredded.</Alert>}
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h5">1. Dataset</Typography>
          <Typography variant="body2" color="text.secondary">Paste a table. First column is treated as the identity; remaining columns are retained as prompt data.</Typography>
          <TextField multiline minRows={7} value={input} onChange={(e) => setInput(e.target.value)} placeholder="username\tpreference" fullWidth />
          <Button variant="contained" onClick={handlePseudonymize}>Pseudonymize locally</Button>
        </Stack>
      </Paper>
      {dataset && <>
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h5">2. Prompt</Typography>
            <TextField multiline minRows={5} value={pseudonymized} InputProps={{ readOnly: true }} fullWidth />
            <TextField multiline minRows={3} value={prompt} onChange={(e) => void handlePromptChange(e.target.value)} label="Instruction" fullWidth />
            <Button onClick={() => navigator.clipboard.writeText(`${pseudonymized}\n\n${prompt}`)}>Copy pseudonymized prompt</Button>
          </Stack>
        </Paper>
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h5">3. Result</Typography>
            <TextField multiline minRows={5} value={result} onChange={(e) => void handleResultChange(e.target.value)} placeholder="Paste the AI response here" fullWidth />
            <Typography variant="body2" color="text.secondary">Known pseudonyms found: {known.length}</Typography>
            {resolved && <TextField multiline minRows={5} value={resolved} InputProps={{ readOnly: true }} label="Resolved locally" fullWidth />}
          </Stack>
        </Paper>
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h5">4. Cryptoshred</Typography>
            <Typography color="text.secondary">Destroy the encrypted local session and its key reference. This action cannot be undone.</Typography>
            <Button color="error" variant="contained" onClick={() => void handleShred()}>Shred local data</Button>
          </Stack>
        </Paper>
      </>}
    </Stack>
  </Container>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
