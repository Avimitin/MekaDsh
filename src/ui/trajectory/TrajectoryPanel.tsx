import { memo, useDeferredValue, useId, useMemo, useState } from 'react';
import { useConnection } from '../../connections/context';
import type { SessionState } from '../../session/controller';
import { IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconCopyOutlineRegular, IconSearchOutlineRegular } from '../icons';
import { Button } from '../primitives/Button';
import { useCopyFeedback } from '../primitives/use-copy-feedback';
import { filterRecords, inspectJson, kindLabels, recordKinds, trajectoryRecords, type RecordKind, type TrajectoryRecord } from './records';
import css from './TrajectoryPanel.module.css';

/** An ordered execution inspector, adapted from Harness ui-trajectory's toolbar and step cells.
 * The meka transcript provides order and persistence timestamps, but not a timing trace. */
export function TrajectoryPanel({ state }: { state: SessionState }) {
  return <SessionTrajectory key={state.id} state={state} />;
}

function SessionTrajectory({ state }: { state: SessionState }) {
  const { controller } = useConnection();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<RecordKind | 'all'>('all');
  const [failedOnly, setFailedOnly] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const records = useMemo(() => trajectoryRecords(state), [state]);
  const filtered = useMemo(() => filterRecords(records, deferredQuery, kind, failedOnly),
    [records, deferredQuery, kind, failedOnly]);
  const counts = useMemo(() => {
    const counts = new Map<RecordKind, number>();
    for (const record of records) counts.set(record.kind, (counts.get(record.kind) ?? 0) + 1);
    return counts;
  }, [records]);
  const indexes = useMemo(() => new Map(records.map((record, index) => [record.key, index + 1])), [records]);
  const allExpanded = filtered.length > 0 && filtered.every((record) => open.has(record.key));
  const loadEarlier = async () => {
    if (!controller || loadingEarlier) return;
    setLoadingEarlier(true);
    try { await controller.earlier(state.id); } finally { setLoadingEarlier(false); }
  };

  return (
    <section className={css.root} aria-label="Execution activity">
      <div className={css.toolbar}>
        <label className={css.search}>
          <IconSearchOutlineRegular size={16} />
          <span className="sr-only">Search activity</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Search activity…" className={css.searchInput} />
        </label>
        <div className={css.controls}>
          <div className={css.filterLabel}>
            <select aria-label="Activity type" className={css.filter} value={kind} onChange={(event) => setKind(event.target.value as RecordKind | 'all')}>
              <option value="all">All types ({records.length})</option>
              {recordKinds.map((item) => <option key={item} value={item}>{kindLabels[item]} ({counts.get(item) ?? 0})</option>)}
            </select>
          </div>
          <label className={css.errors}>
            <input type="checkbox" checked={failedOnly} onChange={(event) => setFailedOnly(event.target.checked)} />
            Errors only
          </label>
        </div>
        <div className={css.controls}>
          <button className={css.action} type="button" disabled={!filtered.length}
            onClick={() => setOpen(allExpanded ? new Set() : new Set(filtered.map((record) => record.key)))}>
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </button>
          <button className={css.action} type="button" aria-pressed={wrap} onClick={() => setWrap(!wrap)}>Wrap lines</button>
          <span className={css.count} role="status" aria-live="polite">{filtered.length} of {records.length} records</span>
        </div>
      </div>
      <div className={css.body}>
        {state.offset > 0 && <Button size="sm" variant="outline" disabled={loadingEarlier || !controller || state.loading}
          onClick={() => void loadEarlier()}>{loadingEarlier ? 'Loading…' : `Load earlier messages (${state.offset})`}</Button>}
        {state.error && <p className={css.warning} role="alert">{state.error.message}</p>}
        {state.partial && <p className={css.warning}>Some live activity may be missing. Saved history is shown when available.</p>}
        <p className={css.note}>Conversation order. Times show when messages were saved, not execution duration.</p>
        {!filtered.length && <p className={css.empty}>
          {state.loading && !records.length ? 'Loading activity…' : records.length ? 'No matching activity.' : 'Activity will appear when this conversation starts.'}
        </p>}
        <ol className={css.records}>
          {filtered.map((record) => <RecordCard key={record.key} record={record} index={indexes.get(record.key)!}
            open={open.has(record.key)} wrap={wrap} onToggle={() => setOpen((current) => {
              const next = new Set(current);
              if (next.has(record.key)) next.delete(record.key); else next.add(record.key);
              return next;
            })} />)}
        </ol>
      </div>
    </section>
  );
}

const RecordCard = memo(function RecordCard({ record, index, open, wrap, onToggle }: {
  record: TrajectoryRecord; index: number; open: boolean; wrap: boolean; onToggle: () => void;
}) {
  const detailId = useId();
  return (
    <li className={css.record} data-kind={record.kind} data-failed={record.failed || undefined}>
      <button type="button" className={css.summary} aria-expanded={open} aria-controls={detailId} onClick={onToggle}>
        <span className={css.index} aria-hidden>{index}</span>
        <span className={css.summaryText}>
          <span className={css.heading}><span className={css.tag}>{kindLabels[record.kind]}</span>
            {record.kind === 'tool' && <span className={css.toolName}>{record.title}</span>}
            <span className={css.status}>{record.status}</span>
          </span>
          <span className={css.preview}>{record.preview || record.title}</span>
        </span>
        <IconChevronDownOutlineRegular size={14} className={css.chevron} />
      </button>
      <div id={detailId} hidden={!open}>
        {open && <RecordDetails record={record} wrap={wrap} />}
      </div>
    </li>
  );
});

function RecordDetails({ record, wrap }: { record: TrajectoryRecord; wrap: boolean }) {
  const raw = useMemo(() => inspectJson(record.raw), [record.raw]);
  const [showRaw, setShowRaw] = useState(false);
  const rawId = useId();
  return (
    <div className={css.details}>
      {record.timestamp && <p className={css.time}>{record.timestampLabel ?? 'Saved'}{' '}
        <time dateTime={record.timestamp}>{new Date(record.timestamp).toLocaleString()}</time>
      </p>}
      {record.sections.map((section, index) => <TextSection key={`${section.label}:${index}`} label={section.label} text={section.text} wrap={wrap} />)}
      <button className={css.action} type="button" aria-expanded={showRaw} aria-controls={rawId} onClick={() => setShowRaw(!showRaw)}>
        {showRaw ? 'Hide record JSON' : 'Inspect record JSON'}
      </button>
      <div id={rawId} hidden={!showRaw}>{showRaw && <TextSection label="Record JSON" text={raw} wrap={wrap} />}</div>
    </div>
  );
}

function TextSection({ label, text, wrap }: { label: string; text: string; wrap: boolean }) {
  const { copied, onCopy } = useCopyFeedback(text);
  const [showAll, setShowAll] = useState(false);
  const id = useId();
  const truncated = text.length > 16_000 && !showAll;
  return (
    <section className={css.textSection} aria-labelledby={id}>
      <div className={css.sectionHeader}><h4 id={id}>{label}</h4>
        <button className={css.copy} type="button" aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`} onClick={onCopy}>
          {copied ? <IconCheckOutlineRegular size={14} /> : <IconCopyOutlineRegular size={14} />}
        </button>
      </div>
      <pre className={css.code} data-wrap={wrap} tabIndex={0} aria-label={label}>{truncated ? text.slice(0, 16_000) : text}</pre>
      {truncated && <button className={css.action} type="button" onClick={() => setShowAll(true)}>Show all {text.length.toLocaleString()} characters</button>}
    </section>
  );
}
