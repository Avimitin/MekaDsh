import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { errorMessage, sessionPath, type Schema } from '../../api/client';
import {
  useCan,
  useConnection,
  useResource,
  useRuntime,
  useSettings,
} from '../../connections/context';
import {
  isSessionRunning,
  type LiveTool,
  type SessionState,
  type Submission,
} from '../../session/controller';
import { useSessionMetadata, useSessionStates } from '../../session/hooks';
import { useMarkSeen } from '../../session/unread';
import { useSessionNavigation } from '../../features/session-navigation';
import { useWorkspacePanel } from '../../features/workspace-panel';
import { DeliverablesSummary } from '../workspace/DeliverablesSummary';
import { useAction } from '../../lib/actions';
import {
  groupAgentMessages,
  groupLiveMessages,
  groupToolResults,
  pendingInboxMessages,
  responseActivityIndicator,
  type HistoryMessage,
  type ToolResultBlock,
  type ToolUseBlock,
} from './conversation-history';
import { useChatScroll } from './use-chat-scroll';
import { AssistantMarkdown } from './AssistantMarkdown';
import { ReasoningRow } from './ReasoningRow';
import { ToolRow, type ToolCallView } from './ToolRow';
import { RunningStatus } from './RunningStatus';
import { TurnProcess } from './TurnProcess';
import { TurnNavigator } from './TurnNavigator';
import { CompactionCard } from './CompactionCard';
import { NoticeRow } from './NoticeRow';
import { ImageAttachment } from './ImageAttachment';
import { InboxMessage, SavedUserMessage, SubmissionMessage } from './MessageList';
import { ApprovalPanel } from './ApprovalPanel';
import { Composer } from '../composer/Composer';
import { Button } from '../primitives/Button';
import { IconChevronDownOutlineRegular, IconTreeCornerRegular } from '../icons';
import { cn } from '../../lib/cn';
import css from './Conversation.module.css';

type Activity = NonNullable<ReturnType<typeof responseActivityIndicator>>;

/** Whole seconds between two RFC 3339 timestamps, when both parse and order sensibly. */
function turnSeconds(start: string | null | undefined, finish: string | null | undefined) {
  if (!start || !finish) return undefined;
  const ms = Date.parse(finish) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 1000) return undefined;
  return Math.round(ms / 1000);
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

/** A finished turn's fold label, from its timestamps where the snapshot carries them. */
function workedLabel(seconds: number | undefined) {
  return seconds === undefined ? 'Worked' : `Worked for ${formatDuration(seconds)}`;
}

/** LiveTool is the ToolRow view model already; saved pairs map onto the same shape. */
function liveCallView(tool: LiveTool): ToolCallView {
  return tool;
}

function savedCallView(block: ToolUseBlock, result: ToolResultBlock | undefined): ToolCallView {
  return {
    id: block.id,
    name: block.name,
    input: block.input,
    state: result ? (result.is_error ? 'error' : 'completed') : 'ended',
    output: result
      ? result.content.flatMap((content) => (content.type === 'text' ? [content.text] : [])).join('')
      : '',
    content: result ? result.content : [],
    activity: '',
    progress: '',
  };
}

function noticeLevel(level: 'info' | 'warning' | 'error') {
  return level === 'warning' ? 'warn' : level;
}

export function Conversation({ sessionId }: { sessionId: string }) {
  const { controller, connection, connectionIssue } = useConnection();
  const canRead = useCan('sessions:r');
  const states = useSessionStates();
  const state = states.find((candidate) => candidate.id === sessionId);
  // The route owns selection: attending feeds and previews follow the visible session.
  useEffect(() => {
    if (canRead) controller?.select(sessionId);
    return () => controller?.select(undefined);
  }, [controller, sessionId, canRead]);
  useSessionMetadata(sessionId, canRead && Boolean(state?.session));
  // Also marked from the session list, which can be collapsed or hidden.
  useMarkSeen(sessionId, state?.session?.updated_at);
  if (!state || !state.session) return <Opening state={state} connectionIssue={connectionIssue} />;
  return <ConversationView key={connection?.id + ':' + state.id} state={state} />;
}

