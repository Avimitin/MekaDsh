/** Caret token detection adapted from Harness ui-input-trigger (MIT). */
export interface InputTrigger {
  char: '/' | '@';
  query: string;
  start: number;
  end: number;
}

export interface ComposerSuggestion {
  id: string;
  label: string;
  description: string;
  group: 'Skills' | 'Profiles' | 'Permissions' | 'Sessions';
  search?: string;
  /** Text is inserted into the draft; actions only change composer settings. */
  insert?: string;
  pick?: () => void;
}

export function detectInputTrigger(text: string, start: number, end = start): InputTrigger | null {
  if (start !== end || start < 0 || start > text.length) return null;
  const before = text.slice(0, start);
  // Whitespace boundaries avoid treating URLs, file paths, or email addresses as commands.
  const match = /(?:^|\s)([/@])([^\s/@]*)$/u.exec(before);
  if (!match) return null;
  const char = match[1] as '/' | '@';
  const query = match[2] ?? '';
  // Replacing a partially selected token must not leave its trailing characters behind.
  let tokenEnd = start;
  while (tokenEnd < text.length && !/[\s/@]/u.test(text[tokenEnd]!)) tokenEnd++;
  return { char, query, start: start - query.length - 1, end: tokenEnd };
}

export function filterSuggestions(items: readonly ComposerSuggestion[], query: string): ComposerSuggestion[] {
  const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return items.filter((item) => {
    const haystack = `${item.label} ${item.description} ${item.search ?? ''}`.toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  }).slice(0, 40);
}

export function replaceTrigger(text: string, trigger: InputTrigger, insert = '') {
  const suffix = text.slice(trigger.end);
  const replacement = insert ? insert + (suffix.startsWith(' ') ? '' : ' ') : '';
  return {
    text: text.slice(0, trigger.start) + replacement + suffix,
    caret: trigger.start + replacement.length,
  };
}

/** This is a textual citation, not a promise to attach or load another transcript. */
export function sessionReference(title: string, id: string) {
  return `Session ${JSON.stringify(title || 'Untitled session')} (ID: ${id})`;
}
