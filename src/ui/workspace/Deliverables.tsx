import { useEffect, useMemo, useState } from 'react';
import type { SessionState } from '../../session/controller';
import { cn } from '../../lib/cn';
import { AssistantMarkdown } from '../chat/AssistantMarkdown';
import { CodeBlock } from '../chat/markdown/CodeBlock';
import { diffLines, diffTotals } from '../chat/toolviews/diff-lines';
import { IconDeliverDocRegular, IconDownloadOutlineRegular } from '../icons';
import { Button } from '../primitives/Button';
import { useCopyFeedback } from '../primitives/use-copy-feedback';
import { extractRecordedFiles, fileLanguage, recordedDownloadName, type RecordedOperation } from './recorded-files';
import { staticHtmlPreview } from './static-preview';
import css from './Deliverables.module.css';
import { useConnection } from '../../connections/context';
import { useFileAccess } from '../../features/files/hooks';
import { CurrentFile } from './CurrentFile';

const MAX_PREVIEW_CHARS = 200_000;
const labels = { write: 'Write', edit: 'Edit', read: 'Read' };

function RecordedDiff({ operation }: { operation: RecordedOperation }) {
  const before = operation.before!;
  const after = operation.text!;
  const beforePreview = before.slice(0, MAX_PREVIEW_CHARS).split('\n').slice(0, 1500).join('\n');
  const afterPreview = after.slice(0, MAX_PREVIEW_CHARS).split('\n').slice(0, 1500).join('\n');
  const clipped = beforePreview !== before || afterPreview !== after;
  const lines = useMemo(() => diffLines(beforePreview, afterPreview), [beforePreview, afterPreview]);
  const totals = diffTotals(lines);
  return <>
    <p className={css.note}>Recorded replacement snippet. Line numbers refer to this snippet.
      {clipped && ' Large snippets are shortened in this view; copy or download retains the recorded replacement.'}
    </p>
    <div className={css.diffStats}><span className={css.added}>+{totals.added}</span><span className={css.removed}>−{totals.removed}</span></div>
    <div className={css.diff} role="region" aria-label="Recorded edit comparison" tabIndex={0}>
      {lines.map((line, index) => <div key={index} className={css.diffLine} data-kind={line.kind}>
        <span className={css.lineNumber} aria-hidden="true">{index + 1}</span>
        <span className={css.sign}>{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}</span>
        <code>{line.text || ' '}</code>
      </div>)}
    </div>
  </>;
}

