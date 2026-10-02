import { useEffect, useRef, useState, type FormEvent } from 'react';
import { download, errorMessage, sessionPath, type Schema } from '../../api/client';
import { supportsSessionOrganization } from '../../api/version';
import { useCan, useConnection, useResource, useRuntime } from '../../connections/context';
import { useAction } from '../../lib/actions';
import { useShortcut } from '../../lib/use-shortcut';
import { Button } from '../primitives/Button';
import { Menu, type MenuEntry } from '../primitives/Menu';
import { Modal } from '../primitives/Modal';
import { Input } from '../primitives/Input';
import { Switch } from '../primitives/Switch';
import { RiskConfirmation } from '../primitives/RiskConfirmation';
import {
  IconBranchOutlineRegular,
  IconClockOutlineRegular,
  IconCompactOutlineRegular,
  IconDownloadOutlineRegular,
  IconEditOutlineRegular,
  IconEllipsisOutlineRegular,
  IconPinFillRegular,
  IconPinOutlineRegular,
  IconPluginPinwheelOutlineRegular,
  IconTrashOutlineRegular,
} from '../icons';
import { NoticeRow } from './NoticeRow';
import css from './session-actions.module.css';

function ErrorText({ error }: { error: unknown }) {
  if (error === undefined || error === null) return null;
  return (
    <p className={css.error} role="alert">
      {errorMessage(error)}
    </p>
  );
}

