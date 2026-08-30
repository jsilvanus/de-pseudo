import { useMemo, useRef, useState } from 'react';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import type { InputRecord } from '../lib/core';

export type CellReference = { sourceRow: number; sourceColumn: string; targetRow: number; targetColumn: string };
type Point = { x: number; y: number };
type Props = { rows: InputRecord[]; referenceColumn: string; targetColumn: string; onChange: (references: CellReference[]) => void; references?: CellReference[] };

export function ReferenceEditor({ rows, referenceColumn, targetColumn, onChange, references = [] }: Props) {
  const [drag, setDrag] = useState<{ row: number; point: Point } | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const targetRows = useMemo(() => rows.map((row, rowIndex) => ({ row, rowIndex })), [rows]);

  const pointFor = (key: string): Point | null => {
    const el = cellRefs.current.get(key); const root = container;
    if (!el || !root) return null;
    const a = el.getBoundingClientRect(); const b = root.getBoundingClientRect();
    return { x: a.left - b.left, y: a.top - b.top + a.height / 2 };
  };
  const eventPoint = (e: React.PointerEvent): Point => {
    const b = container!.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  function start(e: React.PointerEvent, row: number) {
    e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const point = pointFor(`source-${row}`) ?? eventPoint(e); setDrag({ row, point }); setPointer(eventPoint(e));
  }
  function move(e: React.PointerEvent) { if (!drag) return; setPointer(eventPoint(e)); }
  function end(e: React.PointerEvent, targetRow?: number) {
    if (!drag) return;
    if (targetRow !== undefined && targetRow !== drag.row) {
      const next = references.filter(r => r.sourceRow !== drag.row);
      next.push({ sourceRow: drag.row, sourceColumn: referenceColumn, targetRow, targetColumn }); onChange(next);
    }
    setDrag(null); setPointer(null);
  }

  return <Paper variant="outlined" sx={{ p: 2 }}>
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Draw references</Typography>
      <Typography variant="body2" color="text.secondary">Drag the ↗ handle from a reference cell to the person it refers to. Works with mouse, touch and pen.</Typography>
      <Box ref={setContainer} onPointerMove={move} onPointerUp={e => end(e)} sx={{ position: 'relative', overflowX: 'auto', touchAction: 'none', pb: 1 }}>
        <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
          {references.map((r, i) => { const a = pointFor(`source-${r.sourceRow}`); const b = pointFor(`target-${r.targetRow}`); if (!a || !b) return null; const cx = (a.x + b.x) / 2; return <path key={`${r.sourceRow}-${r.targetRow}-${i}`} d={`M ${a.x} ${a.y} C ${cx} ${a.y}, ${cx} ${b.y}, ${b.x} ${b.y}`} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.65" />; })}
          {drag && pointer && <path d={`M ${drag.point.x} ${drag.point.y} C ${(drag.point.x + pointer.x) / 2} ${drag.point.y}, ${(drag.point.x + pointer.x) / 2} ${pointer.y}, ${pointer.x} ${pointer.y}`} fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="6 5" />}
        </svg>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 1fr)', gap: 2, position: 'relative', zIndex: 1 }}>
          <Box sx={{ fontWeight: 600 }}>{referenceColumn}</Box><Box sx={{ fontWeight: 600 }}>{targetColumn}</Box>
          {targetRows.map(({ row, rowIndex }) => <Box key={rowIndex} sx={{ display: 'contents' }}>
            <Box ref={el => { if (el) cellRefs.current.set(`source-${rowIndex}`, el); else cellRefs.current.delete(`source-${rowIndex}`); }} sx={{ border: '1px solid', borderColor: 'divider', p: 1, minHeight: 48, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'background.paper' }}>
              <Box sx={{ flex: 1 }}>{String(row[referenceColumn] ?? '')}</Box>
              <Button size="small" variant={drag?.row === rowIndex ? 'contained' : 'outlined'} sx={{ minWidth: 28, width: 28, height: 28, p: 0, borderRadius: '50%', cursor: 'grab' }} onPointerDown={e => start(e, rowIndex)} onPointerMove={move} onPointerUp={e => { e.stopPropagation(); end(e, undefined); }} aria-label={`Drag reference from row ${rowIndex + 1}`}>↗</Button>
            </Box>
            <Box ref={el => { if (el) cellRefs.current.set(`target-${rowIndex}`, el); else cellRefs.current.delete(`target-${rowIndex}`); }} onPointerUp={e => { e.stopPropagation(); end(e, rowIndex); }} sx={{ border: drag ? '2px dashed' : '1px solid', borderColor: drag ? 'primary.main' : 'divider', p: 1, minHeight: 48, display: 'flex', alignItems: 'center', cursor: drag ? 'crosshair' : 'default', bgcolor: 'background.paper' }}>{String(row[targetColumn] ?? '')}</Box>
          </Box>)}
        </Box>
      </Box>
      {references.length > 0 && <Stack direction="row" spacing={1} flexWrap="wrap">{references.map(r => <Chip key={`${r.sourceRow}-${r.targetRow}`} size="small" label={`${String(rows[r.sourceRow]?.[referenceColumn] ?? '')} → ${String(rows[r.targetRow]?.[targetColumn] ?? '')}`} onDelete={() => onChange(references.filter(x => x !== r))} />)}</Stack>}
      {drag && <Button size="small" onClick={() => { setDrag(null); setPointer(null); }}>Cancel reference</Button>}
    </Stack>
  </Paper>;
}
