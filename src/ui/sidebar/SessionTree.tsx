/**
 * The session browsing region (mekaweb SessionList logic, dsh WorkspaceBrowser
 * anatomy): section header with the expanding search and the sub-agent toggle,
 * the scrolling tree with infinite cursor pagination (40 per page, 15s
 * polling), debounced server search, skeleton and empty states, the "Load
 * more" row, and the import-archive row. Rail state keeps search as its own
 * 36px control that expands the sidebar into the search box.
 */
import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import type { Schema } from '../../api/client';
import { errorMessage } from '../../api/client';
import { supportsSessionOrganization } from '../../api/version';
import { useCan, useConnection, useResource, useRuntime } from '../../connections/context';
import { useSessionStates } from '../../session/hooks';
import { isSessionRunning } from '../../session/controller';
import type { SessionState } from '../../session/controller';
import { sessionStatus, useMarkSeen, useSeenSessions } from '../../session/unread';
import { useSessionNavigation } from '../../features/session-navigation';
import { useShortcut } from '../../lib/use-shortcut';
import { adjacentSession, appleKeyboard, shortcutAttribute, shortcutKeys } from '../../lib/shortcut-keys';
import { cn } from '../../lib/cn';
import { useSidebarLayout } from '../layout/AppFrame';
import { Tooltip } from '../primitives/Tooltip';
import { toast } from '../primitives/toast-store';
import {
  IconArchiveOutlineRegular,
  IconCloseFillRegular,
  IconQueueOutlineRegular,
  IconSearchOutlineRegular,
  IconWorkspaceTreeOutlineRegular,
} from '../icons';
import { SessionRow } from './SessionRow';
import { sessionTree } from './session-tree';
import css from './SessionTree.module.css';

/**
 * Column slide length (--ds-transition-duration-slow): rail-search focus waits
 * it out; focus() forces a synchronous layout and would jank the slide.
 */
const EXPAND_SLIDE_MS = 300;
/** Pause between the latest keystroke and a server search request. */
const SEARCH_DEBOUNCE_MS = 250;

