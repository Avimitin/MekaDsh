import { useEffect, useMemo, useRef, useState } from 'react';
import { useConnection } from '../../connections/context';
import { fileUrl } from '../../features/files/config';
import { useFileAccess } from '../../features/files/hooks';
import { DOWNLOAD_LIMIT, fetchFile } from '../../features/files/client';
import { Button } from '../primitives/Button';
import { CodeBlock } from '../chat/markdown/CodeBlock';
import { staticHtmlPreview } from './static-preview';
import { fileLanguage } from './recorded-files';
import css from './Deliverables.module.css';

type LoadedFile = Awaited<ReturnType<typeof fetchFile>>;

function FileContents({ file, path }: { file: LoadedFile; path: string }) {
  const signature = Array.from(file.bytes.slice(0, 12), b => String.fromCharCode(b)).join('');
  const mediaType = signature.startsWith('\x89PNG\r\n\x1a\n') ? 'image/png'
    : signature.startsWith('\xff\xd8\xff') ? 'image/jpeg'
      : /^GIF8[79]a/.test(signature) ? 'image/gif'
        : signature.startsWith('RIFF') && signature.slice(8) === 'WEBP' ? 'image/webp'
          : signature.startsWith('%PDF-') ? 'application/pdf' : '';
  const [objectUrl, setObjectUrl] = useState('');
  useEffect(() => {
    if (!mediaType) return;
    const url = URL.createObjectURL(new Blob([file.bytes], { type: mediaType }));
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, mediaType]);
  const language = fileLanguage(path);
  const text = useMemo(() => {
    if (mediaType || file.bytes.includes(0)) return undefined;
    try { return new TextDecoder('utf-8', { fatal: true }).decode(file.bytes); } catch { return undefined; }
  }, [file, mediaType]);
  const [rendered, setRendered] = useState(false);
  const html = useMemo(() => rendered && language === 'html' && text !== undefined ? staticHtmlPreview(text) : '', [rendered, language, text]);
  if (mediaType.startsWith('image/')) return objectUrl ? <img className={css.currentImage} src={objectUrl} alt={path} /> : null;
  if (mediaType === 'application/pdf') return <>
    <p className={css.note}>If your browser cannot display this PDF, use Download.</p>
    {objectUrl && <iframe className={css.htmlPreview} sandbox="" referrerPolicy="no-referrer" title={`PDF preview of ${path}`} src={objectUrl} />}
  </>;
  if (text === undefined) return <p className={css.note}>Preview is unavailable for this binary file. Use Download to save it.</p>;
  return <>
    {language === 'html' && text.length <= 200_000 && <Button size="sm" onClick={() => setRendered(!rendered)}>{rendered ? 'Show source' : 'Preview static HTML'}</Button>}
    {rendered ? <iframe className={css.htmlPreview} title={`Static preview of ${path}`} sandbox="" referrerPolicy="no-referrer" srcDoc={html} /> : <>
      {text.length > 200_000 && <p className={css.note}>Showing the first 200,000 characters. Download includes the complete file.</p>}
      <CodeBlock code={text.slice(0, 200_000)} language={language} />
    </>}
  </>;
}

export function CurrentFile({ path, cwd }: { path: string; cwd?: string | null | undefined }) {
  const { connection } = useConnection();
  const files = useFileAccess(connection);
  const [input, setInput] = useState(path);
  const [selected, setSelected] = useState(path);
  let url = '';
  let error = files.error;
  try { if (selected && files.access) url = fileUrl(files.access, selected, cwd); }
  catch (e) { error = e instanceof Error ? e.message : 'Unable to resolve this file path.'; }
  return <section className={css.preview} aria-label="Current file">
    <form className={css.currentPath} onSubmit={e => { e.preventDefault(); setSelected(input); }}>
      <label htmlFor="current-file-path">File path</label>
      <input id="current-file-path" className={css.search} required value={input} placeholder="/home/alice/project/report.pdf" onChange={e => setInput(e.target.value)} />
      <Button type="submit" size="sm" variant="outline">Open file</Button>
    </form>
    <p className={css.note}>Current server contents. Relative paths use the session's current working directory{cwd ? ` (${cwd})` : ''}; older operations may have used a different directory.</p>
    {error && <p className={css.note} role="alert">{error}</p>}
    {url && files.access && <FileView key={url + JSON.stringify(files.access) + JSON.stringify(files.credential)}
      url={url} path={selected} files={files} />}
  </section>;
}

function FileView({ url, path, files }: { url: string; path: string; files: ReturnType<typeof useFileAccess> }) {
  const [revision, setRevision] = useState(0);
  const [file, setFile] = useState<LoadedFile>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const lifetime = useRef(new AbortController());
  const access = files.access!;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setFile(undefined); setError('');
    void fetchFile(url, access.auth, files.credential, AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]))
      .then(result => { if (!controller.signal.aborted) setFile(result); })
      .catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load this file.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, access.auth, files.credential?.username, files.credential?.secret, revision]);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  async function download() {
    setDownloading(true); setError('');
    try {
      const result = await fetchFile(url, access.auth, files.credential, AbortSignal.any([lifetime.current.signal, AbortSignal.timeout(120000)]), DOWNLOAD_LIMIT);
      const blob = URL.createObjectURL(new Blob([result.bytes], { type: 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = blob; a.download = path.split('/').at(-1) || 'download';
      document.body.append(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(blob), 1000);
    } catch (e) { if (!lifetime.current.signal.aborted) setError(e instanceof Error ? e.message : 'Download failed.'); }
    finally { if (!lifetime.current.signal.aborted) setDownloading(false); }
  }
  return <>
    <div className={css.toolbar}>
      <Button size="sm" onClick={() => setRevision(revision + 1)} disabled={loading}>Refresh</Button>
      <Button size="sm" onClick={() => void download()} disabled={downloading}>{downloading ? 'Downloading…' : 'Download current file'}</Button>
    </div>
    {loading && <p className={css.note} role="status">Loading current file…</p>}
    {error && <p className={css.note} role="alert">{error}</p>}
    {file && <>
      <p className={css.note}>{file.bytes.length.toLocaleString()} bytes{file.modified ? ` · Modified ${file.modified}` : ''}</p>
      <div className={css.previewBody}><FileContents key={revision} file={file} path={path} /></div>
    </>}
  </>;
}
