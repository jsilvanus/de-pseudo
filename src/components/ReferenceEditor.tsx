import { useMemo, useState } from 'react';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import type { InputRecord } from '../lib/core';

export type CellReference = { sourceRow: number; sourceColumn: string; targetRow: number; targetColumn: string };

type Props = { rows: InputRecord[]; referenceColumn: string; targetColumn: string; onChange: (references: CellReference[]) => void; references?: CellReference[] };

export function ReferenceEditor({ rows, referenceColumn, targetColumn, onChange, references = [] }: Props) {
  const [source, setSource] = useState<{ row: number; column: string } | null>(null);
  const targetRows = useMemo(() => rows.map((row, rowIndex) => ({ row, rowIndex })), [rows]);

  function begin(row: number) { setSource({ row, column: referenceColumn }); }
  function connect(targetRow: number) {
    if (!source || targetColumn === referenceColumn) return;
    const next = references.filter(r => !(r.sourceRow === source.row && r.sourceColumn === source.column));
    next.push({ sourceRow: source.row, sourceColumn: source.column, targetRow, targetColumn });
    onChange(next); setSource(null);
  }

  return <Paper variant="outlined" sx={{ p: 2 }}>
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Draw references</Typography>
      <Typography variant="body2" color="text.secondary">Click the small reference handle on a cell, then click the person it refers to. The mapping stays local.</Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: `120px repeat(${rows.length ? 1 : 0}, minmax(180px, 1fr))`, gap: 1, minWidth: 420 }}>
          <Box sx={{ fontWeight: 600 }}>{referenceColumn}</Box><Box sx={{ fontWeight: 600 }}>{targetColumn}</Box>
          {targetRows.map(({ row, rowIndex }) => <Box key={rowIndex} sx={{ display: 'contents' }}>
            <Box sx={{ border: '1px solid', borderColor: 'divider', p: 1, position: 'relative' }}>
              {String(row[referenceColumn] ?? '')}
              <Button size="small" variant={source?.row === rowIndex ? 'contained' : 'outlined'} sx={{ minWidth: 24, width: 24, height: 24, p: 0, ml: 1, borderRadius: '50%' }} onClick={() => begin(rowIndex)} aria-label={`Reference from row ${rowIndex + 1}`}>↗</Button>
              {references.filter(r => r.sourceRow === rowIndex).map(r => <Chip key={`${r.targetRow}-${r.targetColumn}`} size="small" label={`→ ${String(rows[r.targetRow]?.[r.targetColumn] ?? '')}`} onDelete={() => onChange(references.filter(x => x !== r))} sx={{ ml: 1 }} />)}
            </Box>
            <Box onClick={() => connect(rowIndex)} sx={{ border: source ? '2px dashed' : '1px solid', borderColor: source ? 'primary.main' : 'divider', p: 1, cursor: source ? 'crosshair' : 'default' }}>{String(row[targetColumn] ?? '')}</Box>
          </Box>)}
        </Box>
      </Box>
      {source && <Button size="small" onClick={() => setSource(null)}>Cancel reference</Button>}
    </Stack>
  </Paper>;
}
