import { useInfiniteQuery } from '@tanstack/react-query';
import { errorMessage, sessionPath, type Schema } from '../../api/client';
import { useCan, useConnection, useResource } from '../../connections/context';
import { useSessionStates } from '../../session/hooks';
import { isSessionRunning } from '../../session/controller';
import { IconBranchOutlineRegular, IconChevronRightOutlineRegular, IconRefreshOutlineRegular } from '../icons';
import { RelativeDateTime } from '../pages/shared/page';
import css from './SubagentsPanel.module.css';

/** Harness lineage rows, using only the child relationships published by meka. */
export function SubagentsPanel({ sessionId }: { sessionId: string }) {
  const { api, connection } = useConnection();
  const canRead = useCan('sessions:r');
  const states = useSessionStates();
  const current = useResource<Schema['SessionResponse']>(sessionPath(sessionId), undefined, canRead);
  const list = useInfiniteQuery({
    queryKey: [connection?.id, connection?.authority, 'subagent-list'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      if (!api) throw new Error('Connect first.');
      return api.get<Schema['ListSessionsResponse']>('/v1/sessions', { limit: 100, include_children: true, cursor: pageParam }, signal);
    },
    getNextPageParam: (page, _pages, cursor) => page.next_cursor && page.next_cursor !== cursor ? page.next_cursor : undefined,
    enabled: Boolean(api) && canRead,
    refetchInterval: 15000,
    retry: false,
  });
  if (!canRead) return <p className={css.notice}>Session read access is required to view agents.</p>;
  const all = [...new Map((list.data?.pages.flatMap((page) => page.sessions) ?? []).map((session) => [session.id, session])).values()];
  const children = all.filter((session) => session.parent_id === sessionId);
  const parentId = current.data?.parent_id;
  const parent = all.find((session) => session.id === parentId);
  return (
    <section className={css.root} aria-label="Session agents">
      <header className={css.header}>
        <div><h3 className={css.title}>Agents</h3><p className={css.caption}>Conversations spawned by this session</p></div>
        <button type="button" className={css.refresh} aria-label="Refresh agents" title="Refresh agents" disabled={list.isFetching}
          onClick={() => { void list.refetch(); void current.refetch(); }}><IconRefreshOutlineRegular size={15} /></button>
      </header>
      {parentId && <a className={css.parent} href={`#/sessions/${encodeURIComponent(parentId)}`}>
        <IconBranchOutlineRegular size={14} /><span>Parent: {parent?.title || parentId}</span><IconChevronRightOutlineRegular size={14} />
      </a>}
      {current.isError && <p role="alert" className={css.notice}>Could not load parent information: {errorMessage(current.error)}</p>}
      {list.isPending && <p role="status" className={css.notice}>Loading agents…</p>}
      {list.isError && <p role="alert" className={css.notice}>Could not load agents: {errorMessage(list.error)}</p>}
      <ul className={css.list}>
        {children.map((session) => {
          const live = states.find((state) => state.id === session.id);
          // A disconnected feed is stale; the refreshed server listing is authoritative then.
          const connected = live?.feed === 'connected';
          const running = connected ? isSessionRunning(live) : session.turn_in_flight;
          const status = connected && live.approvals.length ? 'Needs approval' : running ? 'Running' : 'Idle';
          return <li key={session.id} className={css.item}>
            <a className={css.row} href={`#/sessions/${encodeURIComponent(session.id)}`}>
              <IconBranchOutlineRegular size={16} />
              <span className={css.copy}><span className={css.name}>{session.title || 'Untitled agent'}</span>
                <span className={css.caption}>{session.profile} · <RelativeDateTime value={session.updated_at} /></span>
                {session.cwd && <span className={css.directory} title={session.cwd}>{session.cwd}</span>}
              </span>
              <span className={css.status} data-running={running || undefined}>{status}</span>
              <IconChevronRightOutlineRegular size={14} />
            </a>
          </li>;
        })}
      </ul>
      {!list.isPending && !list.isError && !children.length && <p className={css.notice}>
        {list.hasNextPage ? 'No child agents in the loaded sessions. Load more to check older sessions.' : 'This session has no child agents.'}
      </p>}
      {list.hasNextPage && <button type="button" className={css.load} disabled={list.isFetching}
        onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? 'Loading more sessions…' : 'Load more sessions'}</button>}
      <p className={css.caption}>Open an agent to inspect its conversation. Agent sessions are controlled by their parent.</p>
    </section>
  );
}
