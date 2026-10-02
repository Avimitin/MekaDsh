/**
 * Composer keymap for the plain textarea: the Enter submit gesture and the
 * Shift+Tab permission cycle, with full IME composition guards.
 *
 * IME guard: a composition-closing Enter must not submit.
 * KeyboardEvent.isComposing covers most engines; Safari delivers the closing
 * keydown AFTER compositionend, so a composition watch holds the guard for
 * 10ms more; keyCode 229 is the legacy signal engines emit without isComposing.
 */
import { useRef, type KeyboardEvent } from 'react';

export interface ComposerKeymapHandlers {
  /** Whether Enter may submit right now (locked/busy states refuse). */
  canSubmit(): boolean;
  /** Plain Enter submits. */
  submit(): void;
  /** Whether Shift+Tab cycles the permission level right now. */
  canCyclePermission(): boolean;
  /** Whether the level is held in place (a pending save or read-only settings). */
  permissionDisabled(): boolean;
  /** Shift+Tab advances to the next enabled permission level. */
  cyclePermission(): void;
}

/** Composition state a keydown can trust (see the module doc's Safari note). */
function isComposingEvent(event: KeyboardEvent, recentlyComposing: () => boolean): boolean {
  // keyCode 229 is the legacy IME-composition signal engines emit without isComposing.
  return event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || recentlyComposing();
}

/**
 * Bind the composer keymap for one textarea.
 * @param handlers - bar-supplied behavior.
 * @returns the textarea's keyboard and composition handlers.
 */
export function useComposerKeymap(handlers: ComposerKeymapHandlers) {
  // Composition watch: true through composition and for one tick after
  // compositionend (Safari's late closing keydown).
  const composition = useRef({ composing: false, composingUntil: 0 });
  const latest = useRef(handlers);
  latest.current = handlers;
  const recentlyComposing = () =>
    composition.current.composing || Date.now() < composition.current.composingUntil;

  const onCompositionStart = (): void => {
    composition.current.composing = true;
  };
  const onCompositionEnd = (): void => {
    composition.current.composing = false;
    composition.current.composingUntil = Date.now() + 10;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (isComposingEvent(event, recentlyComposing)) return;
    const current = latest.current;
    if (
      event.key === 'Tab' &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      current.canCyclePermission()
    ) {
      // Shift+Tab belongs to the permission mode only while it can change; a pending save holds
      // it in place, and otherwise the key moves focus as usual.
      event.preventDefault();
      if (event.repeat || current.permissionDisabled()) return;
      current.cyclePermission();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      // Plain Shift+Enter keeps its native line break, including during composition.
      event.preventDefault();
      // Held-down Enter must not machine-gun sends.
      if (event.repeat || !current.canSubmit()) return;
      current.submit();
    }
  };

  return { onKeyDown, onCompositionStart, onCompositionEnd };
}