function Opening({
  state,
  connectionIssue,
}: {
  state: SessionState | undefined;
  connectionIssue: 'offline' | 'checking' | undefined;
}) {
  const { controller } = useConnection();
  const action = useAction();
  return (
    <div className={css.opening}>
      {connectionIssue ? null : state?.error ? (
        <Button
          variant="outline"
          disabled={action.busy}
          onClick={() => void action.run(async () => controller?.reconnect(state.id))}
        >
          Retry opening session
        </Button>
      ) : (
        <p className={css.hint}>Opening session…</p>
      )}
      {state?.error && <NoticeRow level="error" text={errorMessage(state.error)} />}
      {action.error !== undefined && action.error !== null && (
        <NoticeRow level="error" text={errorMessage(action.error)} />
      )}
    </div>
  );
}

function ConversationView({ state }: { state: SessionState }) {
  const workspace = useWorkspacePanel();
  const { controller, connection, connectionIssue } = useConnection();
  const runtime = useRuntime();
  const { composerFocusRef } = useSessionNavigation();
  const canWithdraw = useCan('sessions:w') && !state.session?.parent_id && !state.deleting;
  const [feedbackError, setFeedbackError] = useState<unknown>();
  const { showTurnContext } = useSettings();
  const inbox = useResource<Schema['InboxListResponse']>(sessionPath(state.id) + '/inbox');

  const history = useMemo(() => groupToolResults(state.saved?.messages ?? []), [state.saved]);
  const messages = useMemo(() => groupAgentMessages(history.messages), [history.messages]);
  const live = useMemo(
    () => groupLiveMessages(state.blocks, state.submissions),
    [state.blocks, state.submissions],
  );
  const activity = responseActivityIndicator(state, live);
  const waiting =
    connectionIssue &&
    activity &&
    ['connecting', 'reconnecting', 'disconnected'].includes(activity.status)
      ? undefined
      : activity;
  const problems = state.submissions.filter(
    (submission) =>
      submission.state === 'uncertain' ||
      (submission === state.submissions.at(-1) &&
        submission.state === 'failed' &&
        !state.notices.some(
          (notice) =>
            notice.event === 'turn.failed' && notice.turnId && notice.turnId === submission.turnId,
        )),
  );
  const problemKeys = new Set(problems.map((submission) => submission.key));
  const liveKeys = new Set(live.flatMap((group) => (group.kind === 'user' ? [group.key] : [])));
  const recovered = problems.filter((submission) => !liveKeys.has(submission.key));
  const queued = pendingInboxMessages(
    inbox.data?.items ?? [],
    state.submissions,
    new Set([...liveKeys, ...problemKeys]),
  );

  const running = isSessionRunning(state);
  const readOnly = Boolean(state.session?.parent_id);
  const scrollKey = connection?.id + ':' + state.id;
  const snapKey = state.submissions.at(-1)?.preview
    ? state.submissions.at(-1)?.key
    : undefined;
  const scroll = useChatScroll({ scrollKey, revision: state.revision, snapKey });

  // A route-requested composer focus lands once the docked composer is on screen.
  useEffect(() => {
    if (composerFocusRef.current !== state.id) return;
    const input = document.querySelector<HTMLTextAreaElement>(
      `[data-composer="${CSS.escape(state.id)}"] textarea`,
    );
    if (!input || input.disabled) return;
    composerFocusRef.current = null;
    input.focus();
  }, [composerFocusRef, state.id, state.session, state.feed]);

  const runningStartedAt = useMemo(() => {
    const created = state.submissions.filter((s) => s.state === 'running').at(-1)?.createdAt;
    const ms = created ? Date.parse(created) : NaN;
    return Number.isFinite(ms) ? ms : undefined;
  }, [state.submissions]);

  const empty =
    state.saved?.messages.length === 0 &&
    !live.length &&
    !waiting &&
    !state.notices.length &&
    !recovered.length &&
    !queued.length;

  function loadEarlier() {
    const node = scroll.scrollerRef.current;
    const height = node?.scrollHeight ?? 0;
    void controller?.earlier(state.id).then(() =>
      requestAnimationFrame(() => {
        if (node) node.scrollTop += node.scrollHeight - height;
      }),
    );
  }

  // Turn anchors: user messages in render order. The saved groups' anchors and each assistant
  // turn's start time come from one pre-pass; live, recovered, and queued inputs follow.
  const revision = state.saved?.revision ?? 0;
  const savedMeta = new Map<string, { anchor: number; turnStartedAt: string | null | undefined }>();
  {
    let cursor = 0;
    let lastUserTime: string | null | undefined;
    for (const group of messages) {
      const message = group[0]?.message;
      if (!message) continue;
      const key = `${revision}:${state.offset + group[0]!.index}`;
      savedMeta.set(key, { anchor: cursor, turnStartedAt: lastUserTime });
      const isUserInput =
        !message.compaction &&
        message.role === 'user' &&
        message.content.some((block) => block.type === 'text' || block.type === 'image');
      if (isUserInput) {
        cursor += 1;
        lastUserTime = message.created_at;
      }
    }
  }
  let anchor = savedMeta.size;
  const acceptDraft = (submitted: string) => {
    // The composer owns the live draft text; clearing here lets its storage sync settle it.
    if (connection) runtime.storage.clearSubmittedDraft(connection.id, state.id, submitted);
  };
  const sentMessage = (submission: Submission, pending?: Schema['InboxItemView']) => (
    <SubmissionMessage
      key={submission.key}
      submission={submission}
      sessionId={state.id}
      pending={pending ?? inbox.data?.items.find((item) => item.id === submission.itemId)}
      canWithdraw={canWithdraw}
      recoverable={problemKeys.has(submission.key)}
      anchor={anchor++}
      onAccepted={() => acceptDraft(submission.body.message)}
      onError={setFeedbackError}
    />
  );
  const appendActivity = waiting !== undefined && live[waiting.index - 1]?.kind === 'agent';

  return (
    <div className={css.frame} data-conversation-content>
      <div
        ref={scroll.scrollerRef}
        className={css.scroller}
        data-conversation-scroll
        {...(!scroll.showLatest ? { 'data-chat-following-tail': '' } : {})}
        role="region"
        aria-label="Conversation"
        tabIndex={-1}
        onScroll={scroll.onScroll}
      >
        <div ref={scroll.contentRef} className={css.content}>
          <div
            className={css.column}
            data-conversation-column
            onClick={(event) => {
              if (event.target instanceof Element && event.target.closest('summary'))
                scroll.unfollow();
            }}
          >
            {state.offset > 0 && (
              <div className={css.older}>
                <button type="button" onClick={loadEarlier}>
                  Load earlier messages ({state.offset})
                </button>
              </div>
            )}
            {state.loading && !state.saved && (
              <p className={css.hint}>Loading saved conversation…</p>
            )}
            {empty && <p className={css.hint}>Send a message to begin.</p>}
            <SavedMessages
              messages={messages}
              toolResults={history.results}
              sessionId={state.id}
              offset={state.offset}
              showTurnContext={showTurnContext}
              revision={revision}
              savedMeta={savedMeta}
            />
            {state.partial && (
              <NoticeRow
                level="warn"
                text="Live replay may be incomplete. Saved conversation and live preview are shown separately until the turn is reconciled."
              />
            )}
            {(live.length > 0 || waiting) && (
              <section className={css.live}>
                {live.map((group, index) => (
                  <Fragment key={group.key}>
                    {waiting?.index === index && !appendActivity && (
                      <ActivityRow status={waiting.status} startedAt={runningStartedAt} />
                    )}
                    {group.kind === 'user' ? (
                      sentMessage(group.submission)
                    ) : running ? (
                      <LiveAgentGroup
                        group={group}
                        tools={state.tools}
                        streamingIndex={waiting?.status === 'working' ? state.blocks.length - 1 : -1}
                      />
                    ) : (
                      <SettledAgentGroup group={group} tools={state.tools} state={state} />
                    )}
                    {waiting?.index === index + 1 && appendActivity && (
                      <ActivityRow status={waiting.status} startedAt={runningStartedAt} divider />
                    )}
                  </Fragment>
                ))}
                {waiting?.index === live.length && !appendActivity && (
                  <ActivityRow status={waiting.status} startedAt={runningStartedAt} />
                )}
              </section>
            )}
            {workspace && <DeliverablesSummary state={state} onOpen={() => workspace.openPanel('files')} />}
            {recovered.map((submission) => sentMessage(submission))}
            {queued.map(({ item, submission }) =>
              submission ? (
                sentMessage(submission, item)
              ) : (
                <InboxMessage
                  key={item.id}
                  sessionId={state.id}
                  item={item}
                  canWithdraw={canWithdraw}
                  anchor={anchor++}
                  onError={setFeedbackError}
                />
              ),
            )}
            {state.notices.map((notice) => (
              <NoticeRow key={notice.id} level={noticeLevel(notice.level)} text={notice.text} />
            ))}
            {state.feed === 'unloaded' && (
              <NoticeRow
                level="info"
                text="This session isn't loaded on the server, and loading it takes write access. Live updates start once the server loads it."
              />
            )}
            {state.error && <NoticeRow level="error" text={errorMessage(state.error)} />}
            {feedbackError ? <NoticeRow level="error" text={errorMessage(feedbackError)} /> : null}
            {inbox.error && <NoticeRow level="error" text={errorMessage(inbox.error)} />}
          </div>
        </div>
        {scroll.turn.total >= 2 && (
          <div className={css.turnSlot}>
            <div className={css.turnFrame}>
              <TurnNavigator
                current={scroll.turn.current + 1}
                total={scroll.turn.total}
                onJump={(index) => scroll.jumpToTurn(index - 1)}
              />
            </div>
          </div>
        )}
        <div
          ref={scroll.dockRef}
          className={css.composerSeat}
          data-composer-seat
          {...(scroll.contentBelow ? { 'data-content-below': '' } : {})}
        >
          {state.approvals.length > 0 ? (
            <ApprovalPanel approvals={state.approvals} />
          ) : readOnly ? (
            <p className={css.subagentNote}>
              <IconTreeCornerRegular size={14} />
              <span>Sub-agent session · read-only</span>
              {state.session?.parent_id && (
                <a href={`#/sessions/${encodeURIComponent(state.session.parent_id)}`}>
                  Parent session
                </a>
              )}
            </p>
          ) : (
            <Composer sessionId={state.id} variant="docked" />
          )}
        </div>
      </div>
      {scroll.showLatest && (
        <div className={css.latestSlot}>
          <button type="button" className={css.latest} onClick={scroll.jumpToLatest}>
            <IconChevronDownOutlineRegular size={14} />
            <span>Latest</span>
          </button>
        </div>
      )}
    </div>
  );
}

