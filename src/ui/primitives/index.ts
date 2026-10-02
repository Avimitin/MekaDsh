/**
 * Cordis-free React primitives styled only through `--dsw-*` tokens, ported
 * from dsh's ui-primitives. The barrel imports tokens.css once so the design
 * tokens the modules reference are always defined.
 */

import './tokens.css';

export { Button } from './Button';
export type { ButtonVariant } from './Button';
export { DisclosureRow } from './DisclosureRow';
export type { DisclosureRowProps } from './DisclosureRow';
export { TextShimmer } from './TextShimmer';
export type { TextShimmerProps } from './TextShimmer';
export { StateDot } from './StateDot';
export type { StateDotState } from './StateDot';
export { Tooltip, TooltipSuppression } from './Tooltip';
export type { TooltipSide } from './Tooltip';
export { Menu, MenuItemButton } from './Menu';
export type { MenuEntry, MenuItem, MenuItemButtonProps, MenuLabel, MenuSeparator } from './Menu';
export { MenuSurface } from './MenuSurface';
export type { MenuSurfaceProps } from './MenuSurface';
export { MenuGroup, observeStickyMenuGroups } from './MenuGroup';
export { Modal } from './Modal';
export { Toast } from './Toast';
export { toast, dismissToast, ToastViewport, useVisibleToasts } from './toast-store';
export type { ToastOptions, ToastRecord } from './toast-store';
export { Switch } from './Switch';
export { Checkbox } from './Checkbox';
export { Input } from './Input';
export { Pill } from './Pill';
export { Tag } from './Tag';
export type { TagTone } from './Tag';
export { SegmentedControl } from './SegmentedControl';
export type { SegmentedControlOption } from './SegmentedControl';
export { SegmentedTabs } from './SegmentedTabs';
export type { SegmentedTab } from './SegmentedTabs';
export { JsonTree } from './JsonTree';
export type { JsonTreeLabels, JsonTreeProps } from './JsonTree';
export { CodeToolbar } from './CodeToolbar';
export type { CodeToolbarLabels } from './CodeToolbar';
export { FoldToggle } from './FoldToggle';
export { LinkIconMedium, LinkIconRegular, classifyLinkPath } from './LinkIcon';
export type { LinkIconKind, LinkIconProps } from './LinkIcon';
export { classifyFileType, fileExtension } from './file-type';
export type { FileType } from './file-type';
export { isCodeFileType, isLinkCodeExtension } from './code-file-types';
export type { CodeFileType } from './code-file-types';
export { TerminalBlock, DEFAULT_TERMINAL_MAX_LINES } from './TerminalBlock';
export type { TerminalBlockLabels, TerminalBlockProps } from './TerminalBlock';
export { ReadBlock, DEFAULT_READ_MAX_LINES } from './ReadBlock';
export type { ReadBlockLabels, ReadBlockLine, ReadBlockProps } from './ReadBlock';
export { SearchBlock, DEFAULT_SEARCH_MAX_LINES } from './SearchBlock';
export type {
  SearchBlockLabels,
  SearchBlockLineMatch,
  SearchBlockProps,
  SearchFileGroup,
  SearchMatchesBlockProps,
  SearchPathsBlockProps,
} from './SearchBlock';
export { WebBlock } from './WebBlock';
export type { WebBlockLabels, WebBlockProps, WebFetchBlockProps, WebSearchBlockProps, WebSourceView } from './WebBlock';
export { DiffBlock, DEFAULT_DIFF_MAX_LINES, diffTotals } from './DiffBlock';
export type { DiffBlockLabels, DiffBlockProps, DiffHunk } from './DiffBlock';
export { ImageLightbox } from './ImageLightbox';
export type { ImageLightboxLabels } from './ImageLightbox';
export { ImagePreview } from './ImagePreview';
export { RiskConfirmation } from './RiskConfirmation';
export type { RiskConfirmationProps } from './RiskConfirmation';
export { HoverCard } from './HoverCard';
export { ShortcutKeys } from './ShortcutKeys';
export { PathLabel } from './PathLabel';
export { ConfigField } from './ConfigField';
export type { ConfigFieldProps } from './ConfigField';
export { SettingsSecretField, SettingsValueField } from './settings-form/fields';
export type { SettingsFieldProps } from './settings-form/fields';

export { useModalLayer, closeTopModal, isBehindModal, modalSelector } from './useModalLayer';
export { useDismissOnOutsidePointer } from './useDismissOnOutsidePointer';
export { useAnchoredPosition } from './useAnchoredPosition';
export type { AnchoredPositionOptions } from './useAnchoredPosition';
export { useAnchoredMaxHeight } from './useAnchoredMaxHeight';
export { overlayTopMargin } from './overlay-top-margin';
export { usePointerGrace, POINTER_GRACE_MS } from './pointer-grace';
export type { PointerGrace } from './pointer-grace';
export { useCopyFeedback } from './use-copy-feedback';
export type { CopyFeedback } from './use-copy-feedback';
export { relativeTime } from './relative-time';
export type { RelativeTime, RelativeTimeUnit } from './relative-time';
export { observeComposition } from './keyboard-composition';
export { headTailCap } from './head-tail-cap';
export type { HeadTailCap } from './head-tail-cap';
export { pointerModality, INPUT_MODALITY, INPUT_MODALITY_ATTRIBUTE } from './input-modality';
export { writeClipboard } from './clipboard';
export { focusWithoutRing } from './focus';
export { fileSizeText } from './file-size';
export { rankByName } from './rank-by-name';
export { parseAnsiLines } from './ansi';
export type { AnsiLine, AnsiSpan } from './ansi';
export { pathPartsOf } from './workspace-path';

export { CodeBlock } from './markdown/CodeBlock';
export type { CodeBlockProps } from './markdown/CodeBlock';
export { JsonBlock } from './markdown/JsonBlock';
export { useViewportHighlighting } from './markdown/useViewportHighlighting';

export {
  grammarForHint,
  highlightCode,
  highlightLines,
  highlightToHtml,
  MAX_HIGHLIGHT_CHARS,
  StreamingHighlightSession,
  subscribeGrammarLoaded,
  grammarLoadCount,
  supportsHighlighting,
} from './code/highlighter';
export type { HighlightSpan, StreamingHighlightFrame } from './code/highlighter';
export { CODE_HIGHLIGHT_EXTENSIONS, languageForPath } from './code/language';
export { useCodeHighlighter } from './code/code-highlighting';
export type { CodeHighlighter } from './code/code-highlighting';

export {
  codeBlockLabels,
  codeToolbarLabels,
  diffBlockLabels,
  imageLightboxLabels,
  imagePreviewLabels,
  jsonBlockTruncatedLabel,
  jsonTreeLabels,
  readBlockLabels,
  searchBlockLabels,
  terminalBlockLabels,
  webBlockLabels,
} from './labels';
