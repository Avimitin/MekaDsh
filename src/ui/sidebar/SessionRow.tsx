/**
 * One session row in the sidebar tree (dsh ui-workspace SessionNodeItem
 * anatomy, mekaweb session-list-item behavior): status dot, title that
 * marquees on hover, relative time swapped for the row menu on hover, inline
 * rename, fork and delete dialogs, and the sub-agent indent guides. The row's
 * clickable surface is an anchor; the trailing menu is its sibling so
 * interactive content never nests inside the link.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import type { Schema } from '../../api/client';
import { errorMessage, sessionPath } from '../../api/client';
import { supportsSessionOrganization } from '../../api/version';
import { useCan, useConnection, useRuntime } from '../../connections/context';
import { useAction } from '../../lib/actions';
import { cn } from '../../lib/cn';
import type { SessionStatus } from '../../session/unread';
import { relativeTime } from '../primitives/relative-time';
import { Menu, MenuItemButton } from '../primitives/Menu';
import { Modal } from '../primitives/Modal';
import { Button } from '../primitives/Button';
import { Input } from '../primitives/Input';
import { StateDot } from '../primitives/StateDot';
import type { StateDotState } from '../primitives/StateDot';
import {
  IconBranchOutlineRegular,
  IconEditOutlineRegular,
  IconEllipsisOutlineRegular,
  IconPinFillRegular,
  IconPinOutlineRegular,
  IconTrashOutlineRegular,
  IconWarningTriangleOutlineRegular,
} from '../icons';
import { useDialogState } from '../shell/use-dialog-state';
import css from './SessionRow.module.css';

const statusLabels: Record<SessionStatus, string | undefined> = {
  approval: 'Waiting for approval',
  running: 'Running',
  failed: 'Unread, failed',
  completed: 'Unread, finished',
  unread: 'Unread',
  read: undefined,
};

/** Session status on the dsh state semantic: warning / ongoing / error / done. */
const dotStates: Record<SessionStatus, StateDotState | undefined> = {
  approval: 'warning',
  running: 'ongoing',
  failed: 'error',
  completed: 'done',
  unread: 'done',
  read: undefined,
};

/* Overflow this small hides no meaningful tail; scrolling for it reads as an
   accidental jitter, so the title stays put. */
const MIN_TITLE_REVEAL_PX = 8;
/* Marquee travel speed: slow enough to read the text as it passes. */
const TITLE_MARQUEE_PX_PER_MS = 0.03;

/** Place the title's scroll position and publish the stylesheet's fade-mask hooks. */
function placeTitle(title: HTMLSpanElement, left: number, range: number): void {
  // jsdom implements no scrollTo; the lane's direct assignment is instant there
  // anyway, so both paths land on the same position.
  if (typeof title.scrollTo === 'function') title.scrollTo({ left, behavior: 'instant' });
  else title.scrollLeft = left;
  if (left > 0) title.dataset.scrolled = '';
  else delete title.dataset.scrolled;
  if (left < range) title.dataset.clipped = '';
  else delete title.dataset.clipped;
}

/** Return the title to its resting state: scrolled to the start, both fade masks off. */
function restTitle(title: HTMLSpanElement): void {
  if (typeof title.scrollTo === 'function') title.scrollTo({ left: 0, behavior: 'instant' });
  else title.scrollLeft = 0;
  delete title.dataset.scrolled;
  delete title.dataset.clipped;
}

/**
 * Marquee a title wider than its one-line cell while its row is hovered, then
 * return it to the start in one step when the pointer leaves. Reduced motion
 * jumps to the far edge instead of crawling.
 */
function useTitleMarquee(title: RefObject<HTMLSpanElement | null>): {
  enter: () => void;
  leave: () => void;
} {
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return useMemo(
    () => ({
      enter: (): void => {
        if (title.current === null) return;
        const element = title.current;
        const range = element.scrollWidth - element.clientWidth;
        if (range <= MIN_TITLE_REVEAL_PX) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          placeTitle(element, range, range);
          return;
        }
        cancelAnimationFrame(frame.current);
        let previous: number | undefined;
        let position = 0;
        const step = (now: DOMHighResTimeStamp): void => {
          position += previous === undefined ? 0 : (now - previous) * TITLE_MARQUEE_PX_PER_MS;
          previous = now;
          placeTitle(element, Math.min(position, range), range);
          if (position < range) frame.current = requestAnimationFrame(step);
        };
        frame.current = requestAnimationFrame(step);
      },
      leave: (): void => {
        cancelAnimationFrame(frame.current);
        if (title.current === null) return;
        restTitle(title.current);
      },
    }),
    [title],
  );
}