function ActivityRow({
  status,
  startedAt,
  divider = false,
}: {
  status: Activity['status'];
  startedAt: number | undefined;
  divider?: boolean;
}) {
  if (status === 'working' || status === 'compacting')
    return (
      <div className={css.activity}>
        <RunningStatus compacting={status === 'compacting'} startedAt={startedAt} divider={divider} />
      </div>
    );
  if (status === 'approval')
    return (
      <div className={css.activity} role="status">
        <span className={css.approvalDot} aria-hidden="true" />
        <span className={css.shimmer}>Waiting for approval</span>
      </div>
    );
  const label = {
    connecting: 'Connecting…',
    reconnecting: 'Reconnecting…',
    disconnected: 'Connection interrupted',
  }[status];
  return (
    <div className={cn(css.activity, css.feedCaption)} role="status">
      {label}
    </div>
  );
}

/** Live assistant content while the turn runs: thinking, tools, and text inline in stream order. */
function LiveAgentGroup({
  group,
  tools,
  streamingIndex,
}: {
  group: Extract<ReturnType<typeof groupLiveMessages>[number], { kind: 'agent' }>;
  tools: Record<string, LiveTool>;
  streamingIndex: number;
}) {
  return (
    <div className={css.agentGroup} data-live>
      {group.blocks.map(({ block, index }) => {
        if (block.kind === 'tool') {
          const tool = tools[block.id];
          if (!tool) return null;
          return <ToolRow key={block.id} call={liveCallView(tool)} />;
        }
        if (block.kind === 'thinking')
          return <ReasoningRow key={index} text={block.text} streaming={index === streamingIndex} />;
        return <AssistantMarkdown key={index} text={block.text} streaming={index === streamingIndex} />;
      })}
    </div>
  );
}

