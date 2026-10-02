/**
 * The slice of jsdiff's `structuredPatch` the diff card consumes: a line-based
 * unified diff between two texts, emitted as context hunks of `' '`/`'-'`/`'+'`
 * prefixed lines. The search is Myers' O(ND) greedy algorithm, so cost tracks
 * the edit distance rather than the input product, and the same
 * `maxEditLength` bound jsdiff honors abandons the search — the caller then
 * falls back to a whole-fragment replacement, exactly as it does when jsdiff
 * itself reports the comparison too large.
 */

/** One context hunk of a structured patch. */
export interface PatchHunk {
  /** The hunk's lines in old-file order: ` ` context, `-` removed, `+` added. */
  lines: string[];
}

/** Options for {@link structuredPatch}. */
export interface StructuredPatchOptions {
  /** Context lines kept around each change group; adjacent groups this close merge. */
  context: number;
  /** Abandon the search (return undefined) when the edit script exceeds this many changed lines. */
  maxEditLength: number;
}

/** Split into content lines; one trailing terminator is not an extra empty line. */
function splitLines(text: string): string[] {
  if (text === '') return [];
  const body = text.endsWith('\n') ? text.slice(0, -1) : text;
  return body.split('\n');
}

/** One step of the edit script, in old-file order with inserts after their deletes. */
type EditStep =
  | { type: 'keep'; line: string }
  | { type: 'del'; line: string }
  | { type: 'ins'; line: string };

/**
 * Myers' greedy edit-script search over lines. Returns the step list, or
 * undefined when the distance exceeds `maxDistance` (jsdiff's maxEditLength
 * bail) or the snapshot memory would be unreasonable for a card render.
 */
function editScript(oldLines: string[], newLines: string[], maxDistance: number): EditStep[] | undefined {
  const n = oldLines.length;
  const m = newLines.length;
  if (n === 0 && m === 0) return [];
  if (n === 0) return newLines.map((line): EditStep => ({ type: 'ins', line }));
  if (m === 0) return oldLines.map((line): EditStep => ({ type: 'del', line }));

  // Forward pass: the furthest x reached on each diagonal k after d steps.
  // One V snapshot per d lets the walk back recover the path.
  const max = n + m;
  const snapshots: Map<number, number>[] = [];
  let v = new Map<number, number>([[1, 0]]);
  let found = -1;
  outer: for (let d = 0; d <= Math.min(max, maxDistance); d++) {
    snapshots.push(new Map(v));
    const next = new Map<number, number>();
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1));
      let x = (down ? v.get(k + 1) : (v.get(k - 1) ?? 0) + 1) ?? 0;
      let y = x - k;
      while (x < n && y < m && oldLines[x] === newLines[y]) {
        x++;
        y++;
      }
      next.set(k, x);
      if (x >= n && y >= m) {
        found = d;
        snapshots.push(next);
        break outer;
      }
    }
    v = next;
  }
  if (found < 0) return undefined;

  // Walk the snapshots backwards, recovering the path as (keep/del/ins) steps.
  const steps: EditStep[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    // V after (d-1) steps: the state the d-th edit started from.
    const before = snapshots[d];
    if (before === undefined) return undefined;
    const k = x - y;
    const down = k === -d || (k !== d && (before.get(k - 1) ?? -1) < (before.get(k + 1) ?? -1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = before.get(prevK) ?? 0;
    const prevY = prevX - prevK;
    // The snake: shared lines walked back first, then the one edit of this d.
    while (x > prevX && y > prevY) {
      const line = oldLines[x - 1];
      if (line === undefined) return undefined;
      steps.push({ type: 'keep', line });
      x--;
      y--;
    }
    if (down) {
      const line = newLines[prevY];
      if (line === undefined) return undefined;
      steps.push({ type: 'ins', line });
      y--;
    } else {
      const line = oldLines[prevX];
      if (line === undefined) return undefined;
      steps.push({ type: 'del', line });
      x--;
    }
  }
  while (x > 0 && y > 0) {
    const line = oldLines[x - 1];
    if (line === undefined) return undefined;
    steps.push({ type: 'keep', line });
    x--;
    y--;
  }
  steps.reverse();
  // Myers recovers inserts and deletes interleaved along the path; jsdiff's
  // hunk shape wants every change group's deletes before its inserts. Reorder
  // within each maximal change run — the text each step carries is unchanged.
  const ordered: EditStep[] = [];
  let at = 0;
  while (at < steps.length) {
    const step = steps[at];
    if (step === undefined) break;
    if (step.type === 'keep') {
      ordered.push(step);
      at++;
      continue;
    }
    const run: EditStep[] = [];
    while (at < steps.length) {
      const change = steps[at];
      if (change === undefined || change.type === 'keep') break;
      run.push(change);
      at++;
    }
    ordered.push(...run.filter((s) => s.type === 'del'), ...run.filter((s) => s.type === 'ins'));
  }
  return ordered;
}

/**
 * Diff two texts into context hunks, mirroring jsdiff's `structuredPatch`
 * with `ignoreNewLineAtEof` behavior: both sides split into content lines,
 * changes group into hunks with `options.context` shared lines on each side,
 * and groups closer than twice the context merge into one hunk.
 * @param oldText - prior content (trailing newline optional).
 * @param newText - content after the change (trailing newline optional).
 * @param options - context size and the edit-length bound.
 * @returns the hunks, or undefined when the edit script exceeds the bound.
 */
export function structuredPatch(
  oldText: string,
  newText: string,
  options: StructuredPatchOptions,
): { hunks: PatchHunk[] } | undefined {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const steps = editScript(oldLines, newLines, options.maxEditLength);
  if (steps === undefined) return undefined;
  const { context } = options;
  const hunks: PatchHunk[] = [];
  let at = 0;
  while (at < steps.length) {
    // Skip keeps beyond the leading context of the next change group.
    if (steps[at]?.type === 'keep') {
      at++;
      continue;
    }
    const groupStart = Math.max(0, at - context);
    // Extend through changes and short keep-runs; a keep-run longer than
    // 2*context ends the group, its trailing context already counted.
    let end = at;
    let keepRun = 0;
    while (end < steps.length) {
      const step = steps[end];
      if (step === undefined) break;
      if (step.type === 'keep') {
        keepRun++;
        if (keepRun > 2 * context) {
          end -= keepRun - context;
          break;
        }
      } else {
        keepRun = 0;
      }
      end++;
    }
    if (end >= steps.length && keepRun > context) end = steps.length - (keepRun - context);
    hunks.push({
      lines: steps.slice(groupStart, end).map((step) =>
        (step.type === 'keep' ? ` ${step.line}` : step.type === 'del' ? `-${step.line}` : `+${step.line}`)
      ),
    });
    at = Math.max(end, at);
  }
  return { hunks };
}
