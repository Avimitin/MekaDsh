import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Approval } from '../../session/controller';
import type { Schema } from '../../api/client';
import { errorMessage } from '../../api/client';
import { useCan, useConnection } from '../../connections/context';
import { Button } from '../primitives/Button';
import { cn } from '../../lib/cn';
import css from './ApprovalPanel.module.css';

function argumentText(input: unknown): string {
  if (input === undefined || input === null) return '';
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input, null, 2) ?? '';
  } catch {
    return String(input);
  }
}

/**
 * Composer takeover for the session's first pending approval (the rest queue behind it).
 * dsh's approval flow with meka's four outcomes: Enter allows once, Escape denies.
 */
export function ApprovalPanel({ approvals }: { approvals: Approval[] }) {
  const approval = approvals[0];
  if (!approval) return null;
  return <ApprovalFlow key={approval.id} approval={approval} queued={approvals.length - 1} />;
}

function ApprovalFlow({ approval, queued }: { approval: Approval; queued: number }) {
  const { controller } = useConnection();
  const canWrite = useCan('sessions:w');
  const [answered, setAnswered] = useState(false);
  const [error, setError] = useState<unknown>();
  const waiting = useRef(false);
  const active = useRef(true);
  const composing = useRef(false);
  const compositionEnded = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const answer = (outcome: Schema['PermissionDecision']) => {
    if (waiting.current || !canWrite || !controller) return;
    waiting.current = true;
    setAnswered(true);
    setError(undefined);
    void controller.respond(approval, outcome).catch((failure: unknown) => {
      if (!active.current) return;
      waiting.current = false;
      setAnswered(false);
      setError(failure);
    });
  };
  const keydown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const element = event.target as Element;
    if (
      event.defaultPrevented ||
      !event.currentTarget.contains(document.activeElement) ||
      element.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') !==
        null
    )
      return;
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    if (event.key === 'Enter' && element.closest('button, a[href], [role="button"]') !== null)
      return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (
      event.repeat ||
      composing.current ||
      compositionEnded.current ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    )
      return;
    answer(event.key === 'Enter' ? 'allow' : 'deny');
  };
  const args = argumentText(approval.input);
  return (
    <div
      className={css.root}
      data-approval-key={approval.id}
      aria-busy={answered}
      onKeyDown={keydown}
      onKeyUpCapture={() => {
        compositionEnded.current = false;
      }}
      onCompositionStartCapture={() => {
        composing.current = true;
      }}
      onCompositionEndCapture={() => {
        composing.current = false;
        compositionEnded.current = true;
      }}
    >
      <div className={css.card}>
        <div className={css.strip}>
          <span className={cn(css.dot, answered && css.dotOngoing)} aria-hidden="true" />
          <span className={css.shimmer}>Waiting for approval</span>
          {queued > 0 && <span className={css.queued}>+{queued} more</span>}
        </div>
        <div
          className={css.body}
          data-approval-scroll
          tabIndex={0}
          role="group"
          aria-label="Approval details"
        >
          <div className={css.headline}>{approval.tool} wants to run</div>
          {args && (
            <pre className={css.command} data-approval-arguments>
              {args}
            </pre>
          )}
          <p className={css.caption}>
            Expires at {new Date(approval.expires).toLocaleTimeString()}.
          </p>
          {approval.error && <p className={css.error}>{approval.error}</p>}
          {error ? <p className={css.error}>{errorMessage(error)}</p> : null}
        </div>
        <div className={css.actionRow}>
          <div className={css.alwaysRow}>
            <button
              type="button"
              className={css.always}
              disabled={answered || !canWrite}
              title={!canWrite ? 'Requires sessions:w' : 'Always allow this tool'}
              onClick={() => answer('allow_always')}
            >
              Always allow
            </button>
            <button
              type="button"
              className={css.always}
              disabled={answered || !canWrite}
              title={!canWrite ? 'Requires sessions:w' : 'Always deny this tool'}
              onClick={() => answer('deny_always')}
            >
              Always deny
            </button>
          </div>
          <Button
            variant="outline"
            className={css.reject}
            disabled={answered || !canWrite}
            title={!canWrite ? 'Requires sessions:w' : undefined}
            onClick={() => answer('deny')}
          >
            Deny
          </Button>
          <Button
            variant="primary"
            disabled={answered || !canWrite}
            title={!canWrite ? 'Requires sessions:w' : undefined}
            onClick={() => answer('allow')}
          >
            Allow once
          </Button>
        </div>
      </div>
    </div>
  );
}