/** Streamed content whose turn ended before reconciliation: the process folds like a saved turn. */
function SettledAgentGroup({
  group,
  tools,
  state,
}: {
  group: Extract<ReturnType<typeof groupLiveMessages>[number], { kind: 'agent' }>;
  tools: Record<string, LiveTool>;
  state: SessionState;
}) {
  const outcome = state.lastTurn?.outcome;
  const tone = outcome === 'failed' ? 'error' : outcome === 'canceled' ? 'warn' : 'neutral';
  const summary =
    outcome === 'failed' ? 'Failed' : outcome === 'canceled' ? 'Stopped' : 'Worked';
  const items = group.blocks.flatMap(({ block, index }) => {
    if (block.kind === 'tool') {
      const tool = tools[block.id];
      return tool ? [{ key: block.id, node: <ToolRow call={liveCallView(tool)} /> }] : [];
    }
    if (block.kind === 'thinking')
      return [{ key: `thinking-${index}`, node: <ReasoningRow text={block.text} /> }];
    return [];
  });
  const text = group.blocks.flatMap(({ block }) =>
    block.kind === 'text' ? [block.text] : [],
  );
  return (
    <div className={css.agentGroup} data-live>
      {items.length > 0 && (
        <TurnProcess summary={summary} tone={tone}>
          {items.map((item) => (
            <Fragment key={item.key}>{item.node}</Fragment>
          ))}
        </TurnProcess>
      )}
      {text.map((value, index) => (
        <AssistantMarkdown key={index} text={value} />
      ))}
    </div>
  );
}

