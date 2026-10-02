/**
 * Sidebar shell (port of dsh ui-sidebar SidebarRoot): column geometry, brand,
 * New chat, global panel navigation, the session tree region, and the footer.
 * Collapse is a slide plus crossfade: content freezes at its expanded width
 * (inline style) and fades out in place while the sliding column (AppFrame
 * grid tracks) clips it; at settle the wide-only content unmounts and the
 * controls enter the 56px rail from the same horizontal offset on one fade.
 * The column also owns whether the scroll regions nested in it draw a
 * scrollbar at all: the shell tracks the pointer and rebinds the themed
 * scrollbar indirection away while it is elsewhere.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from '@tanstack/react-router';
import { cn } from '../../lib/cn';
import { useCan, useConnection, useRuntime, useSettings } from '../../connections/context';
import { useSessionNavigation } from '../../features/session-navigation';
import { appleKeyboard, shortcutAttribute, shortcutKeys } from '../../lib/shortcut-keys';
import { Tooltip } from '../primitives/Tooltip';
import { Menu } from '../primitives/Menu';
import { ShortcutKeys } from '../primitives/ShortcutKeys';
import {
  IconAlarmClockOutlineRegular,
  IconChevronsUpDownOutlineRegular,
  IconCordisPluginOutlineRegular,
  IconDatabaseOutlineRegular,
  IconNewChatOutlineMedium,
  IconNewChatOutlineRegular,
  IconPanelLeftOutlineRegular,
  IconQueueOutlineRegular,
  IconSettingsOutlineRegular,
  IconSkillOutlineRegular,
} from '../icons';
import { useSidebarLayout } from '../layout/AppFrame';
import { SessionTree } from './SessionTree';
import { ShortcutsButton } from '../shell/ShortcutsDialog';
import css from './Sidebar.module.css';

/** Wide-content unmount delay; matches the 150ms wide-content fade-out. */
const COLLAPSE_SETTLE_MS = 150;

/** Brand mark, base-path aware (public assets are served under BASE_URL). */
const logo = import.meta.env.BASE_URL + 'meka.webp';

/**
 * How long the column's scrollbars stay drawn after the pointer leaves it.
 * The bar is a pointer affordance here, and hiding it on the leave event
 * itself makes it blink out while the pointer is only crossing the column's
 * edge, on the way to the conversation or around a portalled menu.
 */
const SCROLLBAR_LINGER_MS = 2000;

const navEntries = [
  { name: 'Sessions', path: '/sessions', icon: IconQueueOutlineRegular, scope: 'sessions:r' },
  { name: 'Memory', path: '/memory', icon: IconDatabaseOutlineRegular, scope: 'memory:r' },
  { name: 'Skills', path: '/skills', icon: IconSkillOutlineRegular },
  { name: 'Schedules', path: '/schedules', icon: IconAlarmClockOutlineRegular, scope: 'schedule:r' },
  { name: 'MCP', path: '/mcp', icon: IconCordisPluginOutlineRegular },
] as const;

/** One global navigation row; icon-only with a tooltip in the rail. */
function NavRow({
  name,
  path,
  icon: Icon,
  wide,
  active,
}: {
  name: string;
  path: string;
  icon: typeof IconQueueOutlineRegular;
  wide: boolean;
  active: boolean;
}) {
  const { setMobileSessionsOpen } = useSessionNavigation();
  return (
    <Tooltip label={name} delayMs={500} disabled={wide}>
      <a
        href={'#' + path}
        className={cn(css.panelRow, active && css.panelActive, wide && css.wide)}
        aria-label={name}
        aria-current={active ? 'page' : undefined}
        onClick={() => setMobileSessionsOpen(false)}
      >
        <span className={css.panelGlyph} aria-hidden="true">
          <Icon size={wide ? 16 : 18} />
        </span>
        {wide && <span className={cn(css.panelTitle, css.wide)}>{name}</span>}
      </a>
    </Tooltip>
  );
}

