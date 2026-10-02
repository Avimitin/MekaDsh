import { memo, useState } from 'react';
import {
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
  IconCompactOutlineRegular,
} from '../icons/index';
import { AssistantMarkdown } from './AssistantMarkdown';
import css from './CompactionCard.module.css';

/**
 * A compaction boundary in the conversation (dsh's compaction marker): one
 * 24px row with a compact glyph, the "Conversation summary" title, and the
 * counts caption. When the summary text is available the row expands to it,
 * its glyph swapping for a disclosure chevron on hover.
 * @param props.replacedCount - messages the compaction replaced.
 * @param props.generation - the session's compaction generation.
 * @param props.source - optional origin label appended to the caption.
 * @param props.text - the summary markdown; absent = not expandable.
 */
export const CompactionCard = memo(function CompactionCard({
  replacedCount,
  generation,
  source,
  text,
}: {
  replacedCount: number;
  generation: number;
  source?: string | undefined;
  text?: string | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const expandable = text !== undefined && text !== '';
  const open = expandable && expanded;
  const caption = `${replacedCount} message${replacedCount === 1 ? '' : 's'} compacted · generation ${generation}${source ? ` · ${source}` : ''}`;
  return (
    <div className={css.row} aria-label="Compaction boundary">
      <button
        type="button"
        className={css.toggle}
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className={css.leading} aria-hidden>
          <span className={css.contextIcon}>
            <IconCompactOutlineRegular />
          </span>
          <span className={css.disclosureIcon} data-open={open || undefined}>
            {open ? <IconChevronDownOutlineRegular /> : <IconChevronRightOutlineRegular />}
          </span>
        </span>
        <span className={css.title}>Conversation summary</span>
        <span className={css.sep} aria-hidden />
        <span className={css.caption}>{caption}</span>
      </button>
      {open && (
        <div className={css.body}>
          <AssistantMarkdown text={text!} variant="compact" />
        </div>
      )}
    </div>
  );
});
