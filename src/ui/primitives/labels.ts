/**
 * Default American-English label objects for the primitives that take `labels`
 * props. The strings are the en values of dsh's own locale dictionaries, so a
 * render site that wants dsh's exact copy can spread these; sites that need
 * other wording supply their own.
 */
import type { CodeToolbarLabels } from './CodeToolbar';
import type { DiffBlockLabels } from './DiffBlock';
import type { ImageLightboxLabels } from './ImageLightbox';
import type { JsonTreeLabels } from './JsonTree';
import type { ReadBlockLabels } from './ReadBlock';
import type { SearchBlockLabels } from './SearchBlock';
import type { TerminalBlockLabels } from './TerminalBlock';
import type { WebBlockLabels } from './WebBlock';

/** Code-card toolbar copy. */
export const codeToolbarLabels: CodeToolbarLabels = {
  codeLabel: 'Code block',
  wrapLabel: 'Wrap lines',
  unwrapLabel: 'Do not wrap lines',
};

const foldCopy = {
  copy: 'Copy',
  copied: 'Copied',
  collapse: 'Collapse',
} as const;

/** TerminalBlock copy. */
export const terminalBlockLabels: TerminalBlockLabels = {
  signal: (signal) => `signal ${signal}`,
  exitCode: (exitCode) => `exit code ${exitCode}`,
  noExitCode: 'no exit code',
  running: 'Running',
  failed: 'Failed',
  done: 'Done',
  ...foldCopy,
  noOutput: 'No output',
  collapseAria: 'Collapse output',
  expandAria: (hidden) => `Expand the remaining ${hidden} output lines`,
  expand: (hidden) => `… ${hidden} more lines`,
};

/** ReadBlock copy. */
export const readBlockLabels: ReadBlockLabels = {
  ...codeToolbarLabels,
  window: (shown, total) => `Showing ${shown} of ${total} lines`,
  ...foldCopy,
  collapseAria: 'Collapse content',
  expandAria: (hidden) => `Expand ${hidden} more lines`,
  expand: (hidden) => `… ${hidden} more lines`,
};

/** DiffBlock copy. */
export const diffBlockLabels: DiffBlockLabels = {
  ...codeToolbarLabels,
  ...foldCopy,
  collapseAria: 'Collapse diff',
  expandAria: (hidden) => `Expand ${hidden} more diff lines`,
  expand: (hidden) => `… ${hidden} more lines`,
};

/** SearchBlock copy. */
export const searchBlockLabels: SearchBlockLabels = {
  pathsSummary: (shown, total, truncated) => (truncated ? `Showing ${shown} of ${total} paths` : `${shown} paths`),
  matchesSummary: (shown, total, files, truncated) =>
    truncated ? `Showing ${shown} of ${total} matches · ${files} files` : `${shown} matches · ${files} files`,
  ...foldCopy,
  noResults: 'No results',
  collapseAria: 'Collapse results',
  expandAria: (hidden) => `Expand ${hidden} more result lines`,
  expand: (hidden) => `… ${hidden} more lines`,
};

/** WebBlock chrome copy (the markdown renderer seat stays with the caller). */
export const webBlockLabels: Omit<WebBlockLabels, 'renderMarkdown'> = {
  noResults: 'No results found',
  sourcesTruncated: 'Source list truncated',
  http: 'HTTP',
  contentTruncated: 'Content truncated',
};

/** JsonTree copy. */
export const jsonTreeLabels: JsonTreeLabels = {
  copyValue: 'Copy value',
  copyJson: 'Copy JSON',
  copyPath: 'Copy property path',
  copyPrettyJson: 'Copy pretty JSON',
  copyCompactJson: 'Copy compact JSON',
  copied: 'Copied',
  copyFailed: 'Copy failed',
  collapseNode: 'Collapse',
  expandNode: 'Expand',
  copyButtonTitle: (action) => `${action}; right-click for copy options`,
};

/** ImageLightbox copy. */
export const imageLightboxLabels: ImageLightboxLabels = {
  dialog: 'Image preview',
  close: 'Close image preview',
};

/** ImagePreview status copy. */
export const imagePreviewLabels: { loadingLabel: string; failedLabel: string } = {
  loadingLabel: 'Loading image…',
  failedLabel: 'Image preview unavailable',
};

/** JsonBlock truncation footer. */
export function jsonBlockTruncatedLabel(total: number): string {
  return `… truncated at ${total} characters`;
}

/** CodeBlock copy buttons. */
export const codeBlockLabels: { copyLabel: string; copiedLabel: string } = {
  copyLabel: 'Copy',
  copiedLabel: 'Copied',
};