export function SessionTree({ wide }: { wide: boolean }) {
  const { api, connection, info } = useConnection();
  const runtime = useRuntime();
  const canWrite = useCan('sessions:w');
  const sessions = useSessionStates();
  const location = useLocation();
  const navigation = useSessionNavigation();
  const { collapsed, toggle } = useSidebarLayout();
  const sessionItems = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchRoot = useRef<HTMLDivElement>(null);
  const [children, setChildren] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchOnExpand, setSearchOnExpand] = useState(false);
  const [search, setSearch] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const query = search.trim();
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const searchable =
    supportsSessionOrganization(info?.version) && (info?.scopes.includes('sessions:r') ?? false);
  const searching = searchable && Boolean(query);
  const waiting = searching && query !== debounced;
  const list = useInfiniteQuery({
    queryKey: [connection?.id, connection?.authority, 'session-list', children],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      if (!api) throw new Error('Connect first.');
      return api.get<Schema['ListSessionsResponse']>(
        '/v1/sessions',
        { limit: 40, include_children: children, cursor: pageParam },
        signal,
      );
    },
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: Boolean(api) && !searching,
    refetchInterval: 15000,
    retry: false,
  });
  const matches = useResource<Schema['SearchSessionsResponse']>(
    '/v1/sessions/search',
    { q: debounced, limit: 100, include_children: children },
    searching && !waiting,
    15000,
  );
  const rows = searching
    ? (matches.data?.sessions ?? [])
    : (list.data?.pages.flatMap((page) => page.sessions) ?? []);
  // A session can move across page boundaries while the server is being updated.
  // Keep the server's order before grouping descendants (pin order or search relevance).
  const items = [...new Map(rows.map((item) => [item.id, item])).values()];
  const entries = searching
    ? items.map((session) => ({ session, depth: 0, branches: [] as boolean[] }))
    : sessionTree(items);
  const seen = useSeenSessions();
  const firstPage = list.data?.pages[0]?.sessions;
  useEffect(() => {
    if (!connection || !firstPage) return;
    // Everything listed when tracking starts counts as read; only later activity is unread.
    const newest = firstPage.reduce<string | undefined>(
      (latest, session) =>
        latest === undefined || Date.parse(session.updated_at) > Date.parse(latest)
          ? session.updated_at
          : latest,
      undefined,
    );
    runtime.storage.seenBaseline(connection.id, newest ?? new Date(0).toISOString());
  }, [runtime.storage, connection, firstPage]);
  // Attended sessions report activity before the next list poll does.
  const state = (id: string) => sessions.find((s) => s.id === id);
  const updatedAt = (item: Schema['SessionResponse'], live: SessionState | undefined) =>
    live?.session && Date.parse(live.session.updated_at) > Date.parse(item.updated_at)
      ? live.session.updated_at
      : item.updated_at;
  const selectedId = location.pathname.startsWith('/sessions/')
    ? location.pathname.slice('/sessions/'.length)
    : undefined;
  const selected = items.find((item) => item.id === selectedId);
  useMarkSeen(selected?.id, selected && updatedAt(selected, state(selected.id)));
  const pending = waiting || (searching ? matches.isPending : list.isPending);
  const error = waiting ? undefined : searching ? matches.error : list.error;

  // Rail search and the search shortcut both land here: expand the sidebar if
  // needed, open the box, and focus it once the slide ends.
  useEffect(() => {
    if (!navigation.searchRequested) return;
    navigation.finishSearch();
    setSearchExpanded(true);
    if (collapsed) {
      setSearchOnExpand(true);
      toggle();
    }
  }, [navigation, collapsed, toggle]);
  useEffect(() => {
    if (!wide || !searchOnExpand) return;
    const timer = window.setTimeout(() => {
      searchInput.current?.focus({ preventScroll: true });
      setSearchOnExpand(false);
    }, EXPAND_SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [wide, searchOnExpand]);
  useEffect(() => {
    if (!wide || !searchExpanded || searchOnExpand) return;
    searchInput.current?.focus({ preventScroll: true });
  }, [wide, searchExpanded, searchOnExpand]);

  // Outside-click dismissal stays off while the rail gesture is in flight:
  // the rail click flips the shell wide and mounts this listener during its
  // own dispatch, then keeps bubbling with the now-unmounted rail button as
  // its target, outside searchRoot, which would dismiss the search it opened.
  useEffect(() => {
    if (!wide || !searchExpanded || searchOnExpand) return;
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || searchRoot.current?.contains(event.target) === true)
        return;
      searchInput.current?.blur();
      if (query !== '') return;
      setSearchExpanded(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [query, wide, searchExpanded, searchOnExpand]);

  function onOpen() {
    navigation.setMobileSessionsOpen(false);
  }
  function moveSession(direction: -1 | 1) {
    const next = adjacentSession(
      entries.map(({ session }) => session.id),
      selectedId,
      direction,
    );
    if (!next) return;
    const link = sessionItems.current?.querySelector<HTMLAnchorElement>(
      `a[href="#/sessions/${encodeURIComponent(next)}"]`,
    );
    if (link?.getClientRects().length) {
      link.focus({ preventScroll: true });
      link.scrollIntoView({ block: 'nearest' });
    } else document.getElementById('main-content')?.focus({ preventScroll: true });
    window.location.hash = '/sessions/' + encodeURIComponent(next);
    onOpen();
  }
  useShortcut('previousSession', () => moveSession(-1), !pending && !error);
  useShortcut('nextSession', () => moveSession(1), !pending && !error);

  async function importArchive(file: File) {
    if (importBusy || !api) return;
    setImportBusy(true);
    try {
      if (file.size > 25 * 1024 * 1024)
        throw new Error('This archive exceeds the browser import limit of 25 MiB.');
      const body: unknown = JSON.parse(await file.text());
      const result = await api.mutate<Schema['ImportResponse']>(
        'POST',
        '/v1/sessions/import',
        body,
      );
      if (runtime.getSnapshot().api !== api) return;
      await runtime.queries.invalidateQueries();
      if (runtime.getSnapshot().api === api)
        window.location.hash = '/sessions/' + encodeURIComponent(result.session_id);
    } catch (cause) {
      toast(errorMessage(cause));
    } finally {
      setImportBusy(false);
    }
  }

  // The collapsed rail keeps search as its own 36px control.
  if (!wide) {
    return (
      <div className={cn(css.root, css.rail)}>
        {searchable && (
          <div className={css.sectionHeader}>
            <div className={css.search}>
              <Tooltip
                label="Search sessions"
                shortcutKeys={shortcutKeys('searchSessions', appleKeyboard())}
                delayMs={500}
              >
                <button
                  type="button"
                  className={css.searchButton}
                  aria-label="Search sessions"
                  aria-keyshortcuts={shortcutAttribute('searchSessions')}
                  onClick={() => {
                    setSearchExpanded(true);
                    setSearchOnExpand(true);
                    if (collapsed) toggle();
                  }}
                >
                  <IconSearchOutlineRegular size={18} />
                </button>
              </Tooltip>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={css.root}>
      <div className={css.sectionHeader}>
        <span
          className={cn(css.sectionLabel, css.wide, searchExpanded && css.sectionLabelHidden)}
        >
          Sessions
        </span>
        {searchable && (
          <div className={cn(css.searchSlot, searchExpanded && css.searchSlotExpanded)}>
            <div
              ref={searchRoot}
              className={cn(css.search, searchExpanded && css.searchExpanded)}
              onClick={() => {
                setSearchExpanded(true);
                searchInput.current?.focus();
              }}
            >
              <Tooltip
                label="Search sessions"
                shortcutKeys={shortcutKeys('searchSessions', appleKeyboard())}
                side="bottom"
                delayMs={500}
                disabled={searchExpanded}
              >
                <button
                  type="button"
                  className={css.searchButton}
                  aria-label="Search sessions"
                  aria-keyshortcuts={shortcutAttribute('searchSessions')}
                  aria-expanded={searchExpanded}
                  onClick={() => setSearchExpanded(true)}
                >
                  <IconSearchOutlineRegular size={searchExpanded ? 11 : 14} />
                </button>
              </Tooltip>
              <input
                ref={searchInput}
                className={css.searchInput}
                type="text"
                aria-label="Search sessions"
                placeholder="Search sessions"
                value={search}
                tabIndex={searchExpanded ? 0 : -1}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return;
                  setSearch('');
                  setSearchExpanded(false);
                }}
              />
              {searchExpanded && (
                <button
                  type="button"
                  className={css.clearButton}
                  aria-label="Clear search"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSearch('');
                    setSearchExpanded(false);
                  }}
                >
                  <IconCloseFillRegular size={12} />
                </button>
              )}
            </div>
          </div>
        )}
        <div className={cn(css.headerActions, searchExpanded && css.headerActionsHidden)}>
          <Tooltip label={children ? 'Hide sub-agents' : 'Show sub-agents'} side="bottom" delayMs={500}>
            <button
              type="button"
              className={cn(css.iconButton, css.wide)}
              aria-label="Show sub-agents"
              aria-pressed={children}
              onClick={() => setChildren(!children)}
            >
              <IconWorkspaceTreeOutlineRegular size={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className={cn(css.treeBody, css.wide)}>
        <div className={css.list} aria-busy={pending} ref={sessionItems}>
          {error != null && (
            <p className={css.errorText} role="alert">
              {errorMessage(error)}
            </p>
          )}
          {pending && (
            /* Two skeleton rows on an empty list, one when rows already show
               and only the next page or refresh is outstanding. */
            <div role="status" aria-label={searching ? 'Searching' : 'Loading'}>
              {(entries.length === 0 ? [0, 1] : [0]).map((i) => (
                <div key={i} className={css.skeletonRow} aria-hidden="true">
                  <span className={css.skeletonDot} />
                  <span className={css.skeletonBars}>
                    <span className={css.skeletonBar} />
                    <span className={cn(css.skeletonBar, css.skeletonBarWide)} />
                  </span>
                </div>
              ))}
            </div>
          )}
          {!waiting &&
            entries.map(({ session: item, depth, branches }) => {
              const live = state(item.id);
              const running = item.turn_in_flight || Boolean(live && isSessionRunning(live));
              return (
                <SessionRow
                  key={item.id}
                  session={item}
                  depth={depth}
                  branches={branches}
                  selected={item.id === selectedId}
                  onOpen={onOpen}
                  excerpt={'excerpt' in item && typeof item.excerpt === 'string' ? item.excerpt : undefined}
                  running={running}
                  status={sessionStatus({
                    session: { ...item, updated_at: updatedAt(item, live) },
                    live,
                    running,
                    seen,
                    selected: item.id === selectedId,
                  })}
                />
              );
            })}
          {!pending && !error && items.length === 0 &&
            (searching ? (
              <p className={css.empty} role="status">
                No matching sessions.
              </p>
            ) : (
              <div className={css.emptyState} role="status">
                <IconQueueOutlineRegular size={24} />
                <div>No sessions yet.</div>
              </div>
            ))}
          {!searching && list.hasNextPage && (
            <button
              type="button"
              className={css.loadMore}
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              Load more sessions
            </button>
          )}
          {searching && !pending && items.length === 100 && (
            <p className={css.searchStatus}>Top 100 matches. Refine your search to find more.</p>
          )}
        </div>
        <span className={css.fade} />
      </div>

      <label
        className={css.importRow}
        data-disabled={!canWrite || importBusy || undefined}
        title={canWrite ? 'Import a session archive (.json, up to 25 MiB)' : 'Requires sessions:w'}
      >
        <IconArchiveOutlineRegular size={16} aria-hidden="true" />
        {importBusy ? 'Importing…' : 'Import archive'}
        <input
          className="sr-only"
          type="file"
          accept="application/json,.json"
          disabled={!canWrite || importBusy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importArchive(file);
            event.target.value = '';
          }}
        />
      </label>
    </div>
  );
}
