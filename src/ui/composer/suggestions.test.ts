import { describe, expect, it } from 'vitest';
import { detectInputTrigger, filterSuggestions, replaceTrigger, sessionReference, type ComposerSuggestion } from './suggestions';

describe('composer trigger detection', () => {
  it('detects slash and session tokens at the caret, including after a newline', () => {
    expect(detectInputTrigger('Explain\n/rev', 12)).toEqual({ char: '/', query: 'rev', start: 8, end: 12 });
    expect(detectInputTrigger('Compare @session', 16)?.char).toBe('@');
  });
  it.each(['https://example.com/path', 'user@example.com', '/tmp/source.ts', 'src/foo', 'value/@test'])('leaves literal %s untouched', (text) => {
    expect(detectInputTrigger(text, text.length)).toBeNull();
  });
  it('does not claim text selections or an invalid caret', () => {
    expect(detectInputTrigger('/review', 2, 7)).toBeNull();
    expect(detectInputTrigger('/review', -1)).toBeNull();
  });
  it('replaces a complete token while editing in the middle, preserving surrounding text', () => {
    const text = 'Please /review this';
    const trigger = detectInputTrigger(text, 10)!;
    expect(trigger.query).toBe('re');
    expect(replaceTrigger(text, trigger)).toEqual({ text: 'Please  this', caret: 7 });
    expect(replaceTrigger(text, trigger, 'Use review')).toEqual({ text: 'Please Use review this', caret: 17 });
  });
  it('adds a separating space only when needed', () => {
    expect(replaceTrigger('@test', detectInputTrigger('@test', 5)!, 'Session test')).toEqual({ text: 'Session test ', caret: 13 });
  });
});

describe('suggestion filtering and references', () => {
  const items: ComposerSuggestion[] = [
    { id: 's1', label: '/review', description: 'Review code', group: 'Skills' },
    { id: 'p1', label: '/profile:coder', description: 'Model X', group: 'Profiles' },
    { id: 'r1', label: 'Architecture notes', description: 'Workspace', group: 'Sessions', search: 'session-123' },
  ];
  it('matches names, descriptions and session IDs without changing source order', () => {
    expect(filterSuggestions(items, 'CODE').map((item) => item.id)).toEqual(['s1', 'p1']);
    expect(filterSuggestions(items, 'session-123').map((item) => item.id)).toEqual(['r1']);
    expect(filterSuggestions(items, 'does-not-exist')).toEqual([]);
  });
  it('bounds the number of options', () => {
    expect(filterSuggestions(Array.from({ length: 100 }, () => items[0]!), '')).toHaveLength(40);
  });
  it('quotes untrusted titles and identifies the session explicitly', () => {
    expect(sessionReference('Title\n"quoted"', '123')).toBe('Session "Title\\n\\"quoted\\"" (ID: 123)');
    expect(sessionReference('', '123')).toContain('Untitled session');
  });
});
