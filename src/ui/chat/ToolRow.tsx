import { memo, useMemo, useState } from 'react';
import { cn } from '../../lib/cn';
import { useWorkspacePanel } from '../../features/workspace-panel';
import { toolSummary } from '../../session/tool-summary';
import { DisclosureRow } from '../primitives/DisclosureRow';
import { TextShimmer } from '../primitives/TextShimmer';
import { CodeBlock } from './markdown/CodeBlock';
import { toolIcon } from './tool-icons';
import { DiffView } from './toolviews/DiffView';
import { diffLines, diffTotals } from './toolviews/diff-lines';
import { GenericCard } from './toolviews/GenericCard';
import { ReadView } from './toolviews/ReadView';
import { SearchView } from './toolviews/SearchView';
import { TerminalView } from './toolviews/TerminalView';
import { TodoView } from './toolviews/TodoView';
import { inputString, resultText, firstLine } from './toolviews/tool-content';
import { WebView } from './toolviews/WebView';
import css from './ToolRow.module.css';

/** The live or settled tool call a row renders (mirrors the session's LiveTool). */
export interface ToolCallView {
  id: string;
  name: string;
  input: unknown;
  displaySummary?: string;
  state: 'composing' | 'executing' | 'completed' | 'error' | 'ended';
  output: string;
  content: unknown;
  activity: string;
  progress: string;
}

const codeLanguages: Readonly<Record<string, string>> = {
  c: 'c',
  css: 'css',
  go: 'go',
  html: 'html',
  js: 'javascript',
  json: 'json',
  jsx: 'jsx',
  md: 'markdown',
  py: 'python',
  rs: 'rust',
  sh: 'shell',
  ts: 'typescript',
  tsx: 'tsx',
  yaml: 'yaml',
  yml: 'yaml',
};

function languageForPath(path: string | undefined): string | undefined {
  const extension = path?.split('.').pop()?.toLowerCase();
  return extension === undefined ? undefined : codeLanguages[extension];
}

/** Visually hidden run-state label for color-only running and settlement cues. */
function stateStatus(state: ToolCallView['state']): string | null {
  switch (state) {
    case 'composing':
      return 'Preparing';
    case 'executing':
      return 'Running';
    case 'error':
      return 'Failed';
    case 'ended':
      return 'Interrupted';
    default:
      return null;
  }
}

function ExpandedBody({ call }: { call: ToolCallView }) {
  const name = call.name;
  if (name === 'shell_execute' || name === 'execute_command') return <TerminalView call={call} />;
  if (name === 'file_read' || name === 'read_file') return <ReadView call={call} />;
  if (name === 'file_edit' || name === 'edit_file') {
    const oldString = inputString(call.input, 'old_string');
    const newString = inputString(call.input, 'new_string');
    if (oldString !== undefined || newString !== undefined) return <DiffView call={call} />;
    return <GenericCard call={call} />;
  }
  if (name === 'file_write' || name === 'write_file') {
    const content = inputString(call.input, 'content');
    if (content !== undefined)
      return (
        <div className={css.bodyScroll}>
          <CodeBlock
            code={content}
            language={languageForPath(inputString(call.input, 'path'))}
            className={css.codeBody}
          />
        </div>
      );
    return <GenericCard call={call} />;
  }
  if (name === 'web_search') return <SearchView call={call} />;
  if (name === 'web_fetch' || name === 'fetch_url') return <WebView call={call} />;
  if (name === 'todo_write' || name === 'todo_edit' || name === 'todo')
    return <TodoView call={call} />;
  return <GenericCard call={call} />;
}

/**
 * One tool call as a collapsed single-line disclosure row: the family's glyph,
 * the wire tool name, and a one-line summary that shimmers while the call is
 * composing or executing. Error rows show the failure's first line in red,
 * interrupted rows turn amber. The expanded body is dispatched per tool
 * family (terminal, read, diff, search, web, todo, or the generic IN/OUT card).
 */
