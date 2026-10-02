/**
 * Two-column shell frame (dsh AppFrame, adapted: the right column is the chat
 * stream's, so this frame owns only sidebar | center). Owns the grid tracks,
 * the sidebar drag handle (pointer capture + rAF throttle), the collapse
 * toggle (header button through SidebarLayoutContext, or Ctrl/Cmd+B), and the
 * skip link. Width and collapsed state persist in settings.layout through
 * runtime.storage.layout; collapse is a slide + crossfade (the Sidebar holds
 * the crossfade, the grid track holds the slide).
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRuntime, useSettings } from '../../connections/context';
import { useShortcut } from '../../lib/use-shortcut';
import { useSessionNavigation } from '../../features/session-navigation';
import { IconPanelLeftOutlineRegular } from '../icons';
import { useModalLayer } from '../primitives/useModalLayer';
import { useNarrowViewport } from './useNarrowViewport';
import css from './AppFrame.module.css';

/** Sidebar drag clamp floor. */
export const SIDEBAR_MIN = 264;
/** Sidebar drag clamp ceiling. */
export const SIDEBAR_MAX = 420;
/** Sidebar width before any user drag. */
export const SIDEBAR_DEFAULT = 280;
/** Closed-sidebar rail: a 24px icon column between 16px horizontal paddings. */
export const SIDEBAR_COLLAPSED = 56;

function clampWidth(px: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(px)));
}

/** What the sidebar column needs from the frame: its state and the toggle. */
export const SidebarLayoutContext = createContext<{
  collapsed: boolean;
  /** Rendered track width in px (56 collapsed). */
  width: number;
  toggle: () => void;
} | null>(null);

export function useSidebarLayout() {
  const value = useContext(SidebarLayoutContext);
  if (!value) throw new Error('Sidebar layout is unavailable.');
  return value;
}

/**
 * One drag handle: pointer capture, rAF-throttled dx reports against the
 * drag-start origin. An 8px invisible strip straddling the sidebar border.
 */
function DragHandle({
  left,
  onStart,
  onDrag,
  onEnd,
  onResize,
}: {
  left: number;
  onStart: () => void;
  onDrag: (dx: number) => void;
  onEnd: () => void;
  onResize: (width: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const origin = useRef(0);
  const latest = useRef(0);
  const frame = useRef<number | null>(null);
  const capture = useRef<{ element: HTMLDivElement; id: number } | null>(null);
  const callbacks = useRef({ onStart, onDrag, onEnd });
  callbacks.current = { onStart, onDrag, onEnd };

  const endDrag = useCallback(() => {
    const active = capture.current;
    if (active === null) return;
    capture.current = null;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    if (active.element.hasPointerCapture(active.id)) active.element.releasePointerCapture(active.id);
    setDragging(false);
    callbacks.current.onEnd();
  }, []);
  useEffect(() => endDrag, [endDrag]);

  return (
    <div
      className={css.handle}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-controls="workspace-sidebar"
      aria-valuenow={left}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      tabIndex={0}
      style={{ left }}
      data-dragging={dragging || undefined}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const step = event.shiftKey ? 48 : 16;
        const width = event.key === 'ArrowLeft' ? left - step
          : event.key === 'ArrowRight' ? left + step
            : event.key === 'Home' ? SIDEBAR_MIN
              : event.key === 'End' ? SIDEBAR_MAX : undefined;
        if (width === undefined) return;
        event.preventDefault();
        onResize(clampWidth(width));
      }}
      onDoubleClick={() => onResize(SIDEBAR_DEFAULT)}
      onPointerDown={(event) => {
        if (event.button !== 0 || capture.current !== null) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        capture.current = { element: event.currentTarget, id: event.pointerId };
        origin.current = event.clientX;
        latest.current = event.clientX;
        callbacks.current.onStart();
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (capture.current?.id !== event.pointerId) return;
        latest.current = event.clientX;
        frame.current ??= requestAnimationFrame(() => {
          frame.current = null;
          callbacks.current.onDrag(latest.current - origin.current);
        });
      }}
      onPointerUp={(event) => {
        if (capture.current?.id !== event.pointerId) return;
        callbacks.current.onDrag(event.clientX - origin.current);
        endDrag();
      }}
      onPointerCancel={(event) => {
        if (capture.current?.id === event.pointerId) endDrag();
      }}
      onLostPointerCapture={(event) => {
        if (capture.current?.id === event.pointerId) endDrag();
      }}
    />
  );
}

/**
 * The two-column frame. `sidebar` receives its layout through
 * SidebarLayoutContext; `children` render inside the center column's
 * <main id="main-content"> as-is (the connection banner is the first child).
 */
