import { useState } from 'react';
import type { Connection } from '../../../connections/storage';
import { useConnection, useSettings } from '../../../connections/context';
import { parseFileAccess, fileUrl, type FileAuth } from '../../../features/files/config';
import { fileRequest, checkFileResponse } from '../../../features/files/client';
import { saveFileAccess, saveFileCredential, useFileAccess } from '../../../features/files/hooks';
import { Button } from '../../primitives/Button';
import { Input } from '../../primitives/Input';
import { ErrorNotice, Field, Section, SectionContent } from '../shared/page';
import css from './FileAccessSettings.module.css';

export function FileAccessSettings() {
  const { connection } = useConnection();
  const { connections } = useSettings();
  const [selected, setSelected] = useState(connection?.id ?? '');
  const target = connections.find(c => c.id === selected) ?? connection;
  return <Section title="File access" description="Read current files through a separate file server. Meka API tokens are never sent to it.">
    <SectionContent>
      <div className={css.form}>
        <Field label="Connection">
          <select value={target?.id ?? ''} onChange={event => setSelected(event.target.value)}>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {target && <FileAccessForm key={target.id + target.authority} connection={target} />}
      </div>
    </SectionContent>
  </Section>;
}

function FileAccessForm({ connection }: { connection: Connection }) {
  const files = useFileAccess(connection);
  const [editing, setEditing] = useState(false);
  const [mounts, setMounts] = useState([{ pathPrefix: '/', urlPrefix: '' }]);
  const [auth, setAuth] = useState<FileAuth>('browser');
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [testPath, setTestPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<unknown>();
  function perform(action: () => void, message: string) {
    setError(undefined); setStatus('');
    try { action(); setStatus(message); } catch (e) { setError(e); }
  }
  async function test() {
    if (!files.access) return;
    setBusy(true); setError(undefined); setStatus('');
    try {
      const response = await fetch(fileUrl(files.access, testPath), {
        ...fileRequest(files.access.auth, files.credential), method: 'HEAD', signal: AbortSignal.timeout(10000),
      });
      checkFileResponse(response);
      setStatus('File server responded successfully to the test path.');
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return <>
    <p className={css.hint}>{files.loading ? 'Loading deployment defaults…' : files.overridden
      ? 'Using settings saved for this connection in this browser.'
      : files.access ? 'Using deployment defaults.' : 'No file server configured. Recorded previews are still available.'}</p>
    {files.access?.mounts.map(m => <p className={css.mapping} key={m.pathPrefix}>{m.pathPrefix} → {m.urlPrefix}</p>)}
    {files.access?.mounts.length === 0 && <p className={css.hint}>Current file access is disabled for this connection.</p>}
    <div className={css.actions}>
      <Button variant="outline" onClick={() => {
        setMounts(files.access?.mounts.length ? files.access.mounts.map(m => ({ ...m })) : [{ pathPrefix: '/', urlPrefix: '/files/' }]);
        setAuth(files.access?.auth ?? 'browser'); setEditing(true);
      }}>Customize</Button>
      {files.overridden && <Button onClick={() => perform(() => { saveFileAccess(connection, null); setEditing(false); }, 'Deployment defaults restored.')}>Use deployment defaults</Button>}
      <Button onClick={() => perform(() => { saveFileAccess(connection, { mounts: [], auth: 'none' }); setEditing(false); }, 'Current file access disabled.')}>Disable</Button>
    </div>
    {editing && <form className={css.form} onSubmit={event => {
      event.preventDefault();
      perform(() => {
        saveFileAccess(connection, parseFileAccess({ mounts, auth }, document.baseURI)); setEditing(false);
      }, 'File access settings saved.');
    }}>
      {mounts.map((mount, index) => <fieldset className={css.mount} key={index}>
        <legend>Mapping {index + 1}</legend>
        <Field label="Filesystem prefix" hint="Absolute directory as seen by meka. Use / for full filesystem access.">
          <Input required value={mount.pathPrefix} onChange={e => setMounts(mounts.map((m, i) => i === index ? { ...m, pathPrefix: e.target.value } : m))} />
        </Field>
        <Field label="File server URL prefix" hint="An absolute HTTP URL or a path such as /files/ on this frontend's origin.">
          <Input required value={mount.urlPrefix} autoComplete="off" onChange={e => setMounts(mounts.map((m, i) => i === index ? { ...m, urlPrefix: e.target.value } : m))} />
        </Field>
        {mounts.length > 1 && <Button onClick={() => setMounts(mounts.filter((_, i) => i !== index))}>Remove mapping {index + 1}</Button>}
      </fieldset>)}
      <Button disabled={mounts.length >= 32} onClick={() => setMounts([...mounts, { pathPrefix: '', urlPrefix: '' }])}>Add mapping</Button>
      <Field label="File authentication">
        <select value={auth} onChange={e => setAuth(e.target.value as FileAuth)}>
          <option value="browser">Browser session (cookies or existing HTTP login)</option>
          <option value="basic">Separate username and password</option>
          <option value="bearer">Separate bearer token</option>
          <option value="none">No credentials</option>
        </select>
      </Field>
      <div className={css.actions}><Button type="submit" variant="primary">Save file settings</Button><Button onClick={() => setEditing(false)}>Cancel</Button></div>
    </form>}
    {files.access && ['basic', 'bearer'].includes(files.access.auth) && <form className={css.form} onSubmit={event => {
      event.preventDefault();
      perform(() => { saveFileCredential(connection, files.access!, { username, secret }); setSecret(''); }, 'File credentials saved for this tab.');
    }}>
      <p className={css.hint}>{files.credential ? 'File credentials are available in this tab.' : 'Enter credentials for the configured file server.'} They are separate from your meka token.</p>
      {files.access.auth === 'basic' && <Field label="File server username"><Input required value={username} autoComplete="username" onChange={e => setUsername(e.target.value)} /></Field>}
      <Field label={files.access.auth === 'basic' ? 'File server password' : 'File server token'}>
        <Input type="password" required value={secret} autoComplete="off" onChange={e => setSecret(e.target.value)} />
      </Field>
      <div className={css.actions}><Button type="submit" variant="outline">Save file credentials</Button>
        {files.credential && <Button onClick={() => perform(() => saveFileCredential(connection, files.access!, { username: '', secret: '' }), 'File credentials forgotten.')}>Forget file credentials</Button>}
      </div>
    </form>}
    {!!files.access?.mounts.length && <form className={css.form} onSubmit={e => { e.preventDefault(); void test(); }}>
      <Field label="Test file path" hint="Use an existing absolute file path. The test requests metadata only.">
        <Input required value={testPath} placeholder="/home/alice/project/README.md" onChange={e => setTestPath(e.target.value)} />
      </Field>
      <Button type="submit" variant="outline" disabled={busy}>{busy ? 'Testing…' : 'Test file access'}</Button>
    </form>}
    <ErrorNotice error={error ?? (files.error ? new Error(files.error) : undefined)} standalone />
    {status && <p className={css.hint} role="status">{status}</p>}
  </>;
}