/** Session actions menu and its dialogs, ported from mekaweb's session toolbar actions. */
export function SessionActions({
  session,
  running,
  deleting,
}: {
  session: Schema['SessionResponse'];
  running: boolean;
  deleting: boolean;
}) {
  const { api, controller, info } = useConnection();
  const runtime = useRuntime();
  const canWrite = useCan('sessions:w');
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState('');
  const [cwd, setCwd] = useState('');
  const [turns, setTurns] = useState(1);
  const [instructions, setInstructions] = useState('');
  const [keepRecent, setKeepRecent] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const action = useAction();
  const organized = supportsSessionOrganization(info?.version);
  const mutable = canWrite && !session.parent_id;

  function openAction(name: string) {
    action.reset();
    setAcknowledged(false);
    setDialog(name);
    setMenu(false);
  }
  function closeAction() {
    setDialog('');
  }
  useShortcut(
    'deleteSession',
    () => openAction('delete'),
    canWrite && !running && !deleting && !action.busy,
  );

  function exportSession(format: 'markdown' | 'json') {
    openAction('export');
    void action.run(async () => {
      if (!api) return;
      download(
        await api.blob(sessionPath(session.id) + '/export', { format }),
        `meka-${session.id}.${format === 'markdown' ? 'md' : 'json'}`,
      );
      closeAction();
    });
  }
  async function togglePin() {
    const result = await action.run(async () =>
      controller?.patchSettings(session.id, { pinned: !session.pinned_at }),
    );
    if (!result && runtime.getSnapshot().controller === controller) setDialog('pin');
  }
  async function remove() {
    await action.run(async () => {
      if (!controller || !canWrite || running || deleting) return;
      const deleted = await controller.deleteSession(session.id);
      if (!deleted.length || runtime.getSnapshot().controller !== controller) return;
      closeAction();
      if (deleted.some((id) => location.hash === `#/sessions/${encodeURIComponent(id)}`))
        location.hash = '/sessions';
    });
  }
  async function execute(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      if (!api) return;
      if (dialog === 'fork') {
        const result = await api.mutate<Schema['SessionResponse']>(
          'POST',
          sessionPath(session.id) + '/fork',
          cwd.trim() ? { cwd: cwd.trim() } : {},
        );
        location.hash = '/sessions/' + result.id;
        closeAction();
      } else if (dialog === 'rewind') {
        const result = await api.mutate<Schema['RewindResponse']>(
          'POST',
          sessionPath(session.id) + '/rewind',
          { turns },
        );
        await controller?.refresh(session.id, true);
        return result;
      } else if (dialog === 'compact') {
        await controller?.attend(session.id);
        const result = await api.mutate<Schema['CompactResponse']>(
          'POST',
          sessionPath(session.id) + '/compact',
          {
            ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
            ...(keepRecent ? { keep_recent: true } : {}),
          } satisfies Schema['CompactRequestBody'],
        );
        await controller?.refresh(session.id, true);
        return result;
      }
      await runtime.queries.invalidateQueries();
    });
  }

  const items: MenuEntry[] = [
    ...(organized
      ? [
          {
            id: 'rename',
            label: 'Rename',
            icon: <IconEditOutlineRegular size={15} />,
            disabled: action.busy || deleting || !canWrite || Boolean(session.parent_id),
          },
          {
            id: 'pin',
            label: session.pinned_at ? 'Unpin' : 'Pin',
            icon: session.pinned_at ? (
              <IconPinFillRegular size={15} />
            ) : (
              <IconPinOutlineRegular size={15} />
            ),
            disabled: action.busy || deleting || !canWrite || Boolean(session.parent_id),
          },
        ]
      : []),
    {
      id: 'fork',
      label: 'Fork…',
      icon: <IconBranchOutlineRegular size={15} />,
      disabled: !canWrite || running,
    },
    {
      id: 'compact',
      label: 'Compact context…',
      icon: <IconCompactOutlineRegular size={15} />,
      disabled: !mutable || running,
    },
    {
      id: 'rewind',
      label: 'Rewind…',
      icon: <IconClockOutlineRegular size={15} />,
      disabled: !mutable || running,
    },
    { type: 'separator', id: 'sep-tools' },
    {
      id: 'tools',
      label: 'Available tools…',
      icon: <IconPluginPinwheelOutlineRegular size={15} />,
    },
    { type: 'separator', id: 'sep-export' },
    {
      id: 'export-markdown',
      label: 'Export transcript (markdown)',
      icon: <IconDownloadOutlineRegular size={15} />,
      disabled: action.busy,
    },
    {
      id: 'export-json',
      label: 'Export archive (json)',
      icon: <IconDownloadOutlineRegular size={15} />,
      disabled: action.busy,
    },
    { type: 'separator', id: 'sep-delete' },
    {
      id: 'delete',
      label: 'Delete…',
      icon: <IconTrashOutlineRegular size={15} />,
      danger: true,
      disabled: !canWrite || running,
    },
  ];

  return (
    <>
      <Menu
        open={menu}
        onClose={() => setMenu(false)}
        align="end"
        portal
        items={items}
        onSelect={(id) => {
          if (id === 'pin') void togglePin();
          else if (id === 'export-markdown') exportSession('markdown');
          else if (id === 'export-json') exportSession('json');
          else openAction(id);
        }}
        anchor={
          <Button
            variant="ghost"
            size="sm"
            disabled={action.busy || deleting}
            aria-label="Session actions"
            title="Session actions"
            onClick={() => setMenu((open) => !open)}
          >
            <IconEllipsisOutlineRegular size={18} />
          </Button>
        }
      />
      {dialog === 'rename' && <RenameDialog session={session} onClose={closeAction} />}
      <RiskConfirmation
        open={dialog === 'delete'}
        title="Delete session"
        description={`Delete “${session.title || 'New conversation'}”, its conversation, and its sub-agent sessions?`}
        acknowledgeLabel="I understand this cannot be undone."
        cancelLabel="Cancel"
        closeLabel="Close"
        confirmLabel={action.busy ? 'Deleting…' : 'Delete session'}
        acknowledged={acknowledged}
        disabled={!canWrite || running || deleting || action.busy}
        onAcknowledgedChange={setAcknowledged}
        onCancel={closeAction}
        onConfirm={() => void remove()}
      />
      <Modal
        open={Boolean(dialog) && dialog !== 'rename' && dialog !== 'delete'}
        onClose={closeAction}
        closeLabel="Close"
        title={
          dialog === 'pin'
            ? 'Could not update pin'
            : dialog === 'fork'
              ? 'Fork session'
              : dialog === 'compact'
                ? 'Compact context'
                : dialog === 'export'
                  ? 'Export session'
                  : dialog === 'tools'
                    ? 'Available tools'
                    : 'Rewind conversation'
        }
      >
        {dialog === 'pin' ? (
          <ErrorText error={action.error} />
        ) : dialog === 'tools' ? (
          <SessionTools sessionId={session.id} />
        ) : dialog === 'export' ? (
          <>
            {action.busy && <p className={css.muted}>Preparing download…</p>}
            <ErrorText error={action.error} />
          </>
        ) : (
          <form className={css.form} onSubmit={(event) => void execute(event)}>
            {dialog === 'fork' && (
              <label className={css.field}>
                <span>Working directory override</span>
                <Input
                  value={cwd}
                  placeholder="Inherit source directory"
                  onChange={(event) => setCwd(event.target.value)}
                />
              </label>
            )}
            {dialog === 'rewind' && (
              <>
                <NoticeRow
                  level="warn"
                  text="Remove the last turns from this conversation. Export a copy first if needed."
                />
                <label className={css.field}>
                  <span>Turns to remove</span>
                  <Input
                    type="number"
                    min="1"
                    required
                    value={turns}
                    onChange={(event) => setTurns(Number(event.target.value))}
                  />
                </label>
              </>
            )}
            {dialog === 'compact' && (
              <>
                <label className={css.field}>
                  <span>Compaction instructions</span>
                  <textarea
                    className={css.textarea}
                    value={instructions}
                    placeholder="Optional instructions"
                    onChange={(event) => setInstructions(event.target.value)}
                  />
                </label>
                <div className={css.switchRow}>
                  <Switch
                    checked={keepRecent}
                    onChange={setKeepRecent}
                    label="Keep recent turns"
                  />
                  <span className={css.switchLabel}>Keep recent turns verbatim</span>
                </div>
              </>
            )}
            <ErrorText error={action.error} />
            {action.result !== undefined && (
              <div role="status">
                <ActionResult value={action.result} />
              </div>
            )}
            <div className={css.formActions}>
              <Button
                variant="primary"
                type="submit"
                className={dialog === 'rewind' ? css.dangerAction : undefined}
                disabled={action.busy}
              >
                {action.busy
                  ? 'Working…'
                  : dialog === 'rewind'
                    ? 'Confirm rewind'
                    : dialog === 'fork'
                      ? 'Create fork'
                      : 'Compact now'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

function ActionResult({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object') return null;
  const result = value as Record<string, unknown>;
  return (
    <div className={css.actionResult}>
      {typeof result.turns_removed === 'number' ? (
        <p>
          Removed {result.turns_removed} {result.turns_removed === 1 ? 'turn' : 'turns'}.{' '}
          {String(result.messages_after)} messages remain.
        </p>
      ) : typeof result.messages_before === 'number' &&
        typeof result.messages_after === 'number' ? (
        <p>
          Context compacted from {result.messages_before} to {result.messages_after} messages.
        </p>
      ) : null}
      <details>
        <summary>Result details</summary>
        <pre className={css.resultJson}>{JSON.stringify(value, null, 2)}</pre>
      </details>
    </div>
  );
}

function SessionTools({ sessionId }: { sessionId: string }) {
  const tools = useResource<Schema['ToolsResponse']>(sessionPath(sessionId) + '/tools');
  return (
    <div className={css.tools}>
      <ErrorText error={tools.error} />
      {tools.isPending && <p className={css.muted}>Loading available tools…</p>}
      {tools.data?.tools.length === 0 && <p className={css.muted}>No tool catalog available.</p>}
      {tools.data?.tools.map((tool) => (
        <article className={css.toolEntry} key={tool.name}>
          <h3>
            {tool.name}
            <span className={css.badge}>{tool.required_permission}</span>
            {tool.deferred && <span className={css.badge}>Deferred</span>}
          </h3>
          <p>{tool.description}</p>
        </article>
      ))}
    </div>
  );
}

// Mounted for each rename so polling cannot replace a title being edited.
function RenameDialog({
  session,
  onClose,
}: {
  session: Schema['SessionResponse'];
  onClose: () => void;
}) {
  const { controller } = useConnection();
  const [title, setTitle] = useState(session.title);
  const action = useAction();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function save(value: string) {
    await action.run(async () => {
      if (!controller) return;
      await controller.patchSettings(session.id, { title: value });
      if (mounted.current) onClose();
    });
  }
  return (
    <Modal open onClose={onClose} title="Rename session" closeLabel="Close">
      <form
        className={css.form}
        onSubmit={(event) => {
          event.preventDefault();
          void save(title);
        }}
      >
        <label className={css.field}>
          <span>Title</span>
          <Input
            value={title}
            disabled={action.busy}
            onChange={(event) => setTitle(event.target.value)}
            onFocus={(event) => event.target.select()}
            placeholder="Use the first message"
            autoComplete="off"
            data-modal-autofocus
          />
        </label>
        <ErrorText error={action.error} />
        <div className={css.formActions}>
          <Button variant="ghost" disabled={action.busy} onClick={() => void save('')}>
            Use first message
          </Button>
          <Button variant="primary" type="submit" disabled={action.busy || title === session.title}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
