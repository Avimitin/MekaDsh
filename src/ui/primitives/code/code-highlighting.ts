/** Shared filename-to-grammar selection and lazy line highlighter for source views. */
import { useCallback, useSyncExternalStore } from 'react';
import {
  grammarLoadCount,
  highlightLines,
  subscribeGrammarLoaded,
  type HighlightSpan,
} from './highlighter';

export { CODE_HIGHLIGHT_EXTENSIONS, languageForPath } from './language';

/** Highlight one source fragment into one token list per line. */
export type CodeHighlighter = (code: string) => HighlightSpan[][] | undefined;

/**
 * Bind the shared lazy highlighter to one language and refresh after its grammar loads.
 * @param language - grammar hint selected from the source filename.
 * @returns a stable fragment highlighter; unknown and loading grammars return `undefined` for plain-text fallback.
 */
export function useCodeHighlighter(language: string | undefined): CodeHighlighter {
  const loaded = useSyncExternalStore(subscribeGrammarLoaded, grammarLoadCount, grammarLoadCount);
  return useCallback((code) => highlightLines(code, language), [language, loaded]);
}

export type { HighlightSpan };
