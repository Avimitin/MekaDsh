export interface DiffLine {
  kind: 'context' | 'added' | 'removed';
  text: string;
}

/** Past this many combined lines the LCS table is not worth its memory. */
const MAX_LCS_LINES = 400;

function fallback(oldLines: string[], newLines: string[]): DiffLine[] {
  return [
    ...oldLines.map((text): DiffLine => ({ kind: 'removed', text })),
    ...newLines.map((text): DiffLine => ({ kind: 'added', text })),
  ];
}

/**
 * Line-level LCS diff of an edit's old and new strings: context, removed, and
 * added rows in file order. Large inputs degrade to a removed block followed
 * by an added block rather than allocating a quadratic table.
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText === '' ? [] : oldText.split('\n');
  const newLines = newText === '' ? [] : newText.split('\n');
  if (oldLines.length === 0) return newLines.map((text): DiffLine => ({ kind: 'added', text }));
  if (newLines.length === 0) return oldLines.map((text): DiffLine => ({ kind: 'removed', text }));
  if (oldLines.length + newLines.length > MAX_LCS_LINES) return fallback(oldLines, newLines);

  const rows = oldLines.length;
  const columns = newLines.length;
  // lengths[i][j]: LCS length of oldLines[i:] and newLines[j:], built bottom-up.
  const lengths: Uint32Array[] = Array.from({ length: rows + 1 }, () => new Uint32Array(columns + 1));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = columns - 1; j >= 0; j--) {
      lengths[i]![j] =
        oldLines[i] === newLines[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < columns) {
    if (oldLines[i] === newLines[j]) {
      lines.push({ kind: 'context', text: oldLines[i]! });
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      lines.push({ kind: 'removed', text: oldLines[i]! });
      i++;
    } else {
      lines.push({ kind: 'added', text: newLines[j]! });
      j++;
    }
  }
  while (i < rows) lines.push({ kind: 'removed', text: oldLines[i++]! });
  while (j < columns) lines.push({ kind: 'added', text: newLines[j++]! });
  return lines;
}

/** The +/- totals a diff row summarizes with. */
export function diffTotals(lines: readonly DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === 'added') added++;
    else if (line.kind === 'removed') removed++;
  }
  return { added, removed };
}
