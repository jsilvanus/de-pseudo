import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, Box, Button, Container, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { pseudonymize, formatPseudonymizedRows } from './domain/pseudonym/pseudonymize';
import type { Dataset } from './domain/dataset/types';
import { resolveText, findPseudonyms } from './domain/result/resolve';

const sample = `username\tdata\nJuha\twants icecream\nAnna\twants pizza`;

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
  const [shredded, setShredded] = useState(false);
  const pseudonymized = useMemo(() => dataset ? formatPseudonymizedRows(dataset.rows.map(({ pseudonym, data }) => ({ pseudonym, data }))) : '', [dataset]);

  const handlePseudonymize = () => {
    const rows = parseInput(input);
    if (!rows.length) return;
    setDataset(pseudonymize(rows));
    setResult('');
    setShredded(false);
  };

  const handleShred = () => {
    setDataset(null);
    setInput('');
    setPrompt('');
    setResult('');
    setShredded(true);
  };

  const resolved = dataset && result ? resolveText(result, dataset.mappings) : '';
  const known = dataset && result ? findPseudonyms(result, dataset.mappings) : [];

  return <Container maxWidth="md" sx={{ py: 5 }}>
    <Stack spacing={3}>
      <Box>
        <Typography variant="h3" fontWeight={700}>de-pseudo</Typography>
        <Typography color="text.secondary">Local-first prompt pseudonymization and cryptoshred.</Typography>
      </Box>
      {shredded && <Alert severity="info">Local personal data and the active mapping have been shredded. There is nothing to resolve.</Alert>}
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
            <TextField multiline minRows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} label="Instruction" fullWidth />
            <Button onClick={() => navigator.clipboard.writeText(`${pseudonymized}\n\n${prompt}`)}>Copy pseudonymized prompt</Button>
          </Stack>
        </Paper>
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h5">3. Result</Typography>
            <TextField multiline minRows={5} value={result} onChange={(e) => setResult(e.target.value)} placeholder="Paste the AI response here" fullWidth />
            <Typography variant="body2" color="text.secondary">Known pseudonyms found: {known.length}</Typography>
            {resolved && <TextField multiline minRows={5} value={resolved} InputProps={{ readOnly: true }} label="Resolved locally" fullWidth />}
          </Stack>
        </Paper>
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h5">4. Cryptoshred</Typography>
            <Typography color="text.secondary">Destroy the active identity mapping and local personal data. This action cannot be undone.</Typography>
            <Button color="error" variant="contained" onClick={handleShred}>Shred local data</Button>
          </Stack>
        </Paper>
      </>}
    </Stack>
  </Container>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
