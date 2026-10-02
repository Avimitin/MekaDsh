import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Schema } from '../../api/client';
import { errorMessage } from '../../api/client';
import { supportsSessionOrganization } from '../../api/version';
import { useCan, useConnection, useRuntime, useSettings } from '../../connections/context';
import { isSessionRunning, type SessionState } from '../../session/controller';
import { useAction } from '../../lib/actions';
import { useShortcut } from '../../lib/use-shortcut';
import { shortcutAttribute, shortcutHint } from '../../lib/shortcut-keys';
import { directoryLabel } from '../../features/working-directory';
import { Button } from '../primitives/Button';
import {
  IconCheckOutlineRegular,
  IconCloseOutlineRegular,
  IconLoadingOutlineRegular,
  IconPanelLeftOutlineRegular,
  IconRefreshOutlineRegular,
  IconTreeCornerRegular,
} from '../icons';
import { ReadingOptionsControl } from './reading-options';
import { SessionActions } from './session-actions';
import { cn } from '../../lib/cn';
import css from './ConversationHeader.module.css';

/** Slim conversation header: inline-editable title, session caption, and header controls. */
export function ConversationHeader({ state }: { state: SessionState | undefined }) {
  const runtime = useRuntime();
  const { controller } = useConnection();
  const { layout } = useSettings();
  const action = useAction();
  const session = state?.session;
  const [headingError, setHeadingError] = useState<unknown>();
  return (
    <header className={cn(css.header, !session && css.headerBlank)}>
      <div className={css.titleCluster}>
        {session && state ? (
          <SessionTitle
            key={session.id}
            session={session}
            disabled={state.deleting || state.settingsPending}
            onError={setHeadingError}
          />
        ) : (
          <h1 className={css.title}>New conversation</h1>
        )}
        {session && (
          <p className={css.caption}>
            {session.parent_id ? (
              <a
                className={css.parentLink}
                href={`#/sessions/${encodeURIComponent(session.parent_id)}`}
                aria-label="Back to parent session"
                title="Back to parent session"
              >
                <IconTreeCornerRegular size={12} />
                <span>Parent session</span>
              </a>
            ) : (
              <>
                {session.profile && <span>{session.profile}</span>}
                {session.permission && <span>{session.permission}</span>}
                {session.cwd ? (
                  <span title={session.cwd}>
                    {directoryLabel(session.cwd).name || session.cwd}
                  </span>
                ) : (
                  <span>Working directory not recorded</span>
                )}
              </>
            )}
          </p>
        )}
      </div>
      <div className={css.headerActions}>
        <ReadingOptionsControl />
        {state?.feed === 'unavailable' && (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Reconnect session feed"
            title="Reconnect session feed"
            disabled={action.busy}
            onClick={() => void action.run(async () => controller?.reconnect(state.id))}
          >
            <IconRefreshOutlineRegular size={16} />
          </Button>
        )}
        {session && (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Session details"
            title={layout.detailsOpen ? 'Hide session details' : 'Show session details'}
            aria-expanded={layout.detailsOpen}
            aria-controls={layout.detailsOpen ? 'session-details' : undefined}
            onClick={() => runtime.storage.layout({ detailsOpen: !layout.detailsOpen })}
          >
            <span className={css.flip}>
              <IconPanelLeftOutlineRegular size={16} />
            </span>
          </Button>
        )}
        {session && state && (
          <SessionActions
            session={session}
            running={isSessionRunning(state)}
            deleting={state.deleting}
          />
        )}
      </div>
      {headingError !== undefined && headingError !== null && (
        <p className={css.headingError} role="alert">
          {errorMessage(headingError)}
        </p>
      )}
      {action.error !== undefined && action.error !== null && (
        <p className={css.headingError} role="alert">
          {errorMessage(action.error)}
        </p>
      )}
    </header>
  );
}

