// Port of mekaweb's schedules page: job cards with gate and JSON disclosures,
// cancel behind an acknowledgement, and the create form in a modal. Embedded
// per-session (details panel) it renders compactly without the page chrome.

import { useState } from 'react';
import { useCan, useConnection, useResource, useRuntime } from '../../connections/context';
import { segment, sessionPath, type Schema } from '../../api/client';
import { cn } from '../../lib/cn';
import { Button } from '../primitives/Button';
import { JsonTree } from '../primitives/JsonTree';
import { Modal } from '../primitives/Modal';
import { Tag } from '../primitives/Tag';
import { IconAlarmClockOutlineRegular, IconPlusOutlineRegular } from '../icons';
import {
  DateTimeText,
  EmptyState,
  ErrorNotice,
  Loading,
  Notice,
  Page,
  PageHeader,
  isSessionNotLoaded,
  jsonTreeLabels,
} from './shared/page';
import { RiskConfirmButton } from './shared/RiskConfirmButton';
import { ScheduleForm } from './schedules/ScheduleForm';
import css from './SchedulesPage.module.css';

export function SchedulesPage({ sessionId }: { sessionId?: string | undefined }) {
  const { api } = useConnection();
  const runtime = useRuntime();
  const canRead = useCan('schedule:r');
  const canWrite = useCan('schedule:w');
  const [create, setCreate] = useState(false);
  const query = useResource<Schema['ScheduledJobsResponse']>(
    sessionId ? sessionPath(sessionId) + '/schedule' : '/v1/schedule',
    undefined,
    canRead,
  );
  const newSchedule = canWrite ? (
    <Button
      variant={sessionId ? 'outline' : 'primary'}
      icon={<IconPlusOutlineRegular size={16} />}
      onClick={() => setCreate(true)}
    >
      New schedule
    </Button>
  ) : undefined;
  const body = (
    <>
      {sessionId && isSessionNotLoaded(query.error) ? (
        <EmptyState title="Session not loaded on the server" />
      ) : (
        <ErrorNotice error={query.error} standalone />
      )}
      {query.isFetching && !query.data && canRead && <Loading />}
      {!canRead && <EmptyState title="Listing schedules requires schedule:r." />}
      <div className={css.stack}>
        {query.data?.jobs.map((job) => (
          <article className={css.job} key={job.id}>
            <header className={css.jobHead}>
              <span className={css.jobIcon}>
                <IconAlarmClockOutlineRegular size={16} />
              </span>
              <h2 className={css.jobTitle}>
                {job.schedule.startsWith('every ')
                  ? job.schedule.replace(/(\d)(?=[a-z])/gi, '$1 ')
                  : job.schedule}
              </h2>
              {job.gate && <Tag tone="info">Gated</Tag>}
            </header>
            <p className={css.jobPrompt}>{job.prompt}</p>
            <dl className={css.facts}>
              <div className={css.fact}>
                <dt>Next occurrence</dt>
                <dd>
                  <DateTimeText value={job.next_fire_at} />
                </dd>
              </div>
              <div className={css.fact}>
                <dt>Last fired</dt>
                <dd>
                  <DateTimeText value={job.last_fired_at} />
                </dd>
              </div>
              {!sessionId && (
                <div className={css.fact}>
                  <dt>Session</dt>
                  <dd>
                    <a href={`#/sessions/${encodeURIComponent(job.session_id)}`}>
                      {job.session_id}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
            {job.withheld && <Notice>Withheld: {job.withheld}</Notice>}
            {job.gate && (
              <details className={css.disclosure}>
                <summary className={css.disclosureSummary}>
                  {job.gate.kind} gate · {job.gate.when}
                </summary>
                <div className={css.disclosureBody}>
                  <p className={css.gateText}>
                    {job.gate.check ?? 'Gate details are withheld without sessions:r.'}
                  </p>
                </div>
              </details>
            )}
            <details className={css.disclosure}>
              <summary className={css.disclosureSummary}>Job details</summary>
              <div className={css.disclosureBody}>
                <JsonTree data={job} label="Job details" labels={jsonTreeLabels} />
              </div>
            </details>
            {canWrite && (
              <div className={css.jobActions}>
                <RiskConfirmButton
                  title="Cancel schedule"
                  description="Cancel future runs. A running turn will continue."
                  acknowledgeLabel="I understand future runs of this job will stop."
                  confirmLabel="Cancel schedule"
                  busyLabel="Canceling…"
                  triggerVariant="outline"
                  trigger="Cancel schedule"
                  onConfirm={async () => {
                    await api?.mutate('DELETE', '/v1/schedule/' + segment(job.id));
                    await runtime.queries.invalidateQueries();
                  }}
                />
              </div>
            )}
          </article>
        ))}
      </div>
      {query.data?.jobs.length === 0 && <EmptyState title="Nothing scheduled" />}
      {sessionId && newSchedule}
      <Modal
        open={create}
        onClose={() => setCreate(false)}
        title="New schedule"
        closeLabel="Close dialog"
        className={cn(css.wideModal)}
        contentClassName={cn(css.modalScroll)}
      >
        {create && (
          <ScheduleForm
            sessionId={sessionId}
            onSaved={() => {
              setCreate(false);
              void runtime.queries.invalidateQueries();
            }}
          />
        )}
      </Modal>
    </>
  );
  if (sessionId) return <Page compact>{body}</Page>;
  return (
    <Page>
      <PageHeader
        title="Schedules"
        description="Jobs that prompt sessions on a timer or a cron pattern."
        actions={newSchedule}
      />
      {body}
    </Page>
  );
}
