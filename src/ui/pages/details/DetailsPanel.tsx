// The session details track of the right panel: context occupancy, background
// tasks, and this session's schedules. Ports mekaweb's SessionDetails with the
// 5s polling and the 409 session-not-loaded guard.

import { useState } from 'react';
import { useCan, useConnection, useResource } from '../../../connections/context';
import { sessionPath, type Schema } from '../../../api/client';
import { contextMetrics } from '../../../session/usage';
import { useAction } from '../../../lib/actions';
import { cn } from '../../../lib/cn';
import { Button } from '../../primitives/Button';
import { JsonTree } from '../../primitives/JsonTree';
import { SegmentedTabs } from '../../primitives/SegmentedTabs';
import type { SegmentedTab } from '../../primitives/SegmentedTabs';
import { Tag } from '../../primitives/Tag';
import type { TagTone } from '../../primitives/Tag';
import { SchedulesPage } from '../SchedulesPage';
import {
  EmptyState,
  ErrorNotice,
  Loading,
  RelativeDateTime,
  isSessionNotLoaded,
  jsonTreeLabels,
} from '../shared/page';
import css from './DetailsPanel.module.css';

type Tab = 'context' | 'tasks' | 'schedules';

export function DetailsPanel({ sessionId }: { sessionId: string }) {
  const canSchedule = useCan('schedule:r');
  const [tab, setTab] = useState<Tab>('context');
  const tabs: [SegmentedTab<Tab>, ...SegmentedTab<Tab>[]] = [
    {
      value: 'context',
      label: 'Context',
      id: 'details-tab-context',
      panelId: 'details-panel-context',
    },
    { value: 'tasks', label: 'Tasks', id: 'details-tab-tasks', panelId: 'details-panel-tasks' },
  ];
  if (canSchedule)
    tabs.push({
      value: 'schedules',
      label: 'Schedules',
      id: 'details-tab-schedules',
      panelId: 'details-panel-schedules',
    });
  return (
    <div className={css.panel}>
      <div className={css.tabBar}>
        <SegmentedTabs items={tabs} value={tab} onChange={setTab} label="Session details" />
      </div>
      <div
        className={css.content}
        id={`details-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`details-tab-${tab}`}
      >
        {tab === 'context' && <ContextTab sessionId={sessionId} />}
        {tab === 'tasks' && <TasksTab sessionId={sessionId} />}
        {tab === 'schedules' && canSchedule && <SchedulesPage sessionId={sessionId} />}
      </div>
    </div>
  );
}

function ContextTab({ sessionId }: { sessionId: string }) {
  const query = useResource<Schema['ContextResponse']>(
    sessionPath(sessionId) + '/context',
    undefined,
    true,
    5000,
  );
  if (isSessionNotLoaded(query.error))
    return <EmptyState title="Session not loaded on the server" />;
  const context = query.data;
  return (
    <div className={css.stack}>
      <ErrorNotice error={query.error} standalone />
      {query.isPending && <Loading />}
      {context && <ContextDetails context={context} />}
    </div>
  );
}

function ContextDetails({ context }: { context: Schema['ContextResponse'] }) {
  const metrics = contextMetrics(context);
  const percent = context.used_percent;
  const warn =
    percent != null && context.compact_at_percent != null && percent >= context.compact_at_percent;
  return (
    <>
      <div className={css.group} aria-label="Context window">
        <h3 className={css.groupTitle}>Context window</h3>
        {percent != null ? (
          <>
            <div
              className={css.meter}
              role="progressbar"
              aria-label="Context window occupancy"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div
                className={cn(css.meterFill, warn && css.meterFillWarn)}
                style={{ width: `${Math.min(100, percent)}%` }}
              />
              {context.compact_at_percent != null && (
                <span
                  className={css.meterMarker}
                  title={`Auto-compact at ${context.compact_at_percent}%`}
                  style={{ left: `${Math.min(100, context.compact_at_percent)}%` }}
                />
              )}
            </div>
            <p className={css.meterReading}>
              {percent}% · {context.used?.toLocaleString()} / {context.window?.toLocaleString()}{' '}
              tokens
            </p>
          </>
        ) : (
          <p className={css.muted}>Usage not reported yet.</p>
        )}
        <dl className={css.facts}>
          {metrics.remainingTokens != null && (
            <div className={css.fact}>
              <dt>Tokens remaining</dt>
              <dd>{metrics.remainingTokens.toLocaleString()}</dd>
            </div>
          )}
          <div className={css.fact}>
            <dt>Auto-compact</dt>
            <dd>
              {context.compact_at_percent != null ? `${context.compact_at_percent}%` : 'Off'}
            </dd>
          </div>
          {context.message_count != null && (
            <div className={css.fact}>
              <dt>Context messages</dt>
              <dd>{context.message_count.toLocaleString()}</dd>
            </div>
          )}
          <div className={css.fact}>
            <dt>Compactions</dt>
            <dd>{context.generation.toLocaleString()}</dd>
          </div>
        </dl>
      </div>
      <div className={css.group} aria-label="Session usage">
        <h3 className={css.groupTitle}>Session usage</h3>
        <dl className={css.facts}>
          <div className={css.fact}>
            <dt title="Cache reads divided by all input tokens, across the session">
              Cache hit rate
            </dt>
            <dd>
              {metrics.cacheHitPercent != null
                ? `${metrics.cacheHitPercent.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
                : 'Not reported'}
            </dd>
          </div>
          <div className={css.fact}>
            <dt>Input tokens</dt>
            <dd>{metrics.totalInputTokens.toLocaleString()}</dd>
          </div>
          <div className={css.fact}>
            <dt>Uncached input</dt>
            <dd>{context.totals.input_tokens.toLocaleString()}</dd>
          </div>
          <div className={css.fact}>
            <dt>Cache reads</dt>
            <dd>{context.totals.cache_read_input_tokens.toLocaleString()}</dd>
          </div>
          <div className={css.fact}>
            <dt>Cache writes</dt>
            <dd>{context.totals.cache_creation_input_tokens.toLocaleString()}</dd>
          </div>
          <div className={css.fact}>
            <dt>Output tokens</dt>
            <dd>{context.totals.output_tokens.toLocaleString()}</dd>
          </div>
          <div className={css.fact}>
            <dt>Turns completed</dt>
            <dd>{context.totals.turns.toLocaleString()}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}

const TASK_TONES: Record<string, TagTone> = {
  running: 'warning',
  completed: 'success',
  failed: 'danger',
  canceled: 'neutral',
  interrupted: 'neutral',
};

function TasksTab({ sessionId }: { sessionId: string }) {
  const { api } = useConnection();
  const canWrite = useCan('sessions:w');
  const action = useAction();
  const tasks = useResource<Schema['BackgroundTasksResponse']>(
    sessionPath(sessionId) + '/tasks',
    undefined,
    true,
    5000,
  );
  if (isSessionNotLoaded(tasks.error))
    return <EmptyState title="Session not loaded on the server" />;
  return (
    <div className={css.stack}>
      <ErrorNotice error={tasks.error ?? action.error} standalone />
      {tasks.isPending && <Loading />}
      {tasks.data?.tasks.map((task) => (
        <article className={css.task} key={task.id}>
          <header className={css.taskHead}>
            <h3 className={css.taskTitle}>{task.label}</h3>
            <Tag tone={TASK_TONES[task.status] ?? 'outline'}>{task.status}</Tag>
          </header>
          <p className={css.taskMeta}>
            {task.tool} · started <RelativeDateTime value={task.started_at} />
            {task.finished_at && (
              <>
                {' '}
                · finished <RelativeDateTime value={task.finished_at} />
              </>
            )}
          </p>
          {task.outcome && <pre className={css.taskOutcome}>{task.outcome}</pre>}
          {task.scratchpad_entry && (
            <p className={css.taskMeta}>Full output in scratchpad: {task.scratchpad_entry}</p>
          )}
          <details className={css.disclosure}>
            <summary className={css.disclosureSummary}>Task details and delivery</summary>
            <div className={css.disclosureBody}>
              <JsonTree data={task} label="Task details" labels={jsonTreeLabels} />
            </div>
          </details>
          {canWrite && task.status === 'running' && (
            <div className={css.taskActions}>
              <Button
                variant="outline"
                size="sm"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await api?.mutate(
                      'DELETE',
                      sessionPath(sessionId) + '/tasks/' + encodeURIComponent(task.id),
                    );
                    await tasks.refetch();
                  })
                }
              >
                Cancel task
              </Button>
            </div>
          )}
        </article>
      ))}
      {tasks.data?.tasks.length === 0 && <EmptyState title="No background tasks" />}
    </div>
  );
}
