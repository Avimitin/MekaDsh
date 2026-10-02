import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useCan, useConnection, useRuntime, useSettings } from '../../connections/context';
import { useSessionStates } from '../../session/hooks';
import { ReadingPane } from '../chat/reading-options';
import { ConversationHeader } from '../chat/ConversationHeader';
import { Conversation } from '../chat/Conversation';
import { EmptyHero } from '../chat/EmptyHero';
import { WorkspacePanel } from '../panels/WorkspacePanel';
import { WorkspacePanelContext, type WorkspaceTab } from '../../features/workspace-panel';
import { Modal } from '../primitives/Modal';
import { useNarrowViewport } from '../layout/useNarrowViewport';
import css from './SessionsPage.module.css';

const DETAILS_MIN = 280;
const DETAILS_MAX = 760;
const DETAILS_DEFAULT = 420;

const clampDetails = (width: number) =>
  Math.round(Math.min(DETAILS_MAX, Math.max(DETAILS_MIN, width)));

/** The conversation workspace: header, chat column with docked composer, and the details track. */
export function SessionsPage({ id }: { id?: string | undefined }) {
  const { connection } = useConnection();
  return <SessionWorkspace key={`${connection?.id}:${id ?? 'new'}`} id={id} />;
}

function SessionWorkspace({ id }: { id?: string | undefined }) {
  const runtime = useRuntime();
  const canRead = useCan('sessions:r');
  const { layout } = useSettings();
  const states = useSessionStates();
  const selected = id ? states.find((candidate) => candidate.id === id) : undefined;
  const session = selected?.session;
  const detailsOpen = Boolean(id && layout.detailsOpen && session);
  const narrow = useNarrowViewport(1023);
  const [tab, setTab] = useState<WorkspaceTab>('files');
  const [selectedPath, setSelectedPath] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const openPanel = useCallback((next: WorkspaceTab, path?: string) => {
    setTab(next);
    if (path !== undefined) setSelectedPath(path);
    runtime.storage.layout({ detailsOpen: true });
  }, [runtime.storage]);
  const closePanel = useCallback(() => {
    runtime.storage.layout({ detailsOpen: false });
    document.querySelector<HTMLButtonElement>('[data-workspace-toggle]')?.focus({ preventScroll: true });
  }, [runtime.storage]);
  const [dragWidth, setDragWidth] = useState<number>();
  const detailsWidth = clampDetails(dragWidth ?? layout.detailsWidth ?? DETAILS_DEFAULT);
  const title = session?.title.trim();
  useEffect(() => {
    document.title = session ? `mekadsh · ${title || 'New conversation'}` : 'mekadsh';
    return () => {
      document.title = 'mekadsh';
    };
  }, [session, title]);
  if (!canRead)
    return (
      <div className={css.unavailable}>
        <h1>Session access is unavailable</h1>
        <p>This token needs sessions:r to view sessions.</p>
      </div>
    );
  return (
    <WorkspacePanelContext value={{ tab, selectedPath, openPanel }}>
    <div className={css.workspace}>
      <ReadingPane>
        <ConversationHeader state={selected} />
        {id ? <Conversation sessionId={id} /> : <EmptyHero />}
      </ReadingPane>
      {detailsOpen && selected && (narrow || expanded ? (
        <Modal
          open
          headless
          title="Workspace panel"
          className={expanded && !narrow ? css.expandedDetails : css.mobileDetails}
          onClose={closePanel}
        >
          <div id="session-details" className={css.mobileDetailsBody}>
            <WorkspacePanel state={selected} onClose={closePanel} expanded={expanded}
              onExpand={narrow ? undefined : () => setExpanded(false)} />
          </div>
        </Modal>
      ) : (
        <aside
          id="session-details"
          className={css.detailsTrack}
          style={{ width: detailsWidth }}
          aria-label="Workspace panel"
        >
          <DetailsDragHandle
            value={detailsWidth}
            onResize={(width) => setDragWidth(clampDetails(width))}
            onCommit={(width) => {
              setDragWidth(undefined);
              runtime.storage.layout({ detailsWidth: clampDetails(width) });
            }}
            onCancel={() => setDragWidth(undefined)}
          />
          <WorkspacePanel state={selected} onClose={closePanel} expanded={false} onExpand={() => setExpanded(true)} />
        </aside>
      ))}
    </div>
    </WorkspacePanelContext>
  );
}

/**
 * The details track's invisible 8px drag strip on its leading edge (dsh AppFrame's panel-track
 * handle): pointer capture with rAF-throttled deltas against the width at gesture start.
 */
function DetailsDragHandle({
  value,
  onResize,
  onCommit,
  onCancel,
}: {
  value: number;
  onResize: (width: number) => void;
  onCommit: (width: number) => void;
  onCancel: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const capture = useRef<{ element: HTMLDivElement; id: number } | null>(null);
  const origin = useRef(0);
  const base = useRef(0);
  const latest = useRef(0);
  const frame = useRef<number | null>(null);
  const callbacks = useRef({ onResize, onCommit, onCancel });
  callbacks.current = { onResize, onCommit, onCancel };

  const endDrag = useCallback((commit: boolean) => {
    const active = capture.current;
    if (active === null) return;
    capture.current = null;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    if (active.element.hasPointerCapture(active.id))
      active.element.releasePointerCapture(active.id);
    setDragging(false);
    if (commit) callbacks.current.onCommit(latest.current);
    else callbacks.current.onCancel();
  }, []);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (capture.current !== null) callbacks.current.onCancel();
    },
    [],
  );

  return (
    <div
      className={css.detailsHandle}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize workspace panel"
      aria-controls="session-details"
      aria-valuenow={value}
      aria-valuemin={DETAILS_MIN}
      aria-valuemax={DETAILS_MAX}
      data-dragging={dragging || undefined}
      title="Drag to resize. Double-click to reset."
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary || capture.current !== null) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        capture.current = { element: event.currentTarget, id: event.pointerId };
        origin.current = event.clientX;
        base.current = value;
        latest.current = value;
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (capture.current?.id !== event.pointerId) return;
        // Dragging left widens the right-hand track.
        latest.current = base.current - (event.clientX - origin.current);
        frame.current ??= requestAnimationFrame(() => {
          frame.current = null;
          callbacks.current.onResize(latest.current);
        });
      }}
      onPointerUp={(event) => {
        if (capture.current?.id !== event.pointerId) return;
        latest.current = base.current - (event.clientX - origin.current);
        endDrag(true);
      }}
      onPointerCancel={() => endDrag(false)}
      onLostPointerCapture={() => endDrag(false)}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const step = event.shiftKey ? 48 : 16;
        const width =
          event.key === 'ArrowLeft'
            ? value + step
            : event.key === 'ArrowRight'
              ? value - step
              : event.key === 'Home'
                ? DETAILS_MIN
                : event.key === 'End'
                  ? DETAILS_MAX
                  : undefined;
        if (width !== undefined) {
          event.preventDefault();
          onCommit(width);
        }
      }}
      onDoubleClick={() => onCommit(DETAILS_DEFAULT)}
    />
  );
}

export function SessionRoute() {
  const { sessionId } = useParams({ from: '/sessions/$sessionId' });
  return <SessionsPage id={sessionId} />;
}
