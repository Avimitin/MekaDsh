import type { ToolCallView } from '../ToolRow';
import { diffLines, diffTotals } from './diff-lines';
import { inputString } from './tool-content';
import css from './toolviews.module.css';

/**
 * file_edit's expanded body: the edited path above a line diff of the call's
 * old and new strings, with the +/- totals in the header (dsh's DiffBlock
 * anatomy on the platform diff tokens).
 */
export function DiffView({ call }: { call: ToolCallView }) {
  const path = inputString(call.input, 'path');
  const oldString = inputString(call.input, 'old_string') ?? '';
  const newString = inputString(call.input, 'new_string') ?? '';
  const lines = diffLines(oldString, newString);
  const totals = diffTotals(lines);
  return (
    <div className={css.card}>
      <div className={css.cardTitle}>
        {path !== undefined && <span className={css.diffPath}>{path}</span>}
        <span className={css.diffTotals}>
          <span className={css.diffAdded}>+{totals.added}</span>{' '}
          <span className={css.diffRemoved}>−{totals.removed}</span>
        </span>
      </div>
      <div className={css.diffBody} role="group" aria-label="Changes" tabIndex={0}>
        {lines.map((line, index) => (
          <div className={css.diffLine} data-kind={line.kind} key={index}>
            <span className={css.diffMarker} aria-hidden="true">
              {line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}
            </span>
            <span className={css.diffText}>{line.text === '' ? ' ' : line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
