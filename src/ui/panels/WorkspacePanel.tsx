import { lazy, Suspense, useEffect, useRef, type KeyboardEvent } from 'react';
import type { SessionState } from '../../session/controller';
import { useWorkspacePanel, type WorkspaceTab } from '../../features/workspace-panel';
import { DetailsPanel } from '../pages/details/DetailsPanel';
import { IconCloseOutlineRegular, IconCodeOutlineRegular, IconFlatListOutlineRegular,
  IconSettingsOutlineRegular, IconPanelLeftOutlineRegular } from '../icons';
import css from './WorkspacePanel.module.css';

const DeliverablesPanel = lazy(() => import('../workspace/Deliverables').then((m) => ({ default: m.DeliverablesPanel })));
const TrajectoryPanel = lazy(() => import('../trajectory/TrajectoryPanel').then((m) => ({ default: m.TrajectoryPanel })));
const tabs = [
  { id: 'files', label: 'Files', icon: IconCodeOutlineRegular },
  { id: 'activity', label: 'Activity', icon: IconFlatListOutlineRegular },
  { id: 'session', label: 'Session', icon: IconSettingsOutlineRegular },
] as const;

/** Harness's strip + active pane anatomy, backed by meka's existing session snapshots. */
export function WorkspacePanel({ state, onClose, expanded, onExpand }: {
  state: SessionState;
  onClose: () => void;
  expanded: boolean;
  onExpand?: (() => void) | undefined;
}) {
  const panel = useWorkspacePanel();
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    strip.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
  }, []);
  if (!panel) return null;
  function keydown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : undefined;
    if (next === undefined) return;
    event.preventDefault();
    strip.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    panel?.openPanel(tabs[next]!.id);
  }
  return (
    <div className={css.root}>
      <div className={css.header}>
        <div ref={strip} className={css.tabs} role="tablist" aria-label="Workspace views">
          {tabs.map(({ id, label, icon: Icon }, index) => (
            <button key={id} id={`workspace-tab-${id}`} type="button" role="tab"
              aria-selected={panel.tab === id} aria-controls={`workspace-pane-${id}`}
              tabIndex={panel.tab === id ? 0 : -1} className={css.tab}
              onClick={() => panel.openPanel(id)} onKeyDown={(event) => keydown(event, index)}>
              <Icon size={14} /><span>{label}</span>
            </button>
          ))}
        </div>
        {onExpand && <button type="button" className={css.iconButton} onClick={onExpand}
          aria-label={expanded ? 'Restore panel width' : 'Expand workspace panel'} title={expanded ? 'Restore panel width' : 'Expand workspace panel'}>
          <IconPanelLeftOutlineRegular size={15} />
        </button>}
        <button type="button" className={css.iconButton} onClick={onClose} aria-label="Close workspace panel" title="Close panel">
          <IconCloseOutlineRegular size={15} />
        </button>
      </div>
      {tabs.map(({ id }) => (
        <div key={id} role="tabpanel" id={`workspace-pane-${id}`} aria-labelledby={`workspace-tab-${id}`}
          className={css.body} hidden={panel.tab !== id} tabIndex={0}>
          {panel.tab === id && <Suspense fallback={<p className={css.loading} role="status">Loading view…</p>}>
            <PanelBody tab={id} state={state} selectedPath={panel.selectedPath} />
          </Suspense>}
        </div>
      ))}
    </div>
  );
}

function PanelBody({ tab, state, selectedPath }: { tab: WorkspaceTab; state: SessionState; selectedPath: string | undefined }) {
  const workspace = useWorkspacePanel();
  if (tab === 'files') return <DeliverablesPanel state={state}
    onSelectPath={(path) => workspace?.openPanel('files', path)}
    {...(selectedPath === undefined ? {} : { selectedPath })} />;
  if (tab === 'activity') return <TrajectoryPanel state={state} />;
  return <DetailsPanel sessionId={state.id} />;
}