export function AppFrame({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const runtime = useRuntime();
  const settings = useSettings();
  const mobile = useNarrowViewport();
  const { mobileSessionsOpen, setMobileSessionsOpen } = useSessionNavigation();
  const drawerOpen = mobile && mobileSessionsOpen;
  const collapsed = mobile ? !drawerOpen : settings.layout.navigationCollapsed;
  const preference = collapsed
    ? SIDEBAR_COLLAPSED
    : clampWidth(settings.layout.sessionsWidth ?? SIDEBAR_DEFAULT);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const closeDrawer = useCallback(() => setMobileSessionsOpen(false), [setMobileSessionsOpen]);
  useModalLayer(sidebarRef, drawerOpen, closeDrawer);

  useEffect(() => {
    if (mobile || !mobileSessionsOpen) return;
    runtime.storage.layout({ navigationCollapsed: false });
    setMobileSessionsOpen(false);
  }, [mobile, mobileSessionsOpen, runtime.storage, setMobileSessionsOpen]);

  const toggle = useCallback(() => {
    if (mobile) setMobileSessionsOpen(!mobileSessionsOpen);
    else runtime.storage.layout({ navigationCollapsed: !collapsed });
  }, [runtime.storage, collapsed, mobile, mobileSessionsOpen, setMobileSessionsOpen]);
  useShortcut('toggleSidebar', toggle);

  // The drag base is the rendered width captured at drag start; it stays
  // frozen for the whole gesture so dx deltas do not compound. Track-level
  // transitions pause while dragging: eased tracks would detach the column
  // edge from the pointer.
  const dragBase = useRef(0);
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(preference);
  widthRef.current = preference;
  const onStart = useCallback(() => {
    dragBase.current = widthRef.current;
    setDragging(true);
  }, []);
  const onDrag = useCallback(
    (dx: number) => {
      runtime.storage.layout({ sessionsWidth: clampWidth(dragBase.current + dx) });
    },
    [runtime.storage],
  );
  const onEnd = useCallback(() => setDragging(false), []);

  // Track easing is scoped to the discrete collapse toggle: data-animating
  // goes up when the collapse state flips and comes down at transition end
  // (timeout as the reduced-motion fallback).
  const [animating, setAnimating] = useState(0);
  const previousCollapsed = useRef(collapsed);
  useLayoutEffect(() => {
    if (previousCollapsed.current === collapsed) return;
    previousCollapsed.current = collapsed;
    setAnimating((token) => token + 1);
  }, [collapsed]);
  useEffect(() => {
    if (animating === 0) return;
    const frame = frameRef.current;
    if (frame === null) return;
    const settle = () => setAnimating(0);
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === frame && event.propertyName === 'grid-template-columns') settle();
    };
    frame.addEventListener('transitionend', onTransitionEnd);
    const timer = setTimeout(settle, 600);
    return () => {
      frame.removeEventListener('transitionend', onTransitionEnd);
      clearTimeout(timer);
    };
  }, [animating]);

  return (
    <div
      ref={frameRef}
      className={css.frame}
      style={{ gridTemplateColumns: mobile ? 'minmax(0px, 1fr)' : `${preference}px minmax(0px, 1fr)` }}
      data-mobile={mobile || undefined}
      data-sidebar-collapsed={collapsed || undefined}
      data-dragging={dragging || undefined}
      data-animating={animating > 0 || undefined}
    >
      <a
        href="#main-content"
        className={css.skipLink}
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      <div
        ref={sidebarRef}
        className={css.sidebarLayer}
        hidden={mobile && !drawerOpen}
        role={drawerOpen ? 'dialog' : undefined}
        aria-modal={drawerOpen ? true : undefined}
        aria-label={drawerOpen ? 'Workspace navigation' : undefined}
        tabIndex={drawerOpen ? -1 : undefined}
      >
        {drawerOpen && <div className={css.drawerMask} aria-hidden="true" onClick={closeDrawer} />}
        <div id="workspace-sidebar" className={css.sidebarCol}>
          <SidebarLayoutContext.Provider value={{ collapsed, width: mobile ? SIDEBAR_DEFAULT : preference, toggle }}>
            {sidebar}
          </SidebarLayoutContext.Provider>
        </div>
      </div>
      <div className={css.centerCol}>
        {mobile && (
          <div className={css.mobileBar}>
            <button
              type="button"
              className={css.mobileToggle}
              aria-label="Open sidebar"
              aria-expanded={drawerOpen}
              aria-controls="workspace-sidebar"
              onClick={toggle}
            >
              <IconPanelLeftOutlineRegular size={20} />
            </button>
            <span>mekadsh</span>
          </div>
        )}
        <main id="main-content" tabIndex={-1} className={css.main}>
          {children}
        </main>
      </div>
      {/* The collapsed rail is fixed-width: no resize handle while closed. */}
      {!mobile && !collapsed && (
        <DragHandle
          left={preference}
          onStart={onStart}
          onDrag={onDrag}
          onEnd={onEnd}
          onResize={(sessionsWidth) => runtime.storage.layout({ sessionsWidth })}
        />
      )}
    </div>
  );
}