/** Compact relative time ("now"/"5min"/"3h"/"2d"/"4mo"/"1y"). */
function timeLabel(updatedAt: number, now: number): string {
  const { unit, n } = relativeTime(updatedAt, now);
  switch (unit) {
    case 'now':
      return 'now';
    case 'minutes':
      return `${n}min`;
    case 'hours':
      return `${n}h`;
    case 'days':
      return `${n}d`;
    case 'months':
      return `${n}mo`;
    case 'years':
      return `${n}y`;
  }
}

/** Inline rename: the title cell swaps to a field; Enter or blur commits, Escape cancels. */
function RenameRow({
  session,
  onClose,
}: {
  session: Schema['SessionResponse'];
  onClose: () => void;
}) {
  const { controller } = useConnection();
  const [title, setTitle] = useState(session.title);
  const action = useAction();
  async function save(value: string) {
    await action.run(async () => {
      if (!controller) return;
      await controller.patchSettings(session.id, { title: value });
      onClose();
    });
  }
  return (
    <div className={css.renameRow}>
      <form
        className={css.renameForm}
        onSubmit={(event) => {
          event.preventDefault();
          void save(title);
        }}
      >
        <input
          className={css.renameInput}
          value={title}
          aria-label="Session title"
          placeholder="Use the first message"
          autoComplete="off"
          disabled={action.busy}
          autoFocus
          onFocus={(event) => event.target.select()}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => {
            if (!action.busy) void save(title);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
        />
      </form>
      {action.error !== undefined && (
        <p className={css.errorText} role="alert">
          {errorMessage(action.error)}
        </p>
      )}
    </div>
  );
}

/** Fork dialog: an optional working-directory override; empty inherits the source's. */
function ForkDialog({
  session,
  open,
  onOpenChange,
}: {
  session: Schema['SessionResponse'];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { api } = useConnection();
  const [cwd, setCwd] = useState('');
  const action = useAction();
  useDialogState(css.forkDialog, open);
  async function fork() {
    await action.run(async () => {
      if (!api) return;
      const result = await api.mutate<Schema['SessionResponse']>(
        'POST',
        sessionPath(session.id) + '/fork',
        cwd ? { cwd } : {},
      );
      onOpenChange(false);
      setCwd('');
      window.location.hash = '/sessions/' + encodeURIComponent(result.id);
    });
  }
  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Fork session"
      closeLabel="Close"
      className={css.forkDialog ?? ''}
      footer={
        <>
          <Button variant="outline" disabled={action.busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={action.busy} onClick={() => void fork()}>
            {action.busy ? 'Working…' : 'Create fork'}
          </Button>
        </>
      }
    >
      <form
        className={css.formStack}
        onSubmit={(event) => {
          event.preventDefault();
          void fork();
        }}
      >
        <label className={css.fieldLabel}>
          Working directory override
          <Input
            className={css.dialogInput ?? ''}
            value={cwd}
            placeholder="Inherit source directory"
            autoComplete="off"
            disabled={action.busy}
            data-modal-autofocus
            onChange={(event) => setCwd(event.target.value)}
          />
        </label>
        {action.error !== undefined && (
          <p className={css.errorText} role="alert">
            {errorMessage(action.error)}
          </p>
        )}
      </form>
    </Modal>
  );
}

/** Delete confirmation (dsh risk-dialog pattern); Shift-click on the menu row skips it. */
function DeleteDialog({
  title,
  open,
  onOpenChange,
  onDelete,
  disabled,
  busy,
  error,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  disabled: boolean;
  busy: boolean;
  error: unknown;
}) {
  useDialogState(css.deleteDialog, open);
  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Delete session"
      closeLabel="Close"
      className={css.deleteDialog ?? ''}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {busy ? 'Close' : 'Cancel'}
          </Button>
          <Button
            variant="outline"
            className={css.deleteAction}
            disabled={disabled || busy}
            data-modal-autofocus
            onClick={onDelete}
          >
            {busy ? 'Deleting…' : 'Delete session'}
          </Button>
        </>
      }
    >
      <div className={css.deleteWarning}>
        <IconWarningTriangleOutlineRegular size={18} />
        <p>Delete “{title}”, its conversation, and its sub-agent sessions?</p>
      </div>
      {error !== undefined && (
        <p className={css.errorText} role="alert">
          {errorMessage(error)}
        </p>
      )}
    </Modal>
  );
}