// Inline session title edit, ported from mekaweb's session heading.
function SessionTitle({
  session,
  disabled,
  onError,
}: {
  session: Schema['SessionResponse'];
  disabled: boolean;
  onError: (error: unknown) => void;
}) {
  const { controller, info } = useConnection();
  const canWrite = useCan('sessions:w');
  const editable = canWrite && !session.parent_id && supportsSessionOrganization(info?.version);
  const [draft, setDraft] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const changed = useRef(false);
  const pending = useRef(false);
  const editing = useRef(false);
  const mounted = useRef(true);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLSpanElement>(null);
  const open = draft !== undefined;
  function rename() {
    changed.current = false;
    editing.current = true;
    setDraft(session.title);
    setFailed(false);
    onError(undefined);
  }
  useShortcut('renameSession', rename, editable && !disabled && !open);
  useEffect(() => {
    mounted.current = true;
    onError(undefined);
    return () => {
      mounted.current = false;
      onError(undefined);
    };
  }, [onError]);
  useLayoutEffect(() => {
    if (open) {
      input.current?.focus();
      input.current?.select();
    }
  }, [open]);

  function close(restoreFocus: boolean) {
    editing.current = false;
    const restore = restoreFocus && editor.current?.contains(document.activeElement);
    setDraft(undefined);
    setFailed(false);
    onError(undefined);
    if (restore)
      requestAnimationFrame(() => {
        if (mounted.current && document.activeElement === document.body) trigger.current?.focus();
      });
  }
  async function save(restoreFocus: boolean) {
    if (
      !editing.current ||
      pending.current ||
      disabled ||
      !editable ||
      !controller ||
      draft === undefined
    )
      return;
    // Compare edited text with the latest server value. A lost reply may already
    // have applied the previous attempt, including when the user now undoes it.
    if (!changed.current || draft === session.title) {
      close(restoreFocus);
      return;
    }
    pending.current = true;
    setSaving(true);
    setFailed(false);
    onError(undefined);
    try {
      await controller.patchSettings(session.id, { title: draft });
      if (mounted.current) close(restoreFocus);
    } catch (error) {
      if (mounted.current) {
        setFailed(true);
        onError(error);
      }
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  const title = session.title || 'New conversation';
  if (open)
    return (
      <span
        ref={editor}
        className={css.titleEditor}
        role="group"
        aria-label="Edit session title"
        onBlur={(event) => {
          // Moving between the input and its buttons is still editing. After a
          // refusal, only an explicit save or a changed draft may submit again.
          if (!event.currentTarget.contains(event.relatedTarget) && !failed) void save(false);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if (
            event.key === 'Escape' ||
            (event.key === 'Enter' && event.target === input.current)
          ) {
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat || pending.current) return;
            if (event.key === 'Escape') close(true);
            else void save(true);
          }
        }}
      >
        <input
          ref={input}
          className={css.titleInput}
          value={draft}
          aria-label="Session title"
          autoComplete="off"
          enterKeyHint="done"
          readOnly={saving}
          aria-busy={saving}
          aria-invalid={failed || undefined}
          placeholder="Use the first message"
          onChange={(event) => {
            changed.current = true;
            setDraft(event.target.value);
            setFailed(false);
            onError(undefined);
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          aria-label="Save session title"
          title="Save title"
          disabled={disabled || saving}
          // Some touch browsers blur the input without focusing a tapped button.
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void save(true)}
        >
          {saving ? (
            <IconLoadingOutlineRegular size={14} className={css.spin} />
          ) : (
            <IconCheckOutlineRegular size={14} />
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Cancel title edit"
          title="Cancel"
          disabled={saving}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => close(true)}
        >
          <IconCloseOutlineRegular size={14} />
        </Button>
      </span>
    );
  return (
    <h1 className={css.title}>
      {editable ? (
        <button
          ref={trigger}
          type="button"
          className={css.titleButton}
          title={`Rename session (${shortcutHint('renameSession')})`}
          aria-keyshortcuts={shortcutAttribute('renameSession')}
          disabled={disabled}
          onClick={rename}
        >
          {title}
        </button>
      ) : (
        title
      )}
    </h1>
  );
}
