import { sessionPath, type Schema } from '../../api/client';
import { useResource } from '../../connections/context';
import css from './ContextMeter.module.css';

/**
 * Context-occupancy meter for the docked composer: a slim 4px bar filled to
 * the window's used percent (business primary, warn color once occupancy
 * reaches the auto-compaction threshold) plus a caption with the reading and
 * the session's turn count. Every field is optional server-side, so the meter
 * renders only what exists and nothing at all without data.
 */
export function ContextMeter({ sessionId }: { sessionId: string }) {
  const context = useResource<Schema['ContextResponse']>(
    sessionPath(sessionId) + '/context',
    undefined,
    true,
    5000,
  );
  const data = context.data;
  if (!data) return null;
  const percent = typeof data.used_percent === 'number' ? data.used_percent : undefined;
  const turns = data.totals?.turns;
  const warn =
    percent !== undefined &&
    typeof data.compact_at_percent === 'number' &&
    percent >= data.compact_at_percent;
  const caption = [
    percent !== undefined ? `${String(percent)}% of context` : '',
    typeof turns === 'number' ? `${String(turns)} turns` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  if (percent === undefined && !caption) return null;
  return (
    <span className={css.root}>
      {percent !== undefined && (
        <span className={css.bar} aria-hidden="true">
          <span
            className={css.fill}
            style={{ width: `${String(Math.min(100, Math.max(0, percent)))}%` }}
            {...(warn ? { 'data-warn': '' } : {})}
          />
        </span>
      )}
      {caption && <span className={css.caption}>{caption}</span>}
    </span>
  );
}
