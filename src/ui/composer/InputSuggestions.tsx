import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Schema } from '../../api/client';
import { useCan, useResource } from '../../connections/context';
import { cn } from '../../lib/cn';
import { detectInputTrigger, filterSuggestions, replaceTrigger, sessionReference, type ComposerSuggestion } from './suggestions';
import css from './InputSuggestions.module.css';

export function useInputSuggestions({ text, onTextChange, input, anchor, disabled, commands }: {
  text: string;
  onTextChange: (text: string) => void;
  input: RefObject<HTMLTextAreaElement | null>;
  anchor: RefObject<HTMLDivElement | null>;
  disabled: boolean;
  commands: readonly ComposerSuggestion[];
}) {
  const id = useId();
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [focused, setFocused] = useState(false);
  const [composing, setComposing] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const trigger = disabled || !focused || composing ? null : detectInputTrigger(text, selection.start, selection.end);
  const key = trigger ? `${text}:${selection.start}:${selection.end}` : '';
  const canRead = useCan('sessions:r');
  const sessions = useResource<Schema['ListSessionsResponse']>('/v1/sessions', { limit: 100 }, trigger?.char === '@' && canRead);
  const references: ComposerSuggestion[] = (canRead ? sessions.data?.sessions ?? [] : []).map((session) => ({
    id: session.id,
    label: session.title || 'Untitled session',
    description: session.cwd || session.profile,
    search: session.id,
    group: 'Sessions',
    insert: sessionReference(session.title, session.id),
  }));
  const choices = trigger ? filterSuggestions(trigger.char === '/' ? commands : references, trigger.query) : [];
  const open = Boolean(trigger) && dismissed !== key;
  const active = choices[Math.min(index, choices.length - 1)];
  const list = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  useEffect(() => { setIndex(0); }, [key]);
  useEffect(() => {
    if (open && active) document.getElementById(`${id}-${active.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active?.id, id]);
  useLayoutEffect(() => {
    if (!open) return;
    function measure() {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      const above = rect.top - top - 8;
      const below = bottom - rect.bottom - 8;
      const down = above < 120 && below > above;
      setPosition({ left: rect.left, width: rect.width, top: down ? rect.bottom + 4 : rect.top - 4,
        transform: down ? undefined : 'translateY(-100%)', maxHeight: Math.max(64, Math.min(340, down ? below : above)) });
    }
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [open, anchor]);
  function syncSelection() {
    const el = input.current;
    if (el) setSelection({ start: el.selectionStart, end: el.selectionEnd });
  }
  function pick(choice: ComposerSuggestion) {
    if (!trigger || disabled) return;
    const next = replaceTrigger(text, trigger, choice.insert);
    onTextChange(next.text);
    choice.pick?.();
    setDismissed(key);
    requestAnimationFrame(() => {
      // A user may already have typed again before this frame. Keep that newer caret.
      if (input.current?.value !== next.text) return;
      input.current?.focus({ preventScroll: true });
      input.current?.setSelectionRange(next.caret, next.caret);
      syncSelection();
    });
  }
  /** Called inside the composer's existing IME guard before its submit keymap. */
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!open || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); setDismissed(key); return true;
    }
    if (!active) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex((current) => (Math.min(current, choices.length - 1) + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length);
      return true;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      if (!event.repeat) pick(active);
      return true;
    }
    return false;
  }
  const menu = open ? createPortal(
    <div className={css.menu} style={position} onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()}>
      <div className={css.viewport} ref={list} role="listbox" id={id} aria-label={trigger?.char === '@' ? 'Session references' : 'Composer commands'}>
        {choices.map((choice, choiceIndex) => (
          <div key={choice.id}>
            {(choiceIndex === 0 || choice.group !== choices[choiceIndex - 1]?.group) && <div role="presentation" className={css.heading}>{choice.group}</div>}
            <div role="option" id={`${id}-${choice.id}`} aria-selected={choice === active} className={cn(css.item, choice === active && css.active)}
              onPointerMove={(event) => { if (event.pointerType === 'mouse') setIndex(choiceIndex); }}
              onClick={() => pick(choice)}>
              <span className={css.name}>{choice.label}</span><span className={css.description}>{choice.description}</span>
            </div>
          </div>
        ))}
        {!choices.length && <div className={css.heading} role="presentation">{trigger?.char === '@' && sessions.isFetching ? 'Loading sessions…' : trigger?.char === '@' && sessions.isError ? 'Could not load sessions.' : 'No matching suggestions'}</div>}
      </div>
      <div className={css.hint}>{trigger?.char === '@' ? 'Recent sessions. Inserts name and ID; messages are not attached.' : '↑ ↓ to navigate · Enter or Tab to select · Esc to dismiss'}</div>
    </div>, document.body) : null;
  return { menu, onKeyDown, syncSelection,
    onCompositionStart: () => setComposing(true),
    onCompositionEnd: () => { setComposing(false); syncSelection(); },
    onFocus: () => { setFocused(true); syncSelection(); },
    onBlur: () => { setFocused(false); },
    aria: { 'aria-autocomplete': 'list' as const, 'aria-controls': open ? id : undefined, 'aria-activedescendant': open && active ? `${id}-${active.id}` : undefined, 'aria-haspopup': 'listbox' as const },
  };
}
