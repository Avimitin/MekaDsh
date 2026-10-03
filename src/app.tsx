import { useEffect, useRef, useState, Suspense } from 'react';
import { Outlet, useLocation } from '@tanstack/react-router';
import type { ConnectionRuntime } from './connections/runtime';
import { RuntimeContext, useConnection, useRuntime, useSettings } from './connections/context';
import { useSessionStates } from './session/hooks';
import { trackFocusInput } from './lib/focus-input';
import { useVisualViewport } from './lib/visual-viewport';
import { useShortcut } from './lib/use-shortcut';
import { SessionNavigationContext } from './features/session-navigation';
import { useNewConversation } from './features/use-new-conversation';
import { supportsSessionOrganization } from './api/version';
import { AppFrame } from './ui/layout/AppFrame';
import { Sidebar } from './ui/sidebar/Sidebar';
import { Welcome } from './ui/welcome/Welcome';
import { ConnectionBanner } from './ui/shell/ConnectionBanner';
import { ApprovalTray } from './ui/shell/ApprovalTray';
import { NotificationToasts } from './ui/shell/NotificationToasts';
import { ShortcutsDialog } from './ui/shell/ShortcutsDialog';
import { ToastViewport } from './ui/primitives/toast-store';
import { useDeploymentConfig } from './features/files/hooks';

export function App({ runtime }: { runtime: ConnectionRuntime }) {
  useDeploymentConfig();
  useEffect(trackFocusInput, []);
  useEffect(() => runtime.start(), [runtime]);
  return (
    <RuntimeContext.Provider value={runtime}>
      <Shell />
      <ToastViewport />
      <NotificationToasts />
    </RuntimeContext.Provider>
  );
}

function Shell() {
  const { connection } = useConnection();
  // The single remount point for connection or credential changes; nothing below needs its own key.
  return <Workspace key={connection?.id + ':' + connection?.authority} />;
}

function Workspace() {
  useVisualViewport();
  const state = useConnection();
  const runtime = useRuntime();
  const settings = useSettings();
  const location = useLocation();
  const sessions = useSessionStates();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutsFocus = useRef<HTMLElement | null>(null);
  const composerFocusRef = useRef<string | null>(null);
  const [searchRequested, setSearchRequested] = useState(false);
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false);
  useEffect(() => {
    const expected =
      composerFocusRef.current === 'new' ? '/sessions' : '/sessions/' + composerFocusRef.current;
    if (
      composerFocusRef.current &&
      location.pathname !== expected &&
      !(composerFocusRef.current === 'new' && location.pathname === '/')
    )
      composerFocusRef.current = null;
  }, [location.pathname]);
  const canCreate = Boolean(state.api && state.info?.scopes.includes('sessions:w'));
  const newConversation = useNewConversation((id) => {
    if (['', '#/', '#/sessions'].includes(window.location.hash)) {
      composerFocusRef.current = id;
      window.location.hash = '/sessions/' + id;
    }
  });
  function newSession() {
    if (!canCreate) return;
    setMobileSessionsOpen(false);
    setSearchRequested(false);
    composerFocusRef.current = 'new';
    if (location.pathname !== '/' && location.pathname !== '/sessions')
      window.location.hash = '/sessions';
    else {
      const input = document.querySelector<HTMLTextAreaElement>(
        '[data-composer="new"] textarea',
      );
      if (input && !input.disabled && input.getClientRects().length) {
        // A mobile drawer releases its background isolation after this event.
        requestAnimationFrame(() => {
          if (!input.isConnected || input.closest('[inert]')) return;
          composerFocusRef.current = null;
          input.focus();
        });
      }
    }
  }
  function openShortcuts() {
    shortcutsFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setShortcutsOpen(true);
  }
  useShortcut('newSession', newSession, canCreate);
  useShortcut(
    'searchSessions',
    () => {
      composerFocusRef.current = null;
      setSearchRequested(true);
      if (
        location.pathname !== '/' &&
        location.pathname !== '/sessions' &&
        !location.pathname.startsWith('/sessions/')
      )
        window.location.hash = '/sessions';
    },
    Boolean(
      state.api &&
      state.info?.scopes.includes('sessions:r') &&
      supportsSessionOrganization(state.info.version),
    ),
  );
  useShortcut(
    'showShortcuts',
    () => {
      if (shortcutsOpen) setShortcutsOpen(false);
      else openShortcuts();
    },
    Boolean(state.api),
  );
  // Theme: dsh tokens switch on body[data-ds-dark-theme]; the content font dial is a body variable.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches);
      document.body.toggleAttribute('data-ds-dark-theme', dark);
      document.body.style.setProperty(
        '--dsh-content-font-size',
        settings.conversationFontSize + 'px',
      );
      document.body.style.setProperty(
        '--dsh-content-font-delta',
        settings.conversationFontSize - 14 + 'px',
      );
      const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (themeColor) themeColor.content = dark ? 'rgb(21, 21, 23)' : '#ffffff';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme, settings.conversationFontSize]);
  useEffect(() => {
    if (!state.controller) return;
    const controller = state.controller;
    const timer = setInterval(() => {
      controller.expireApprovals();
    }, 1000);
    return () => clearInterval(timer);
  }, [state.controller]);
  useEffect(() => {
    if (!state.controller) return;
    const controller = state.controller;
    const refresh = () => {
      // An unloaded session has no feed to report changes, such as another process's turns.
      for (const session of controller.getSnapshot())
        if (['connected', 'unloaded'].includes(session.feed) && !session.running)
          void controller.refresh(session.id);
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [state.controller]);
  if (!state.api) return <Welcome />;
  return (
    <SessionNavigationContext.Provider
      value={{
        newSession,
        searchRequested,
        finishSearch: () => setSearchRequested(false),
        composerFocusRef,
        mobileSessionsOpen,
        setMobileSessionsOpen,
        newConversation,
      }}
    >
      <AppFrame sidebar={<Sidebar />}>
        <ConnectionBanner />
        <Suspense fallback={<p role="status">Loading page…</p>}>
          <Outlet />
        </Suspense>
      </AppFrame>
      <ApprovalTray />
      <ShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        returnFocus={shortcutsFocus}
      />
      {runtime.storage.warning && (
        <p role="status" style={{ position: 'fixed', insetInline: 0, bottom: 0 }}>
          {runtime.storage.warning}
        </p>
      )}
      <span className="sr-only" aria-live="polite">
        {sessions.reduce((sum, s) => sum + s.approvals.length, 0)} approvals waiting.{' '}
        {location.pathname.split('/')[1] || 'Sessions'} view.
      </span>
    </SessionNavigationContext.Provider>
  );
}