function OperationPreview({ operation }: { operation: RecordedOperation }) {
  const language = fileLanguage(operation.path);
  const canPreview = operation.kind === 'write' && ['markdown', 'html'].includes(language ?? '')
    && operation.text !== undefined && operation.text.length <= MAX_PREVIEW_CHARS;
  const canDiff = operation.kind === 'edit' && operation.text !== undefined && operation.before !== undefined;
  const [mode, setMode] = useState<'source' | 'preview' | 'changes'>(canDiff ? 'changes' : canPreview ? 'preview' : 'source');
  const { copied, onCopy } = useCopyFeedback(operation.text ?? '');
  const [downloadError, setDownloadError] = useState('');
  const html = useMemo(() => canPreview && language === 'html' && mode === 'preview' ? staticHtmlPreview(operation.text!) : '',
    [canPreview, language, mode, operation.text]);
  function download() {
    if (operation.text === undefined) return;
    try {
      const url = URL.createObjectURL(new Blob([operation.text], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = recordedDownloadName(operation);
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadError('');
    } catch {
      setDownloadError('Download is unavailable in this browser. Use Copy to save the recorded content.');
    }
  }
  return <section className={css.preview} aria-label="Recorded file preview">
    <div className={css.toolbar}>
      <div className={css.modes} role="group" aria-label="Preview view">
        {canDiff && <button type="button" aria-pressed={mode === 'changes'} onClick={() => setMode('changes')}>Changes</button>}
        <button type="button" aria-pressed={mode === 'source'} onClick={() => setMode('source')}>Source</button>
        {canPreview && <button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>Preview</button>}
      </div>
      <div className={css.actions}>
        <Button size="sm" disabled={operation.text === undefined} onClick={onCopy}>{copied ? 'Copied' : 'Copy'}</Button>
        <Button size="sm" disabled={operation.text === undefined} onClick={download} icon={<IconDownloadOutlineRegular size={14} />}>Download</Button>
      </div>
    </div>
    <p className={css.note}>
      {operation.kind === 'write' ? 'Content sent by this successful write. Later changes may differ.'
        : operation.kind === 'read' ? 'Recorded read result. It may include line numbers, truncation notices, or a partial file.'
        : 'Content from this successful edit. Copy and download contain the replacement snippet.'}
      {mode === 'preview' && language === 'html' && ' Static HTML preview. Scripts, navigation, and external resources are disabled.'}
    </p>
    {downloadError && <p className={css.note} role="alert">{downloadError}</p>}
    <div className={css.previewBody}>
      {mode === 'changes' && canDiff ? <RecordedDiff operation={operation} />
        : operation.text === undefined ? <p className={css.empty}>The successful result was recorded, but its text is unavailable.</p>
          : mode === 'preview' && canPreview ? language === 'html'
            ? <iframe className={css.htmlPreview} title={`Static preview of ${operation.path}`} sandbox="" referrerPolicy="no-referrer" srcDoc={html} />
            : <AssistantMarkdown className={css.markdown} text={operation.text} variant="compact" />
            : <>
              {operation.text.length > MAX_PREVIEW_CHARS && <p className={css.note}>Showing the first {MAX_PREVIEW_CHARS.toLocaleString()} characters. Copy or download includes all recorded text.</p>}
              <CodeBlock code={operation.text.slice(0, MAX_PREVIEW_CHARS)} language={operation.kind === 'read' ? undefined : language} />
            </>}
    </div>
  </section>;
}

export function DeliverablesPanel({ state, selectedPath, onSelectPath }: { state: SessionState; selectedPath?: string | undefined; onSelectPath?: ((path: string) => void) | undefined }) {
  const { connection } = useConnection();
  const access = useFileAccess(connection);
  const [view, setView] = useState<'recorded' | 'current'>('recorded');
  const currentAvailable = Boolean(access.access?.mounts.length);
  const files = useMemo(() => extractRecordedFiles(state), [state]);
  const [path, setPath] = useState(selectedPath ?? '');
  const [operationKey, setOperationKey] = useState('');
  const [filter, setFilter] = useState('');
  useEffect(() => { if (selectedPath) { setPath(selectedPath); setOperationKey(''); setFilter(''); } }, [selectedPath]);
  const visible = files.filter((file) => file.path.toLowerCase().includes(filter.toLowerCase()));
  const file = files.find((item) => item.path === path) ?? files[0];
  const operation = file?.operations.find((item) => item.key === operationKey) ?? file?.operations.at(-1);
  return <div className={css.panel}>
    {currentAvailable && <div className={css.toolbar}><div className={css.modes} role="group" aria-label="File source">
      <button type="button" aria-pressed={view === 'recorded'} onClick={() => setView('recorded')}>Recorded operations</button>
      <button type="button" aria-pressed={view === 'current'} onClick={() => setView('current')}>Current file</button>
    </div></div>}
    {currentAvailable && view === 'current' ? <CurrentFile key={`${state.id}-${selectedPath ?? file?.path ?? ''}`}
      path={selectedPath ?? file?.path ?? ''} cwd={state.session?.cwd} /> : <>
    <p className={css.coverage}>Successful file operations in the loaded conversation. Shell changes and files outside these records are not included.{state.offset > 0 && ' Load earlier messages to include older records.'}</p>
    {!files.length ? <div className={css.empty}><IconDeliverDocRegular size={36} /><h3>No recorded files yet</h3><p>Successful file reads, writes, and edits will appear here with their available content.</p></div> : <>
      <div className={css.fileList}>
        <input type="search" className={css.search} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter recorded files…" aria-label="Filter recorded files" />
        <ul className={css.list} aria-label="Recorded files">
          {visible.map((item) => <li key={item.path}><button type="button" className={cn(css.file, item.path === file?.path && css.selected)}
            aria-pressed={item.path === file?.path} onClick={() => { setPath(item.path); setOperationKey(''); onSelectPath?.(item.path); }} title={item.path}>
            <IconDeliverDocRegular size={16} /><span className={css.path}>{item.path}</span><span className={css.count}>{item.operations.length}</span>
          </button></li>)}
        </ul>
        {!visible.length && <p className={css.note}>No matching files.</p>}
      </div>
      {file && operation && <>
        <div className={css.operationHeader}>
          <h3 className={css.selectedPath}>{file.path}</h3>
          <label className={css.operationPicker}>Operation
            <select aria-label="Recorded file operation" value={operation.key} onChange={(event) => setOperationKey(event.target.value)}>
              {file.operations.map((item, index) => <option key={item.key} value={item.key}>{index + 1}. {labels[item.kind]}{item.source === 'live' ? ' (live)' : ''}</option>)}
            </select>
          </label>
        </div>
        <OperationPreview key={`${state.id}-${operation.key}`} operation={operation} />
      </>}
    </>}
    </>}
  </div>;
}
