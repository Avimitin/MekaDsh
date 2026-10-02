import { memo, useMemo, useState } from 'react';
import { DisclosureRow } from '../primitives/DisclosureRow';
import { TextShimmer } from '../primitives/TextShimmer';
import { IconThinkOutlineRegular } from '../icons/index';
import { AssistantMarkdown } from './AssistantMarkdown';
import css from './ReasoningRow.module.css';

function firstLine(text: string): string {
  const newline = text.indexOf('\n');
  return newline === -1 ? text : text.slice(0, newline);
}

function latestCompletedParagraphFirstLine(text: string): string {
  let summary = '';
  let paragraphStart = 0;
  const separator = /\r?\n(?:[\t ]*\r?\n)+/g;
  while (true) {
    const nextParagraph = separator.exec(text);
    const paragraphEnd =
      nextParagraph === null
        ? text.length
        : nextParagraph.index + nextParagraph[0].indexOf('\n');
    const newline = text.indexOf('\n', paragraphStart);
    if (newline !== -1 && newline <= paragraphEnd) {
      const candidate = text.slice(paragraphStart, newline).trim();
      if (candidate !== '') summary = candidate;
    }
    if (nextParagraph === null) return summary;
    paragraphStart = nextParagraph.index + nextParagraph[0].length;
  }
}

/**
 * One assistant reasoning block collapsed until the reader opens it. The
 * collapsed summary is the first line of the latest completed paragraph with
 * its emphasis markers dropped; it shimmers while the block streams. The
 * expanded body renders the complete markdown in compact secondary typography.
 * @param props.text - complete or streaming reasoning text.
 * @param props.streaming - whether this block is the streaming tail.
 * @param props.defaultOpen - initial disclosure state.
 */
export const ReasoningRow = memo(function ReasoningRow({
  text,
  streaming = false,
  defaultOpen = false,
}: {
  text: string;
  streaming?: boolean | undefined;
  defaultOpen?: boolean | undefined;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const summaryText = streaming ? latestCompletedParagraphFirstLine(text) : firstLine(text);
  const summary = useMemo(() => summaryText.replaceAll('**', ''), [summaryText]);
  const preview = !expanded && summary !== '';
  const collapsedContent = useMemo(
    () => (
      <>
        <span className={css.separator} data-shimmer-decoration aria-hidden />
        <span className={css.summary} data-streaming={streaming || undefined}>
          <span className={css.summaryText}>
            <TextShimmer>{summary}</TextShimmer>
          </span>
        </span>
      </>
    ),
    [streaming, summary],
  );
  return (
    <div
      className={css.root}
      data-variant="think"
      data-state={streaming ? 'running' : 'ok'}
      data-expanded={expanded || undefined}
      data-preview={preview || undefined}
    >
      {streaming && <span className="sr-only">Running</span>}
      <DisclosureRow
        rowClassName={css.row}
        leadingClassName={css.leading}
        titleClassName={css.title}
        icon={<IconThinkOutlineRegular size={14} />}
        title="Thinking"
        running={streaming}
        open={expanded}
        expandable
        expandOnRowClick
        onToggle={() => setExpanded((value) => !value)}
        collapsedContent={collapsedContent}
      >
        {expanded ? (
          <div className={css.thinkBody}>
            <AssistantMarkdown text={text} streaming={streaming} variant="compact" />
          </div>
        ) : undefined}
      </DisclosureRow>
    </div>
  );
});
