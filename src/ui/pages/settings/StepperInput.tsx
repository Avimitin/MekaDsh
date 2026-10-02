// Port of mekaweb's PixelInput, styled as a dsh stepper pill: a draft number
// field where Enter commits, ArrowUp/ArrowDown step and commit, Escape reverts,
// and the − / + buttons commit immediately. An optional full-width fallback
// lets a blank field mean the layout fills its container.

import { useRef, useState } from 'react';
import css from './StepperInput.module.css';

export function StepperInput({
  id,
  label,
  value,
  step,
  min = 1,
  hint,
  fullWidthFallback,
  onCommit,
}: {
  id?: string | undefined;
  label: string;
  value: number | 'full';
  step: number;
  /** The lowest value; the default allows only sizes. */
  min?: number;
  /** Replaces the field's default tooltip. */
  hint?: string | undefined;
  fullWidthFallback?: number | undefined;
  onCommit: (value: number | 'full') => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<{ source: typeof value; text?: string }>({ source: value });
  // A replaced external value retires the old draft, even if that value returns later.
  if (draft.source !== value) setDraft({ source: value });
  const text =
    draft.source === value && draft.text !== undefined
      ? draft.text
      : value === 'full'
        ? ''
        : String(value);
  const full = fullWidthFallback !== undefined && text === '';
  const numeric = Number(text);

  function commit(delta = 0) {
    const node = input.current;
    if (!node?.reportValidity()) return;
    let next: number | 'full' = node.value === '' ? 'full' : node.valueAsNumber;
    if (delta) {
      next =
        next === 'full'
          ? (fullWidthFallback ?? min)
          : Math.max(min, Number((next + delta).toFixed(6)));
    }
    if (typeof next === 'number' && (!Number.isFinite(next) || next < min)) return;
    onCommit(next);
    setDraft({ source: value });
  }

  return (
    <div className={css.stepper}>
      <button
        type="button"
        className={css.stepButton}
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={!full && text !== '' && numeric <= min}
        onClick={() => commit(-step)}
      >
        <span aria-hidden="true" className={css.glyph}>−</span>
      </button>
      <div className={css.field}>
        <input
          ref={input}
          id={id}
          className={css.input}
          type="number"
          inputMode="decimal"
          enterKeyHint="done"
          min={min}
          step="any"
          required={fullWidthFallback === undefined}
          aria-label={label}
          title={
            hint ??
            (fullWidthFallback === undefined
              ? 'Size in pixels. Press Enter to apply.'
              : 'Width in pixels. Leave blank for full width. Press Enter to apply.')
          }
          placeholder={fullWidthFallback === undefined ? undefined : 'Full'}
          value={text}
          onChange={(event) => setDraft({ source: value, text: event.target.value })}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey)
              return;
            if (event.key === 'Enter' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              if (event.key === 'ArrowUp' && full) return;
              commit(event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0);
            } else if (event.key === 'Escape') {
              setDraft({ source: value });
            }
          }}
        />
        {!full && <span className={css.unit} aria-hidden="true">px</span>}
      </div>
      <button
        type="button"
        className={css.stepButton}
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={full}
        onClick={() => commit(step)}
      >
        <span aria-hidden="true" className={css.glyph}>+</span>
      </button>
    </div>
  );
}
