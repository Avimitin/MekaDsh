import { useState } from 'react';
import { useCan, useResource } from '../../connections/context';
import type { Schema } from '../../api/client';
import { useSessionNavigation } from '../../features/session-navigation';
import { directoryLabel, recentDirectories } from '../../features/working-directory';
import { Menu, type MenuEntry } from '../primitives/Menu';
import { Modal } from '../primitives/Modal';
import { Button } from '../primitives/Button';
import { IconFolderOpenRegular, IconChevronDownOutlineRegular, IconNewChatOutlineRegular } from '../icons';
import css from './WorkspaceSwitcher.module.css';

/** Directory navigation uses the existing cwd filter; it creates no server-side workspace. */
export function WorkspaceSwitcher({ value, onChange, searching }: {
  value: string; onChange: (path: string) => void; searching: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [path, setPath] = useState('');
  const canWrite = useCan('sessions:w');
  const navigation = useSessionNavigation();
  const recent = useResource<Schema['ListSessionsResponse']>('/v1/sessions', { limit: 100 }, open);
  const paths = [...new Set([...(value ? [value] : []), ...recentDirectories(recent.data?.sessions ?? [], 20)])];
  const items: MenuEntry[] = [
    { id: '', label: 'All workspaces' },
    ...paths.map((cwd) => ({ id: cwd, label: <span className={css.path} title={cwd}>
      <span>{directoryLabel(cwd).name}</span><small>{cwd}</small>
    </span>, icon: <IconFolderOpenRegular size={14} /> })),
    { type: 'separator', id: 'separator' },
    { id: '\0path', label: 'Choose directory…' },
  ];
  return <div className={css.root}>
    <div className={css.label}>Workspace</div>
    <div className={css.row}>
      <Menu open={open} portal items={items} selectedId={value} onClose={() => setOpen(false)}
        onSelect={(id) => { setOpen(false); if (id === '\0path') { setPath(value); setEditing(true); } else onChange(id); }}
        anchor={<button type="button" className={css.trigger} aria-haspopup="menu" aria-expanded={open}
          aria-label="Choose workspace" title={value || 'All workspaces'} onClick={() => setOpen(!open)}>
          <IconFolderOpenRegular size={16} /><span>{value ? directoryLabel(value).name : 'All workspaces'}</span>
          <IconChevronDownOutlineRegular size={12} />
        </button>} />
      {value && canWrite && <button type="button" className={css.newChat} aria-label="New chat in this workspace"
        title="New chat in this workspace" disabled={navigation.newConversation.busy || navigation.newConversation.uncertain}
        onClick={() => {
          navigation.newConversation.setSettings((settings) => ({ ...settings, cwd: value }));
          navigation.newSession();
        }}><IconNewChatOutlineRegular size={16} /></button>}
    </div>
    {searching && value && <p className={css.hint}>Search covers all workspaces.</p>}
    {open && recent.isError && <p className={css.hint} role="status">Recent directories unavailable. Enter a path to choose one.</p>}
    <Modal open={editing} onClose={() => setEditing(false)} title="Choose workspace directory"
      description="Enter a directory on the meka server to filter its sessions." closeLabel="Close directory picker">
      <form className={css.form} onSubmit={(event) => { event.preventDefault(); onChange(path.trim()); setEditing(false); }}>
        <label htmlFor="workspace-directory">Directory</label>
        <input id="workspace-directory" data-modal-autofocus value={path} onChange={(event) => setPath(event.target.value)}
          placeholder="/home/me/project" autoComplete="off" spellCheck={false} />
        <div className={css.actions}><Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          <Button type="submit" disabled={!path.trim()}>Choose directory</Button></div>
      </form>
    </Modal>
  </div>;
}
