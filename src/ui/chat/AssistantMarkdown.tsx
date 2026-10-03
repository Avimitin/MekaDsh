import { isValidElement, memo, type ComponentProps, type ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkCjkFriendly from 'remark-cjk-friendly/parseOnly';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cn } from '../../lib/cn';
import {
  IconInfoOutlineRegular,
  IconLightOutlineRegular,
  IconWarningOutlineRegular,
  IconWarningTriangleOutlineRegular,
} from '../icons/index';
import { CodeBlock } from './markdown/CodeBlock';
import { Diagram } from './markdown/Diagram';
import { MarkdownTable } from './markdown/MarkdownTable';
import {
  normalizeMathDelimiters,
  remarkAdmonitions,
  remarkDisplayMath,
  rehypeMathAccessibility,
  rehypeTaskLabels,
} from './markdown/markdown-plugins';
import { scrollRegion } from './markdown/scroll-region';
import css from './AssistantMarkdown.module.css';
import 'katex/dist/katex.min.css';

function FencedBlock({ children }: ComponentProps<'pre'>) {
  if (!isValidElement(children)) return <pre>{children}</pre>;
  const code = children as ReactElement<ComponentProps<'code'>>;
  const text = String(code.props.children ?? '').replace(/\n$/, '');
  const language = /language-([^\s]+)/.exec(code.props.className ?? '')?.[1];
  return language?.toLowerCase() === 'mermaid' ? (
    <Diagram source={text} />
  ) : (
    <CodeBlock code={text} language={language} />
  );
}

const alertTitles: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

const alertIcons = {
  note: IconInfoOutlineRegular,
  tip: IconLightOutlineRegular,
  important: IconInfoOutlineRegular,
  warning: IconWarningOutlineRegular,
  caution: IconWarningTriangleOutlineRegular,
} as const;
/**
 * Full markdown rendering for assistant text: GFM (with measured tables and
 * read-only task lists), TeX math through KaTeX, GitHub-style admonitions,
 * shiki code blocks, and mermaid diagrams. HTML passes through as text,
 * external links open in a new tab, and external images render as links —
 * their bytes are never fetched. While `streaming`, the text re-parses per
 * delta. Turn activity is shown separately, as in DeepSeek Harness.
 * @param props.text - the complete or still-growing markdown source.
 * @param props.streaming - whether the text is the live tail of a stream.
 * @param props.className - extra class merged onto the markdown root.
 * @param props.variant - 'compact' steps typography down for secondary surfaces.
 */
export const AssistantMarkdown = memo(function AssistantMarkdown({
  text,
  streaming = false,
  className,
  variant = 'default',
}: {
  text: string;
  streaming?: boolean | undefined;
  className?: string | undefined;
  variant?: 'default' | 'compact' | undefined;
}) {
  return (
    <div
      className={cn(css.markdown, variant === 'compact' && css.compact, className)}
      data-streaming={streaming || undefined}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLElement && event.target.classList.contains('katex-display'))
          scrollRegion(event, event.target);
      }}
    >
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          remarkCjkFriendly,
          remarkMath,
          remarkDisplayMath,
          remarkAdmonitions,
        ]}
        rehypePlugins={[
          rehypeTaskLabels,
          [
            rehypeKatex,
            {
              trust: false,
              strict: 'ignore',
              maxExpand: 1000,
              maxSize: 20,
              errorColor: 'var(--dsw-alias-state-error-primary)',
            },
          ],
          rehypeMathAccessibility,
        ]}
        skipHtml
        components={{
          pre: FencedBlock,
          table: MarkdownTable,
          input: ({ type, checked, 'aria-label': label }) =>
            type === 'checkbox' ? (
              <input type="checkbox" checked={Boolean(checked)} disabled aria-label={label} />
            ) : null,
          blockquote: ({ children, node }) => {
            const kind = String(node?.properties['data-alert'] ?? node?.properties.dataAlert ?? '');
            if (!Object.hasOwn(alertTitles, kind)) return <blockquote>{children}</blockquote>;
            const Icon = alertIcons[kind as keyof typeof alertIcons] ?? IconInfoOutlineRegular;
            const alertClass = {
              note: css.alertNote,
              tip: css.alertTip,
              important: css.alertImportant,
              warning: css.alertWarning,
              caution: css.alertCaution,
            }[kind];
            return (
              <aside
                className={cn(css.alert, alertClass)}
                role="note"
                aria-label={alertTitles[kind]}
              >
                <div className={css.alertHeading}>
                  <Icon size={16} />
                  {alertTitles[kind]}
                </div>
                {children}
              </aside>
            );
          },
          a: ({ children, href, title, id, node }) => {
            const fragment = href?.startsWith('#');
            return (
              <a
                href={href}
                title={title}
                id={id}
                target={fragment ? undefined : '_blank'}
                rel={fragment ? undefined : 'noreferrer noopener'}
                aria-label={node?.properties.dataFootnoteBackref ? 'Back to reference' : undefined}
                onClick={
                  fragment
                    ? (event) => {
                        event.preventDefault();
                        const target = event.currentTarget
                          .closest(`.${css.markdown}`)
                          ?.querySelector<HTMLElement>(
                            `[id="${CSS.escape(href?.slice(1) ?? '')}"]`,
                          );
                        target?.scrollIntoView({ block: 'nearest' });
                        target?.focus({ preventScroll: true });
                      }
                    : undefined
                }
              >
                {children}
              </a>
            );
          },
          img: ({ src, alt }) => (
            <a href={src} target="_blank" rel="noreferrer noopener">
              {alt || 'External image'} (open image)
            </a>
          ),
        }}
      >
        {normalizeMathDelimiters(text)}
      </ReactMarkdown>
    </div>
  );
});
