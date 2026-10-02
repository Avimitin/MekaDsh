import { memo, useState, type ReactNode } from 'react';
import { IconChevronDownOutlineRegular } from '../icons/index';
import css from './TurnProcess.module.css';

/**
 * The settled-turn process fold (dsh's TurnProcessNodeView): a subtle
 * full-width button — "Worked for 12s", "Stopped", "Failed"; the caller
 * computes the label — that folds the turn's tool rows and other process
 * content. Tones: 'error' and 'warn' color the label with the state tokens.
 * @param props.summary - the settled label, duration included.
 * @param props.tone - neutral, error, or warn label coloring.
 * @param props.defaultOpen - initial fold state.
 * @param props.children - the folded process content.
 */
export const TurnProcess = memo(function TurnProcess({
  summary,
  tone = 'neutral',
  defaultOpen = false,
  children,
}: {
  summary: string;
  tone?: 'neutral' | 'error' | 'warn' | undefined;
  defaultOpen?: boolean | undefined;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <button
        type="button"
        className={css.root}
        data-open={open || undefined}
        data-tone={tone === 'neutral' ? undefined : tone}
        aria-expanded={open}
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen((value) => !value);
        }}
      >
        <span className={css.label}>{summary}</span>
        <IconChevronDownOutlineRegular className={css.chevron} />
      </button>
      {open && children}
    </>
  );
});