function SavedMessages({
  messages,
  toolResults,
  sessionId,
  offset,
  showTurnContext,
  revision,
  savedMeta,
}: {
  messages: HistoryMessage[][];
  toolResults: ReadonlyMap<ToolUseBlock, ToolResultBlock>;
  sessionId: string;
  offset: number;
  showTurnContext: boolean;
  revision: number;
  savedMeta: ReadonlyMap<string, { anchor: number; turnStartedAt: string | null | undefined }>;
}) {
  return (
    <>
      {messages.map((group) => {
        const message = group[0]?.message;
        if (!message) return null;
        const key = `${revision}:${offset + group[0]!.index}`;
        const meta = savedMeta.get(key);
        return (
          <SavedGroup
            key={key}
            group={group}
            sessionId={sessionId}
            offset={offset}
            toolResults={toolResults}
            showTurnContext={showTurnContext}
            turnStartedAt={meta?.turnStartedAt}
            anchor={meta?.anchor ?? 0}
          />
        );
      })}
    </>
  );
}

function SavedGroup({
  group,
  sessionId,
  offset,
  toolResults,
  showTurnContext,
  turnStartedAt,
  anchor,
}: {
  group: HistoryMessage[];
  sessionId: string;
  offset: number;
  toolResults: ReadonlyMap<ToolUseBlock, ToolResultBlock>;
  showTurnContext: boolean;
  turnStartedAt: string | null | undefined;
  anchor: number;
}) {
  const message = group[0]?.message;
  if (!message) return null;
  // Filter only the rendered blocks; preserve message boundaries, indexes, and saved history.
  const content = group.flatMap(({ blocks, index: messageIndex }) =>
    blocks.flatMap(({ block, index }) =>
      showTurnContext || block.type !== 'turn_context' ? [{ block, index, messageIndex }] : [],
    ),
  );
  if (message.compaction) {
    const text = content
      .flatMap(({ block }, position) => {
        if (block.type !== 'text') return [];
        // The API marker identifies summaries; remove only its redundant display label.
        const value =
          position === 0
            ? block.text.replace(
                /^\[Conversation summary from session compaction\]\r?\n(?:\r?\n)?/,
                '',
              )
            : block.text;
        return [value];
      })
      .join('\n\n');
    return (
      <CompactionCard
        replacedCount={message.compaction.replaced_count}
        generation={message.compaction.generation}
        text={text}
      />
    );
  }
  if (!content.length && message.content.length > 0) return null;
  const isUserInput =
    message.role === 'user' &&
    message.content.some((block) => block.type === 'text' || block.type === 'image');
  if (isUserInput)
    return (
      <SavedUserMessage
        sessionId={sessionId}
        messages={content.map(({ block, index }) => ({ block, index }))}
        anchor={anchor}
      />
    );
  if (message.role !== 'assistant') {
    // Only unmatched tool results reach this branch; keep them inspectable.
    return (
      <>
        {content.map(({ block, index, messageIndex }) =>
          block.type === 'tool_result' ? (
            <OrphanToolResult
              key={`${offset + messageIndex}:${index}`}
              block={block}
              sessionId={sessionId}
            />
          ) : null,
        )}
      </>
    );
  }
  const seconds = turnSeconds(
    turnStartedAt ?? message.created_at,
    group.at(-1)?.message.created_at,
  );
  return (
    <AssistantGroup
      content={content}
      sessionId={sessionId}
      toolResults={toolResults}
      summary={workedLabel(seconds)}
    />
  );
}

