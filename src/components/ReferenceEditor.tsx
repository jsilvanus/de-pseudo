import { useEffect, useRef, useState } from 'react';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import type { InputRecord } from '../lib/core';
import { useLanguage } from '../i18n/LanguageContext';

export type CellReference = { sourceRow: number; sourceColumn: string; targetRow: number; targetColumn: string };
type Point = { x: number; y: number };
type Props = { rows: InputRecord[]; columns: string[]; referenceColumns: string[]; pseudonymizedColumns: string[]; references?: CellReference[]; onChange: (references: CellReference[]) => void };

export function ReferenceEditor({ rows, columns, referenceColumns, pseudonymizedColumns, references = [], onChange }: Props) {
  const { t } = useLanguage();
  const [drag, setDrag] = useState<{ row: number; column: string; point: Point } | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [showLines, setShowLines] = useState(true);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const cells = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => { const f = () => setPointer(p => p); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const pointFor = (row: number, column: string): Point | null => { const el = cells.current.get(`${row}:${column}`); if (!el || !root) return null; const a = el.getBoundingClientRect(), b = root.getBoundingClientRect(); return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 }; };
  const point = (e: React.PointerEvent): Point => { const b = root!.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  function start(e: React.PointerEvent, row: number, column: string) { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const p = pointFor(row, column) ?? point(e); setDrag({ row, column, point: p }); setPointer(point(e)); }
  function move(e: React.PointerEvent) { if (drag) setPointer(point(e)); }
  function finish(e: React.PointerEvent, targetRow?: number, targetColumn?: string) { if (!drag) return; if (targetRow !== undefined && targetColumn && pseudonymizedColumns.includes(targetColumn) && !(targetRow === drag.row && targetColumn === drag.column)) { const next = references.filter(r => !(r.sourceRow === drag.row && r.sourceColumn === drag.column)); next.push({ sourceRow: drag.row, sourceColumn: drag.column, targetRow, targetColumn }); onChange(next); } setDrag(null); setPointer(null); }
  return <Paper variant="outlined" sx={{ p: 2 }}>
    <Stack spacing={1}><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="subtitle2">{t('referenceEditorTitle')}</Typography><Typography variant="body2" color="text.secondary">{t('referenceEditorDescription')}</Typography></Box><Button size="small" variant="outlined" onClick={() => setShowLines(v => !v)}>{showLines ? t('hideReferences') : t('showReferences')}</Button></Stack>
      <Box ref={setRoot} onPointerMove={move} onPointerUp={() => drag && finish({} as React.PointerEvent)} sx={{ position: 'relative', overflow: 'auto', touchAction: 'none', maxHeight: 520 }}>
        {showLines && <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3, overflow: 'visible' }}>
          {references.map((r, i) => { const a = pointFor(r.sourceRow, r.sourceColumn), b = pointFor(r.targetRow, r.targetColumn); if (!a || !b) return null; const cx = (a.x + b.x) / 2; return <path key={`${r.sourceRow}:${r.sourceColumn}:${r.targetRow}:${r.targetColumn}:${i}`} d={`M${a.x} ${a.y} C${cx} ${a.y},${cx} ${b.y},${b.x} ${b.y}`} fill="none" stroke="currentColor" strokeWidth="2.5" opacity=".7" />; })}
          {drag && pointer && <path d={`M${drag.point.x} ${drag.point.y} C${(drag.point.x + pointer.x) / 2} ${drag.point.y},${(drag.point.x + pointer.x) / 2} ${pointer.y},${pointer.x} ${pointer.y}`} fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="7 5" />}
        </svg>}
        <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(150px, 1fr))`, minWidth: Math.max(700, columns.length * 150), position: 'relative', zIndex: 2 }}>
          {columns.map(c => <Box key={`h-${c}`} sx={{ p: 1, fontWeight: 600, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>{c}</Box>)}
          {rows.flatMap((row, ri) => columns.map(c => { const isReference = referenceColumns.includes(c); const isTarget = pseudonymizedColumns.includes(c); return <Box key={`${ri}:${c}`} ref={(el: HTMLDivElement | null) => { if (el) cells.current.set(`${ri}:${c}`, el); else cells.current.delete(`${ri}:${c}`); }} onPointerUp={e => { if (isTarget && drag) { e.stopPropagation(); finish(e, ri, c); } }} sx={{ p: 1, minHeight: 48, borderBottom: '1px solid', borderRight: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', alignItems: 'center', gap: .5, outline: drag && isTarget ? '2px dashed' : undefined }}>
            <Box sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(row[c] ?? '')}</Box>{isReference && <Box component="button" onPointerDown={e => start(e, ri, c)} sx={{ border: 0, borderRadius: '50%', width: 26, height: 26, cursor: 'grab', bgcolor: 'transparent', fontSize: 18 }} aria-label={`Drag reference from ${c}, row ${ri + 1}`}>↗</Box>}
          </Box>; }))}
        </Box>
      </Box>
      {references.length > 0 && <Stack direction="row" spacing={1} flexWrap="wrap">{references.map(r => <Chip key={`${r.sourceRow}:${r.sourceColumn}:${r.targetRow}:${r.targetColumn}`} size="small" label={`${String(rows[r.sourceRow]?.[r.sourceColumn] ?? '')} → ${String(rows[r.targetRow]?.[r.targetColumn] ?? '')}`} onDelete={() => onChange(references.filter(x => x !== r))} />)}</Stack>}
    </Stack>
  </Paper>;
}
