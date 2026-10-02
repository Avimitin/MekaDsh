import { useState } from 'react';
import type { Submission } from '../../session/controller';
import { useConnection } from '../../connections/context';
import { cn } from '../../lib/cn';
import { Tag } from '../primitives/Tag';
import css from './Composer.module.css';

const QUEUE_PREVIEW_CHARS = 200;

function previewOf(message: string): string {
  const flat = message.replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  return chars.length > QUEUE_PREVIEW_CHARS
    ? `${chars.slice(0, QUEUE_PREVIEW_CHARS).join('')}…`
    : flat;
}

function classLabel(body: Submission['body']): string {
  if (!('class' in body)) return 'Send';
  return body.class === 'followup' ? 'Queue' : body.class === 'interrupt' ? 'Interrupt' : 'Steer';
}

function queueStatus(submission: Submission): string {
  if (submission.state === 'running') return 'Delivering…';
  if (submission.state === 'delivered') return 'Delivered';
  if ('class' in submission.body) {
    if (submission.body.class === 'followup') return 'Queued';
    if (submission.body.class === 'interrupt') return 'Interrupting…';
    return 'Steering…';
  }
  return 'Queued';
}

/**
 * The docked composer's queue strip: this session's queued inbox submissions
 * (accepted, running, or delivered) as compact rows with a Withdraw action,
 * plus slim caption rows for transient submission states (sending, uncertain,
 * failed). The conversation stream owns the full recovery UI; these rows only
 * carry the status and, for an uncertain inbox submission, a safe retry.
 */
export function QueuedDock({
  sessionId,
  submissions,
  canWithdraw,
  onError,
}: {
  sessionId: string;
  submissions: Submission[];
  canWithdraw: boolean;
  onError: (error: unknown) => void;
}) {
  const { controller } = useConnection();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const queued = submissions.filter(
    (submission) =>
      submission.kind === 'inbox' &&
      ['accepted', 'running', 'delivered'].includes(submission.state),
  );
  const transient = submissions.filter((submission) =>
    ['sending', 'uncertain', 'failed'].includes(submission.state),
  );
  if (queued.length === 0 && transient.length === 0) return null;

  async function run(key: string, action: () => Promise<unknown>) {
    if (busyKey !== null) return;
    setBusyKey(key);
    try {
      await action();
    } catch (error) {
      onError(error);
    } finally {
      setBusyKey((current) => (current === key ? null : current));
    }
  }

  return (
    <div className={css.dock}>
      <div className={css.dockPanel}>
        <ul className={css.dockList}>
          {queued.map((submission) => (
            <li key={submission.key} className={css.dockRow}>
              <span className={css.dockPreview} title={previewOf(submission.body.message)}>
                {previewOf(submission.body.message)}
              </span>
              <Tag tone="neutral">{classLabel(submission.body)}</Tag>
              <span className={css.dockStatus} role="status">
                {queueStatus(submission)}
              </span>
              {submission.state === 'accepted' && submission.itemId && (
                <button
                  type="button"
                  className={cn(css.dockAction, css.dockActionDanger)}
                  disabled={!canWithdraw || busyKey !== null}
                  onClick={() =>
                    void run(submission.key, async () => {
                      await controller?.withdrawInbox(sessionId, submission.itemId!);
                    })
                  }
                >
                  Withdraw
                </button>
              )}
            </li>
          ))}
          {transient.map((submission) => (
            <li key={submission.key} className={css.dockRow}>
              <span className={css.dockPreview} title={previewOf(submission.body.message)}>
                {previewOf(submission.body.message)}
              </span>
              <span
                className={cn(
                  css.dockStatus,
                  submission.state !== 'sending' && css.dockStatusError,
                )}
                role="status"
                title={submission.error}
              >
                {submission.state === 'sending'
                  ? 'Sending…'
                  : submission.state === 'uncertain'
                    ? `Delivery unknown${submission.error ? `: ${submission.error}` : ''}`
                    : `Failed${submission.error ? `: ${submission.error}` : ''}`}
              </span>
              {submission.state === 'uncertain' && submission.kind === 'inbox' && (
                <button
                  type="button"
                  className={css.dockAction}
                  disabled={!canWithdraw || busyKey !== null}
                  onClick={() =>
                    void run(submission.key, async () => {
                      await controller?.retryInbox(sessionId, submission.key);
                    })
                  }
                >
                  Retry
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
