import { useEffect, useState } from 'react';
import { cn } from '../../../lib/cn';
import { highlightCode } from '../../primitives/code/highlighter';
import { CodeToolbar } from './CodeToolbar';
import { scrollRegion } from './scroll-region';
import css from './CodeBlock.module.css';

/** Highlighting is skipped past this size; the block stays a plain pre. */
const MAX_HIGHLIGHT_CHARS = 100 * 1024;

/**
 * One fenced code block: shiki-highlighted when the grammar is known and the
 * source is small enough, plain text otherwise. The toolbar carries the
 * language label, a wrap toggle, and a copy control with copied feedback.
 */
export function CodeBlock({
  code,
  language,
  className,
}: {
  code: string;
  language?: string | undefined;
  className?: string | undefined;
}) {
  const trimmed = code.endsWith('\n') ? code.slice(0, -1) : code;
  const [wrap, setWrap] = useState(true);
  const [html, setHtml] = useState<string>();
  useEffect(() => {
    if (!language || trimmed.length > MAX_HIGHLIGHT_CHARS) {
      setHtml(undefined);
      return;
    }
    let live = true;
    setHtml(undefined);
    highlightCode(trimmed, language)
      .then((highlighted) => {
        if (live) setHtml(highlighted || undefined);
      })
      .catch(() => {
        if (live) setHtml(undefined);
      });
    return () => {
      live = false;
    };
  }, [trimmed, language]);
  return (
    <div className={cn(css.block, className)} data-code-block data-wrap={wrap || undefined}>
      <CodeToolbar language={language} wrap={wrap} onWrapChange={setWrap} text={trimmed} />
      {/* shiki's HTML output is a static span tree it generated from the source
          (no user HTML passes through), the sanctioned innerHTML path. */}
      <div
        className={css.content}
        data-code-block-content
        tabIndex={0}
        role="group"
        aria-label={language ? `${language} code` : 'Code'}
        onKeyDown={scrollRegion}
      >
        {html === undefined ? (
          <pre className={css.plain}>
            <code>{trimmed}</code>
          </pre>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </div>
  );
}