export function SessionRow({
  session,
  depth,
  branches,
  selected,
  running,
  status,
  excerpt,
  onOpen,
}: {
  session: Schema['SessionResponse'];
  depth: number;
  branches: boolean[];
  selected: boolean;
  running: boolean;
  status: SessionStatus;
  excerpt?: string | undefined;
  onOpen: () => void;
}) {
  const { controller, info } = useConnection();
  const runtime = useRuntime();
  const canWrite = useCan('sessions:w');
  const [confirm, setConfirm] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [forkOpen, setForkOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const link = useRef<HTMLAnchorElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const marquee = useTitleMarquee(titleRef);
  const shiftDelete = useRef(false);
  const action = useAction();
  const pinAction = useAction();
  const busy = action.busy || pinAction.busy;
  const title = session.title || 'New Session';
  const editable = supportsSessionOrganization(info?.version) && canWrite && !session.parent_id;
  const dot = dotStates[status];
  const statusLabel = statusLabels[status];
  // Closing the inline rename hands focus back to the row link, but only when
  // it fell to the body (Escape, or the field unmounting under it) — never
  // stealing it from the element a blur-commit click actually targeted.
  const wasRenaming = useRef(false);
  useEffect(() => {
    if (wasRenaming.current && !renaming && document.activeElement === document.body)
      link.current?.focus({ preventScroll: true });
    wasRenaming.current = renaming;
  }, [renaming]);

  function remove() {
    const source = trigger.current;
    const row = source?.closest('[data-session-entry]');
    let nextRow = row?.nextElementSibling;
    // Deleting a parent also removes its descendants, so focus must leave that subtree.
    while (nextRow instanceof HTMLElement && Number(nextRow.dataset.depth) > depth)
      nextRow = nextRow.nextElementSibling;
    const next =
      (nextRow instanceof HTMLElement
        ? nextRow.querySelector<HTMLAnchorElement>('a[data-session-link]')
        : null) ??
      row?.previousElementSibling?.querySelector<HTMLAnchorElement>('a[data-session-link]') ??
      document.querySelector<HTMLButtonElement>('[aria-label="New chat"]');
    void action.run(async () => {
      if (!controller || !canWrite || running) return;
      const deleted = await controller.deleteSession(session.id);
      if (!deleted.length || runtime.getSnapshot().controller !== controller) return;
      setConfirm(false);
      setRemoved(true);
      if (deleted.some((id) => location.hash === `#/sessions/${encodeURIComponent(id)}`))
        location.hash = '/sessions';
      requestAnimationFrame(() => {
        if (
          runtime.getSnapshot().controller === controller &&
          next?.isConnected &&
          (document.activeElement === document.body || document.activeElement === source)
        )
          next.focus();
      });
    });
  }
  if (removed) return null;

  const guides = branches.map((continues, index) =>
    continues || index === depth - 1 ? (
      <span
        key={index}
        className={css.guide}
        aria-hidden="true"
        data-branch={index === depth - 1 || undefined}
        data-last={!continues || undefined}
        style={{ '--session-guide-level': index + 1 } as CSSProperties}
      />
    ) : null,
  );

  if (renaming) {
    return (
      <div
        className={css.entry}
        data-session-entry
        data-depth={depth}
        style={{ '--session-depth': depth } as CSSProperties}
      >
        {guides}
        <div className={cn(css.sessionRow, selected && css.selected)}>
          <RenameRow session={session} onClose={() => setRenaming(false)} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={css.entry}
      data-session-entry
      data-depth={depth}
      style={{ '--session-depth': depth } as CSSProperties}
    >
      {guides}
      <div
        className={cn(css.sessionRow, selected && css.selected, menuOpen && css.menuOpen)}
        data-busy={busy || undefined}
        onPointerEnter={marquee.enter}
        onPointerLeave={marquee.leave}
      >
        <a
          ref={link}
          className={css.sessionLink}
          data-session-link
          href={`#/sessions/${encodeURIComponent(session.id)}`}
          aria-current={selected ? 'page' : undefined}
          title={title}
          onClick={(event) => {
            if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) onOpen();
          }}
        >
          <span className={css.slot}>
            {dot !== undefined && <StateDot state={dot} />}
            {statusLabel !== undefined && <span className="sr-only">{statusLabel}</span>}
          </span>
          <span
            ref={titleRef}
            className={cn(
              css.titleText,
              ['failed', 'completed', 'unread'].includes(status) && css.unread,
            )}
          >
            {title}
          </span>
          {excerpt !== undefined && <span className={css.excerpt}>{excerpt}</span>}
          <span className={css.time}>
            <time dateTime={session.updated_at}>
              {timeLabel(Date.parse(session.updated_at), Date.now())}
            </time>
          </span>
          {session.pinned_at != null && (
            <span className={css.pinIndicator} role="img" aria-label="Pinned" title="Pinned">
              <IconPinFillRegular size={14} />
            </span>
          )}
        </a>
        <span className={css.rowActions}>
          <Menu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            items={[
              {
                id: 'rename',
                label: 'Rename session',
                icon: <IconEditOutlineRegular />,
                disabled: !editable,
              },
              {
                id: 'pin',
                label: session.pinned_at != null ? 'Unpin session' : 'Pin session',
                icon: session.pinned_at != null ? <IconPinFillRegular /> : <IconPinOutlineRegular />,
                disabled: !editable,
              },
              {
                id: 'fork',
                label: 'Fork session',
                icon: <IconBranchOutlineRegular />,
                disabled: !canWrite || running,
              },
            ]}
            onSelect={(id) => {
              setMenuOpen(false);
              if (id === 'rename') {
                action.reset();
                setRenaming(true);
              } else if (id === 'pin') {
                pinAction.reset();
                void pinAction.run(async () =>
                  controller?.patchSettings(session.id, { pinned: session.pinned_at == null }),
                );
              } else if (id === 'fork') {
                action.reset();
                setForkOpen(true);
              }
            }}
            portal
            closeOnPointerLeave
            anchor={
              <button
                ref={trigger}
                type="button"
                className={css.iconButton}
                aria-label={`Actions for session: ${title}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((value) => !value)}
              >
                <IconEllipsisOutlineRegular />
              </button>
            }
          >
            <span
              onClickCapture={(event) => {
                shiftDelete.current = event.shiftKey;
              }}
              onKeyDownCapture={(event) => {
                shiftDelete.current = event.shiftKey;
              }}
            >
              <MenuItemButton
                danger
                separatorBefore
                icon={<IconTrashOutlineRegular />}
                disabled={!canWrite || running}
                onSelect={() => {
                  const immediate = shiftDelete.current;
                  shiftDelete.current = false;
                  action.reset();
                  setMenuOpen(false);
                  if (immediate) remove();
                  else setConfirm(true);
                }}
              >
                Delete session
              </MenuItemButton>
            </span>
          </Menu>
        </span>
      </div>
      {forkOpen && <ForkDialog session={session} open={forkOpen} onOpenChange={setForkOpen} />}
      {!confirm &&
        (() => {
          const failure = action.error ?? pinAction.error;
          return (
            failure !== undefined && (
              <p className={css.rowError} role="alert">
                {errorMessage(failure)}
              </p>
            )
          );
        })()}
      <DeleteDialog
        title={title}
        open={confirm}
        onOpenChange={setConfirm}
        onDelete={remove}
        disabled={!canWrite || running}
        busy={action.busy}
        error={action.error}
      />
    </div>
  );
}
