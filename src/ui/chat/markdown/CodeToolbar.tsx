import {
  IconCheckOutlineRegular,
  IconCopyOutlineRegular,
  IconNowrapFillRegular,
  IconWrapFillRegular,
} from '../../icons/index';
import { useCopyFeedback } from '../../primitives/use-copy-feedback';
import css from './CodeBlock.module.css';

/** Language label, wrap toggle, and clipboard control for a code card header. */
export function CodeToolbar({
  language,
  wrap,
  onWrapChange,
  text,
}: {
  /** Grammar tag shown on the left; unknown fences read as plain text. */
  language: string | undefined;
  wrap: boolean;
  onWrapChange: (wrap: boolean) => void;
  /** Source placed on the clipboard by the copy action. */
  text: string;
}) {
  const { copied, onCopy } = useCopyFeedback(text);
  const wrapLabel = wrap ? 'Do not wrap long lines' : 'Wrap long lines';
  return (
    <div className={css.toolbar} data-code-block-banner>
      <span className={css.language}>{language ?? 'text'}</span>
      <div className={css.actions}>
        <button
          type="button"
          className={css.action}
          aria-label={wrapLabel}
          aria-pressed={wrap}
          title={wrapLabel}
          onClick={() => onWrapChange(!wrap)}
        >
          {wrap ? <IconNowrapFillRegular size={14} /> : <IconWrapFillRegular size={14} />}
        </button>
        <button
          type="button"
          className={css.action}
          aria-label={copied ? 'Copied' : 'Copy code'}
          title={copied ? 'Copied' : 'Copy code'}
          onClick={onCopy}
        >
          {copied ? <IconCheckOutlineRegular size={14} /> : <IconCopyOutlineRegular size={14} />}
        </button>
      </div>
    </div>
  );
}
