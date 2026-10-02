import { useAction } from '../../lib/actions';
import { useCan, useConnection } from '../../connections/context';
import type { Schema } from '../../api/client';
import { errorMessage } from '../../api/client';
import type { Submission } from '../../session/controller';
import type { ReactNode } from 'react';
import { useCopyFeedback } from '../primitives/use-copy-feedback';
import { IconCheckOutlineRegular, IconCopyOutlineRegular } from '../icons';
import { ImageAttachment } from './ImageAttachment';
import { NoticeRow } from './NoticeRow';
import { cn } from '../../lib/cn';
import css from './MessageList.module.css';

type SubmissionImage = Extract<Schema['TurnRequest']['images'], unknown[]>[number];

function clockLabel(value: string | null | undefined) {
  if (!value) return undefined;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return undefined;
  return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function CopyAction({ text, time }: { text: string; time: string | undefined }) {
  const { copied, onCopy } = useCopyFeedback(text);
  if (!text && !time) return null;
  return (
    <div className={css.actions} data-clock="start">
      {time && <span className={css.time}>{time}</span>}
      {text && (
        <button
          type="button"
          className={css.action}
          aria-label={copied ? 'Copied' : 'Copy'}
          title={copied ? 'Copied' : 'Copy'}
          onClick={onCopy}
        >
          {copied ? (
            <IconCheckOutlineRegular size={14} />
          ) : (
            <IconCopyOutlineRegular size={14} />
          )}
        </button>
      )}
    </div>
  );
}

function ImageRow({ children }: { children: ReactNode }) {
  return <div className={css.attachmentRow}>{children}</div>;
}

function Bubble({
  text,
  time,
  anchor,
  status,
  tone,
  children,
  actions,
}: {
  text: string;
  time: string | undefined;
  anchor: number | undefined;
  status?: string | undefined;
  tone?: 'default' | 'warn' | 'error';
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={css.userRow} {...(anchor !== undefined ? { 'data-turn-anchor': anchor } : {})}>
      <div className={css.userStack}>
        {children}
        {text && <div className={css.bubble}>{text}</div>}
      </div>
      {(status || actions) && (
        <div className={css.statusRow}>
          {status && (
            <span className={cn(css.status, tone === 'warn' && css.statusWarn, tone === 'error' && css.statusError)} role="status">
              {status}
            </span>
          )}
          {actions}
        </div>
      )}
      <CopyAction text={text} time={time} />
    </div>
  );
}

/** A saved user input: images above the bubble, plain text, hover copy. */
export function SavedUserMessage({
  sessionId,
  messages,
  anchor,
}: {
  sessionId: string;
  messages: { block: Schema['ContentBlockView']; index: number }[];
  anchor: number | undefined;
}) {
  const text = messages
    .flatMap(({ block }) => (block.type === 'text' ? [block.text] : []))
    .join('');
  const images = messages.flatMap(({ block }) => (block.type === 'image' ? [block] : []));
  return (
    <div className={css.userRow} {...(anchor !== undefined ? { 'data-turn-anchor': anchor } : {})}>
      <div className={css.userStack}>
        {images.length > 0 && (
          <ImageRow>
            {images.map((image, index) =>
              image.hash ? (
                <ImageAttachment
                  key={index}
                  sessionId={sessionId}
                  hash={image.hash}
                  mediaType={image.media_type}
                />
              ) : (
                <span key={index} className={css.imageUnavailable}>
                  Image unavailable
                </span>
              ),
            )}
          </ImageRow>
        )}
        {text && <div className={css.bubble}>{text}</div>}
      </div>
      <CopyAction text={text} time={undefined} />
    </div>
  );
}

const submissionStatus = (submission: Submission): string =>
  ({
    sending: 'Sending…',
    accepted:
      'class' in submission.body
        ? submission.body.class === 'followup'
          ? 'Queued'
          : submission.body.class === 'interrupt'
            ? 'Interrupting…'
            : 'Steering…'
        : '',
    running: '',
    delivered: '',
    completed: '',
    uncertain: 'Delivery unknown',
    reviewed: 'Outcome reviewed',
    failed: 'Failed',
    withdrawn: 'Withdrawn',
    canceled: 'Canceled',
  })[submission.state];

/** A live submission preview with its delivery status and recovery controls. */
export function SubmissionMessage({
  submission,
  sessionId,
  pending,
  canWithdraw,
  recoverable,
  anchor,
  onAccepted,
  onError,
}: {
  submission: Submission;
  sessionId: string;
  pending: Schema['InboxItemView'] | undefined;
  canWithdraw: boolean;
  recoverable: boolean;
  anchor: number | undefined;
  onAccepted: () => void;
  onError: (error: unknown) => void;
}) {
  const images: SubmissionImage[] =
    'images' in submission.body ? (submission.body.images ?? []) : [];
  const skill = 'options' in submission.body ? submission.body.options?.skill : undefined;
  const status = submissionStatus(submission);
  const tone =
    submission.state === 'failed'
      ? 'error'
      : submission.state === 'uncertain' || submission.state === 'reviewed'
        ? 'warn'
        : 'default';
  return (
    <>
      <Bubble
        text={submission.body.message}
        time={clockLabel(submission.createdAt)}
        anchor={anchor}
        status={status || undefined}
        tone={tone}
        actions={
          submission.kind === 'inbox' &&
          submission.itemId &&
          submission.state === 'accepted' &&
          (pending ? pending.state === 'pending' : submission.delivery === 'pending') ? (
            <WithdrawMessage
              sessionId={sessionId}
              itemId={submission.itemId}
              disabled={!canWithdraw}
              onError={onError}
            />
          ) : undefined
        }
      >
        {images.length > 0 && (
          <ImageRow>
            {images.map((image, index) => (
              <ImageAttachment
                key={index}
                sessionId={sessionId}
                hash=""
                mediaType={image.media_type}
                optimisticSrc={`data:${image.media_type};base64,${image.data}`}
              />
            ))}
          </ImageRow>
        )}
        {skill && <span className={css.skill}>Skill: {skill}</span>}
      </Bubble>
      {recoverable && (
        <SubmissionRecovery
          submission={submission}
          sessionId={sessionId}
          onAccepted={onAccepted}
          onError={onError}
        />
      )}
    </>
  );
}

/** A queued inbox item whose body never reached this browser. */
export function InboxMessage({
  sessionId,
  item,
  canWithdraw,
  anchor,
  onError,
}: {
  sessionId: string;
  item: Schema['InboxItemView'];
  canWithdraw: boolean;
  anchor: number | undefined;
  onError: (error: unknown) => void;
}) {
  return (
    <Bubble
      text=""
      time={clockLabel(item.created_at)}
      anchor={anchor}
      status="Queued"
      actions={
        <WithdrawMessage
          sessionId={sessionId}
          itemId={item.id}
          disabled={!canWithdraw}
          onError={onError}
        />
      }
    >
      <span className={css.queuedNote}>
        {item.source || 'Queued message'} · text unavailable
      </span>
    </Bubble>
  );
}

function WithdrawMessage({
  sessionId,
  itemId,
  disabled,
  onError,
}: {
  sessionId: string;
  itemId: string;
  disabled: boolean;
  onError: (error: unknown) => void;
}) {
  const { controller } = useConnection();
  const action = useAction(onError);
  return (
    <button
      type="button"
      className={css.withdraw}
      disabled={disabled || action.busy}
      onClick={() => void action.run(async () => controller?.withdrawInbox(sessionId, itemId))}
    >
      Withdraw
    </button>
  );
}

function SubmissionRecovery({
  submission,
  sessionId,
  onAccepted,
  onError,
}: {
  submission: Submission;
  sessionId: string;
  onAccepted: () => void;
  onError: (error: unknown) => void;
}) {
  const { controller } = useConnection();
  const canWrite = useCan('sessions:w');
  const action = useAction(onError);
  return (
    <div className={css.recovery}>
      {submission.error && (
        <NoticeRow
          level={submission.state === 'uncertain' ? 'warn' : 'error'}
          text={errorMessage(submission.error)}
        />
      )}
      {submission.state === 'uncertain' && (
        <div className={css.recoveryActions}>
          {submission.kind === 'inbox' && (
            <button
              type="button"
              className={css.recoveryButton}
              disabled={!canWrite || action.busy}
              onClick={() =>
                void action.run(async () => {
                  if (await controller?.retryInbox(sessionId, submission.key)) onAccepted();
                })
              }
            >
              Retry same submission
            </button>
          )}
          <button
            type="button"
            className={css.recoveryButton}
            onClick={() => void controller?.refresh(sessionId)}
          >
            Inspect saved state
          </button>
          <button
            type="button"
            className={cn(css.recoveryButton, css.recoveryGhost)}
            onClick={() => controller?.resolveUncertain(sessionId, submission.key)}
          >
            I reviewed the outcome
          </button>
          {submission.kind === 'turn' && (
            <p className={css.recoveryNote}>
              Review the saved conversation before sending again. Streaming turns cannot be safely
              retried automatically.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