/** Footer connection switcher: the active connection, a menu when saved others exist. */
function ConnectionSwitcher({ wide }: { wide: boolean }) {
  const runtime = useRuntime();
  const settings = useSettings();
  const { connection, busy } = useConnection();
  const [open, setOpen] = useState(false);
  // The rail has no room for the connection name; the settings page owns it there.
  if (!wide || !connection || settings.connections.length <= 1) return null;
  let host = connection.endpoint;
  try {
    host = new URL(connection.endpoint).host;
  } catch {
    /* Stored endpoints are normalized; show the raw value if one is not. */
  }
  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      items={settings.connections.map((record) => ({ id: record.id, label: record.name }))}
      selectedId={connection.id}
      onSelect={(id) => {
        setOpen(false);
        const record = settings.connections.find((candidate) => candidate.id === id);
        if (record && record.id !== connection.id) void runtime.connect(record);
      }}
      side="top"
      align="start"
      portal
      className={css.switcherHost}
      anchor={
        <Tooltip label="Switch connection" delayMs={500} disabled={wide}>
          <button
            type="button"
            className={cn(css.panelRow, wide && css.wide)}
            aria-label={`Switch connection: ${connection.name}`}
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={busy}
            onClick={() => setOpen((value) => !value)}
          >
            <span className={cn(css.switcherText, wide && css.wide)}>
              <span className={css.switcherName}>{connection.name}</span>
              {wide && <span className={css.switcherEndpoint}>{host}</span>}
            </span>
            {wide && (
              <span className={css.panelMeta} aria-hidden="true">
                <IconChevronsUpDownOutlineRegular size={14} />
              </span>
            )}
          </button>
        </Tooltip>
      }
    />
  );
}

