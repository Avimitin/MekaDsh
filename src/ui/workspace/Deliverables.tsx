import { useEffect, useMemo, useState } from 'react';
import type { SessionState } from '../../session/controller';
import { useConnection } from '../../connections/context';
import { useFileAccess } from '../../features/files/hooks';
import { cn } from '../../lib/cn';
import { IconDeliverDocRegular } from '../icons';
import { conversationFiles } from './conversation-files';
import { CurrentFile } from './CurrentFile';
import css from './Deliverables.module.css';

export function DeliverablesPanel({ state, selectedPath, onSelectPath }: {
  state: SessionState;
  selectedPath?: string | undefined;
  onSelectPath?: ((path: string) => void) | undefined;
}) {
  const { connection } = useConnection();
  const access = useFileAccess(connection);
  const files = useMemo(() => conversationFiles(state), [state]);
  const [path, setPath] = useState(selectedPath ?? '');
  const [filter, setFilter] = useState('');
  useEffect(() => {
    if (selectedPath) { setPath(selectedPath); setFilter(''); }
  }, [selectedPath]);
  const selected = path || files[0] || '';
  const visible = files.filter(file => file.toLowerCase().includes(filter.toLowerCase()));

  if (access.loading && !access.overridden)
    return <p className={css.note} role="status">Loading file server settings…</p>;
  if (access.error || !access.access?.mounts.length) return <div className={css.empty}>
    <div role="alert">
      <h3>File server required</h3>
      <p>{access.error ?? 'Configure a file server to preview and download files.'}</p>
    </div>
    <a className={css.configureLink} href="#/settings">Configure file server</a>
  </div>;

  return <div className={css.panel}>
    {!!files.length && <>
      <p className={css.coverage}>File paths from successful tools in this conversation. Previews and downloads read current server contents.</p>
      <div className={css.fileList}>
        <input type="search" className={css.search} value={filter} onChange={event => setFilter(event.target.value)}
          placeholder="Filter files…" aria-label="Filter files" />
        <ul className={css.list} aria-label="Conversation files">
          {visible.map(file => <li key={file}><button type="button" className={cn(css.file, file === selected && css.selected)}
            aria-pressed={file === selected} onClick={() => { setPath(file); onSelectPath?.(file); }} title={file}>
            <IconDeliverDocRegular size={16} /><span className={css.path}>{file}</span>
          </button></li>)}
        </ul>
        {!visible.length && <p className={css.note}>No matching files.</p>}
      </div>
    </>}
    <CurrentFile key={`${state.id}-${selected}`} path={selected} cwd={state.session?.cwd} />
  </div>;
}