export const ToolRow = memo(function ToolRow({
  call,
  defaultOpen = false,
}: {
  call: ToolCallView;
  defaultOpen?: boolean | undefined;
}) {
  const workspace = useWorkspacePanel();
  const filePath = /^(file_(read|edit|write)|read_file|edit_file|write_file)$/.test(call.name)
    ? inputString(call.input, 'path') ?? inputString(call.input, 'file_path') : undefined;
  const [expanded, setExpanded] = useState(defaultOpen);
  const running = call.state === 'composing' || call.state === 'executing';
  const expandable = call.state !== 'composing';
  const open = expanded && expandable;
  const summary = useMemo(
    () => toolSummary(call.name, call.input, call.displaySummary) ?? '',
    [call.name, call.input, call.displaySummary],
  );
  // A failure keeps its first result line when available and otherwise turns
  // the ordinary summary red. An interruption keeps the summary but turns it amber.
  const summaryText = call.state === 'error' ? firstLine(resultText(call)) || summary : summary;
  // The diff row keeps its +/- totals visible while the body is collapsed.
  const diffStat = useMemo(() => {
    if (call.name !== 'file_edit' && call.name !== 'edit_file') return null;
    const oldString = inputString(call.input, 'old_string');
    const newString = inputString(call.input, 'new_string');
    if (oldString === undefined && newString === undefined) return null;
    return diffTotals(diffLines(oldString ?? '', newString ?? ''));
  }, [call.name, call.input]);
  const status = stateStatus(call.state);
  const settledWithCue = call.state === 'error' || call.state === 'ended';
  const Icon = toolIcon(call.name);
  const collapsedContent = useMemo(
    () =>
      (summaryText !== '' || diffStat !== null) && (
        <>
          {summaryText !== '' && (
            <>
              <span className={css.sep} data-shimmer-decoration aria-hidden />
              <span
                className={cn(
                  css.summary,
                  call.state === 'error' && css.errorSummary,
                  call.state === 'ended' && css.stoppedSummary,
                )}
              >
                <TextShimmer>{summaryText}</TextShimmer>
              </span>
            </>
          )}
          {diffStat !== null && !settledWithCue && (
            <TextShimmer className={cn(css.summarySuffix, css.diffStat)}>
              <span className={css.diffAdded}>{`+${diffStat.added}`}</span>{' '}
              <span className={css.diffRemoved}>{`−${diffStat.removed}`}</span>
            </TextShimmer>
          )}
        </>
      ),
    [summaryText, diffStat, call.state, settledWithCue],
  );
  return (
    <div
      className={css.root}
      data-tool={call.name}
      data-state={call.state}
      data-expanded={open || undefined}
    >
      {status !== null && <span className="sr-only">{status}</span>}
      <DisclosureRow
        rowClassName={css.row}
        leadingClassName={css.leading}
        titleClassName={css.title}
        icon={<Icon size={14} />}
        title={call.name}
        running={running}
        open={open}
        expandable={expandable}
        expandOnRowClick
        keepContentWhenOpen
        onToggle={() => setExpanded((value) => !value)}
        collapsedContent={collapsedContent}
      >
        {open ? (
          <div className={css.bodyWrap}>
            {workspace && filePath && call.state === 'completed' && (
              <button type="button" className={css.openFile} onClick={() => workspace.openPanel('files', filePath)}>
                Open in files
              </button>
            )}
            <ExpandedBody call={call} />
          </div>
        ) : undefined}
      </DisclosureRow>
      {call.state === 'executing' && call.activity !== '' && (
        <div className={css.activity}>
          <TextShimmer active>{call.activity}</TextShimmer>
        </div>
      )}
      {call.state === 'executing' && call.progress !== '' && (
        <div className={css.progress}>
          <TextShimmer active>{call.progress}</TextShimmer>
        </div>
      )}
    </div>
  );
});