/** The sidebar column shell. */
export function Sidebar() {
  const { connection } = useConnection();
  const { collapsed, width, toggle: toggleSidebar } = useSidebarLayout();
  const { newSession } = useSessionNavigation();
  const canWrite = useCan('sessions:w');
  const { info } = useConnection();
  const location = useLocation();
  // Wide content stays mounted while the collapse animates (fading via
  // .collapsed .wide), unmounts at settle, and remounts right away on expand.
  const [settled, setSettled] = useState(collapsed);
  useEffect(() => {
    if (!collapsed) {
      setSettled(false);
      return;
    }
    const timer = window.setTimeout(() => setSettled(true), COLLAPSE_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [collapsed]);
  const wide = !collapsed || !settled;
  // Freeze the content at its expanded width while it fades out (collapsed &&
  // wide): the sliding column then clips it instead of reflowing it. The rail
  // layout (.collapsed styles) only applies once the fade settles.
  const lastWideWidth = useRef(width);
  if (!collapsed) lastWideWidth.current = width;
  // Rail-in only crossfades a live collapse: a refresh straight into the
  // collapsed state renders the rail statically (no delay-hidden icons).
  const everWide = useRef(!collapsed);
  if (!collapsed) everWide.current = true;

  // Scrollbars in the column follow the pointer (.quietBars rebinds them
  // away): drawn while it is inside, and for SCROLLBAR_LINGER_MS after it
  // leaves. A pointer that returns within that window cancels the pending
  // hide rather than restarting from a hidden bar.
  const column = useRef<HTMLDivElement>(null);
  const [pointerInside, setPointerInside] = useState(false);
  const lingerTimer = useRef<number | undefined>(undefined);
  const armLinger = () => {
    if (lingerTimer.current !== undefined) return;
    lingerTimer.current = window.setTimeout(() => {
      lingerTimer.current = undefined;
      setPointerInside(false);
    }, SCROLLBAR_LINGER_MS);
  };
  const cancelLinger = () => {
    window.clearTimeout(lingerTimer.current);
    lingerTimer.current = undefined;
  };
  // Leaving is decided by the column's BOX, not by DOM containment, and only
  // while the bars are drawn: a portalled overlay above the column is outside
  // its box but fires no pointerleave here. The element's own leave stays as
  // the one signal geometry cannot give: a pointer leaving the window emits
  // no further moves.
  useEffect(() => {
    if (!pointerInside) return;
    const onMove = (event: PointerEvent) => {
      const rect = column.current?.getBoundingClientRect();
      if (rect === undefined) return;
      const inside =
        event.clientX >= rect.left &&
        event.clientX < rect.right &&
        event.clientY >= rect.top &&
        event.clientY < rect.bottom;
      if (inside) cancelLinger();
      else armLinger();
    };
    document.addEventListener('pointermove', onMove);
    return () => {
      document.removeEventListener('pointermove', onMove);
      cancelLinger();
    };
  }, [pointerInside]);

  const apple = appleKeyboard();
  const toggleLabel = collapsed ? 'Open sidebar' : 'Collapse sidebar';
  const newKeys = shortcutKeys('newSession', apple);
  const toggle = (
    <Tooltip label={toggleLabel} shortcutKeys={shortcutKeys('toggleSidebar', apple)} delayMs={500}>
      <button
        type="button"
        className={cn(css.iconButton, css.toggle)}
        aria-label={toggleLabel}
        aria-keyshortcuts={shortcutAttribute('toggleSidebar')}
        aria-expanded={!collapsed}
        aria-controls="workspace-sidebar"
        onClick={toggleSidebar}
      >
        {!wide && (
          <span className={css.railMark} aria-hidden="true">
            <img src={logo} alt="" width={24} height={24} />
          </span>
        )}
        {/* Rail icons render at 18 (figma rail spec); expanded keeps 16. */}
        <IconPanelLeftOutlineRegular className={css.panelIcon} size={wide ? 16 : 18} />
      </button>
    </Tooltip>
  );

  return (
    <div
      ref={column}
      className={cn(
        css.root,
        !wide && css.collapsed,
        !wide && everWide.current && css.railIn,
        collapsed && wide && css.fading,
        !pointerInside && css.quietBars,
      )}
      style={wide ? { width: collapsed ? lastWideWidth.current : width } : undefined}
      onPointerEnter={() => {
        cancelLinger();
        setPointerInside(true);
      }}
      onPointerLeave={() => armLinger()}
    >
      <div className={css.logoRow}>
        {/* Expanded, the brand doubles as a New session shortcut. */}
        {wide && (
          <button
            type="button"
            className={cn(css.brand, css.wide)}
            aria-label="New session"
            aria-keyshortcuts={shortcutAttribute('newSession')}
            disabled={!canWrite}
            onClick={() => newSession()}
          >
            <span className={css.brandIdentity} aria-hidden="true">
              <span className={css.brandMark}>
                <img src={logo} alt="" width={24} height={24} />
              </span>
              <span className={css.brandName}>mekadsh</span>
            </span>
          </button>
        )}
        {toggle}
      </div>

      {/* The label fades before the hover/focus shortcut. */}
      <Tooltip
        label="New chat"
        shortcutKeys={newKeys}
        delayMs={500}
        disabled={wide}
      >
        <button
          type="button"
          className={css.newSession}
          aria-label="New chat"
          aria-keyshortcuts={shortcutAttribute('newSession')}
          disabled={!canWrite}
          title={canWrite ? undefined : 'Requires sessions:w'}
          onClick={() => newSession()}
        >
          <span className={css.newSessionLabelMask}>
            <span className={css.newSessionContent}>
              {wide ? (
                <IconNewChatOutlineMedium size={14} />
              ) : (
                <IconNewChatOutlineRegular size={18} />
              )}
              {wide && <span className={cn(css.newSessionLabel, css.wide)}>New chat</span>}
            </span>
          </span>
          {wide && newKeys.length > 0 && (
            <span className={css.newSessionShortcut} aria-hidden="true">
              <ShortcutKeys keys={newKeys} />
            </span>
          )}
        </button>
      </Tooltip>

      <nav className={css.panelList} aria-label="Workspace">
        {navEntries
          .filter((entry) => !('scope' in entry) || (info?.scopes.includes(entry.scope) ?? false))
          .map((entry) => {
            const active =
              location.pathname.startsWith(entry.path) ||
              (entry.path === '/sessions' && location.pathname === '/');
            return (
              <NavRow
                key={entry.path}
                name={entry.name}
                path={entry.path}
                icon={entry.icon}
                wide={wide}
                active={active}
              />
            );
          })}
      </nav>

      {/* The browsing region fills the column between the controls and the
          foot in both states; its rail icon column rides the same area. */}
      <div className={css.regionArea}>
        <SessionTree key={connection?.id} wide={wide} />
      </div>

      {/* Footer actions stack above Settings in both sidebar widths. */}
      <div className={css.footArea}>
        <div className={css.footerActions}>
          <ConnectionSwitcher wide={wide} />
          <ShortcutsButton collapsed={!wide} />
        </div>
        <div className={css.settingsArea}>
          <NavRow
            name="Settings"
            path="/settings"
            icon={IconSettingsOutlineRegular}
            wide={wide}
            active={location.pathname.startsWith('/settings')}
          />
        </div>
      </div>
    </div>
  );
}