/** One saved assistant turn: each contiguous thinking/tool run folds; text answers stay in place. */
function AssistantGroup({
  content,
  sessionId,
  toolResults,
  summary,
}: {
  content: { block: Schema['ContentBlockView']; index: number; messageIndex: number }[];
  sessionId: string;
  toolResults: ReadonlyMap<ToolUseBlock, ToolResultBlock>;
  summary: string;
}) {
  const nodes: { key: string; node: ReactNode }[] = [];
  let process: { key: string; node: ReactNode }[] = [];
  const flush = () => {
    if (!process.length) return;
    const items = process;
    process = [];
    nodes.push({
      key: `process-${nodes.length}`,
      node: (
        <TurnProcess summary={summary}>
          {items.map((item) => (
            <Fragment key={item.key}>{item.node}</Fragment>
          ))}
        </TurnProcess>
      ),
    });
  };
  for (const { block, index, messageIndex } of content) {
    const key = `${messageIndex}:${index}`;
    if (block.type === 'thinking') {
      process.push({ key, node: <ReasoningRow text={block.thinking} /> });
    } else if (block.type === 'redacted_thinking') {
      process.push({ key, node: <p className={css.muted}>Thinking unavailable.</p> });
    } else if (block.type === 'tool_use') {
      process.push({
        key,
        node: <ToolRow call={savedCallView(block, toolResults.get(block))} />,
      });
    } else {
      flush();
      if (block.type === 'text')
        nodes.push({ key, node: <AssistantMarkdown text={block.text} /> });
      else if (block.type === 'image' && block.hash)
        nodes.push({
          key,
          node: (
            <ImageAttachment
              sessionId={sessionId}
              hash={block.hash}
              mediaType={block.media_type}
            />
          ),
        });
      else if (block.type === 'turn_context')
        nodes.push({
          key,
          node: (
            <details className={css.injected}>
              <summary>Context added by meka</summary>
              <pre className={css.plainText}>{block.text}</pre>
            </details>
          ),
        });
      else if (block.type === 'tool_result')
        nodes.push({
          key,
          node: <OrphanToolResult block={block} sessionId={sessionId} />,
        });
    }
  }
  flush();
  return (
    <div className={css.agentGroup}>
      {nodes.map((item) => (
        <Fragment key={item.key}>{item.node}</Fragment>
      ))}
    </div>
  );
}

/** A saved tool result that never paired with a visible call; the row itself stays inspectable. */
function OrphanToolResult({
  block,
  sessionId,
}: {
  block: ToolResultBlock;
  sessionId: string;
}) {
  return (
    <details className={cn(css.orphanResult, block.is_error && css.orphanError)}>
      <summary>
        {block.is_error ? 'Tool error' : 'Tool result'}
        <span className={css.toolReference}>{block.tool_use_id}</span>
      </summary>
      <div className={css.toolOutput} tabIndex={0} role="group" aria-label="Tool result">
        {block.content.map((content, index) =>
          content.type === 'text' ? (
            <pre className={css.plainText} key={index}>
              {content.text}
            </pre>
          ) : content.hash ? (
            <ImageAttachment
              key={index}
              sessionId={sessionId}
              hash={content.hash}
              mediaType={content.media_type}
            />
          ) : null,
        )}
      </div>
    </details>
  );
}
