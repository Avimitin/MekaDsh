import { memo, useEffect, useState } from 'react';
import { TextShimmer } from '../primitives/TextShimmer';
import css from './RunningStatus.module.css';

const CLOCK_INTERVAL_MS = 1000;

/** Whole-second elapsed label: minutes from 60s, hours from 60 minutes. */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const seconds = total % 60;
  let label = '';
  if (hours > 0) label += `${hours}h `;
  if (total >= 60) label += `${minutes}m `;
  return `${label}${seconds}s`;
}

/**
 * The live status under a running turn: a pulsing meka mark and a shimmering
 * "Working…" label with a whole-second elapsed clock ("Working for 5s"), or
 * "Compacting context…" while the turn is a compaction's. Mount only while
 * the session is running; ticks are not announced to assistive technology.
 * @param props.compacting - whether the running turn compacts the context.
 * @param props.startedAt - epoch ms the turn started; absent = no clock.
 */
export const RunningStatus = memo(function RunningStatus({
  compacting = false,
  startedAt,
}: {
  compacting?: boolean | undefined;
  startedAt?: number | undefined;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (startedAt === undefined) return;
    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
    }, CLOCK_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [startedAt]);
  const label = compacting
    ? 'Compacting context…'
    : startedAt === undefined
      ? 'Working…'
      : `Working for ${formatDuration(Math.max(1000, now - startedAt))}`;
  return (
    <div className={css.running} data-chat-running>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {compacting ? 'Compacting context' : 'Working'}
      </span>
      <span className={css.runningDivider} aria-hidden="true" />
      <span className={css.runningContent}>
        <img
          className={css.runningMark}
          src={`${import.meta.env.BASE_URL}meka.webp`}
          alt=""
          aria-hidden="true"
        />
        <TextShimmer active className={css.runningText}>
          {label}
        </TextShimmer>
      </span>
    </div>
  );
});
