import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { IconFullscreenOutlineRegular } from '../../icons/index';
import { MediaViewer } from '../media/MediaViewer';
import { CodeBlock } from './CodeBlock';
import css from './Diagram.module.css';

function subscribeTheme(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
  return () => observer.disconnect();
}
function darkTheme() {
  return document.body.hasAttribute('data-ds-dark-theme');
}

/**
 * One mermaid fence rendered offscreen to a sanitized static SVG blob, shown
 * as a fitted image with an expand-to-viewer affordance and a collapsible
 * source block. Re-renders when the dark theme flips on
 * body[data-ds-dark-theme].
 */
export function Diagram({ source }: { source: string }) {
  const preview = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const dark = useSyncExternalStore(subscribeTheme, darkTheme);
  const [result, setResult] = useState<{
    source: string;
    dark: boolean;
    url?: string;
    title?: string;
    error?: string;
  }>();
  const current = result?.source === source && result.dark === dark ? result : undefined;
  useEffect(() => {
    const abort = new AbortController();
    let url = '';
    const timer = setTimeout(() => {
      void import('./mermaid-renderer')
        .then((module) => module.renderDiagram(source, dark, abort.signal))
        .then((image) => {
          if (abort.signal.aborted) return;
          url = URL.createObjectURL(image.blob);
          setResult({ source, dark, url, title: image.title });
        })
        .catch((error) => {
          if (!abort.signal.aborted)
            setResult({
              source,
              dark,
              error: error instanceof Error ? error.message : 'The diagram could not be rendered.',
            });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [source, dark]);
  return (
    <figure className={css.diagram}>
      {current?.url ? (
        <div className={css.scroll}>
          <button
            ref={preview}
            type="button"
            className={css.preview}
            aria-label="Expand diagram"
            title="Expand diagram"
            onClick={() => setExpanded(true)}
          >
            <img src={current.url} alt={current.title ?? 'Mermaid diagram'} />
            <span className={css.expand} aria-hidden="true">
              <IconFullscreenOutlineRegular size={16} />
            </span>
          </button>
        </div>
      ) : (
        <p className={css.status}>
          {current?.error ? 'Diagram preview unavailable. The source is below.' : 'Rendering diagram…'}
        </p>
      )}
      <details className={css.source}>
        <summary>Diagram source</summary>
        <CodeBlock code={source} language="mermaid" className={css.sourceBlock} />
        {current?.error && <p className={css.errorText}>{current.error}</p>}
      </details>
      {expanded && current?.url && (
        <MediaViewer
          src={current.url}
          alt={current.title ?? 'Mermaid diagram'}
          onClose={() => {
            setExpanded(false);
            preview.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </figure>
  );
}
