/** Shared modal keyboard ownership, background isolation, and focus lifetime. */
import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { observeComposition } from './keyboard-composition';
import { focusWithoutRing } from './focus';

/** Dialog and menu elements whose document order determines foreground shortcut ownership. */
export const modalSelector = '[role="dialog"][aria-modal="true"], [role="menu"]';

type Layer = { element: HTMLElement; close: () => void };
type Portal = { element: HTMLElement; anchor: RefObject<HTMLElement | null> };
type Isolation = { restore: () => void; update: () => void };
const layers = new WeakMap<Document, Layer[]>();
const portals = new WeakMap<Document, Set<Portal>>();
const isolation = new WeakMap<Document, Isolation>();

function regions(document: Document, element: HTMLElement): HTMLElement[] {
  const result = [element];
  // A submenu or hover card can itself belong to a portaled menu.
  for (let index = 0; index < result.length; index += 1) {
    const region = result[index]!;
    for (const portal of portals.get(document) ?? []) {
      if (portal.anchor.current !== null && region.contains(portal.anchor.current) && !result.includes(portal.element)) {
        result.push(portal.element);
      }
    }
  }
  return result;
}

/** Keep an anchored portal available while its owning dialog isolates the page. */
export function useModalPortal(
  anchor: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
  open: boolean,
): void {
  useLayoutEffect(() => {
    const element = content.current;
    if (!open || element === null) return;
    const document = element.ownerDocument;
    const entries = portals.get(document) ?? new Set<Portal>();
    portals.set(document, entries);
    const entry = { element, anchor };
    entries.add(entry);
    isolation.get(document)?.update();
    return () => {
      entries.delete(entry);
      if (entries.size === 0) portals.delete(document);
      isolation.get(document)?.update();
    };
  }, [anchor, content, open]);
}

function isolateBackground(document: Document): Isolation {
  const originals = new Map<Element, string | null>();
  const body = document.body;
  const overflow = body.style.getPropertyValue('overflow');
  const priority = body.style.getPropertyPriority('overflow');
  body.style.setProperty('overflow', 'hidden');
  const restoreInert = () => {
    for (const [element, original] of originals) {
      if (original === null) element.removeAttribute('inert');
      else element.setAttribute('inert', original);
    }
    originals.clear();
  };
  const update = () => {
    restoreInert();
    const top = layers.get(document)?.at(-1);
    if (top === undefined) return;
    const allowed = regions(document, top.element).map((region) => region.closest('[data-modal-root]') ?? region);
    const isolate = (parent: Element) => {
      for (const child of parent.children) {
        if (allowed.includes(child)) continue;
        if (allowed.some((region) => child.contains(region))) isolate(child);
        else {
          originals.set(child, child.getAttribute('inert'));
          child.setAttribute('inert', '');
        }
      }
    };
    isolate(body);
  };
  const observer = new MutationObserver(update);
  observer.observe(body, { childList: true, subtree: true });
  return {
    update,
    restore: () => {
      observer.disconnect();
      restoreInert();
      if (overflow) body.style.setProperty('overflow', overflow, priority);
      else body.style.removeProperty('overflow');
    },
  };
}

/** Close the foreground registered modal when no menu owns dismissal. */
export function closeTopModal(document: Document): void {
  const top = layers.get(document)?.at(-1);
  if (top === undefined) return;
  const foreground = [...document.querySelectorAll(modalSelector)]
    .filter((element) => !element.closest('[inert]')).at(-1);
  if (foreground === top.element) top.close();
}

/** Whether an anchor belongs behind the current modal and must yield keyboard input. */
export function isBehindModal(anchor: HTMLElement | null): boolean {
  if (anchor === null) return false;
  const document = anchor.ownerDocument;
  const top = layers.get(document)?.at(-1);
  return top !== undefined && !regions(document, top.element).some((region) => region.contains(anchor));
}

const focusable = 'button, input, textarea, select, a[href], area[href], [tabindex], [contenteditable="true"], audio[controls], video[controls], summary';

function visible(element: HTMLElement): boolean {
  return !element.closest('[inert], [hidden], [aria-hidden="true"]')
    && !element.matches(':disabled')
    && element.getClientRects().length > 0
    && element.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true });
}

function tabbable(element: HTMLElement): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>(focusable)]
    .filter((item) => item.tabIndex >= 0 && visible(item))
    .sort((left, right) => (left.tabIndex || Infinity) - (right.tabIndex || Infinity));
}

/**
 * Give only the top modal Escape and Tab ownership and restore the invoking control.
 * Owned menus and previews stay interactive while the remaining page is inert.
 * Mark the initial-focus control with data-modal-autofocus instead of React autoFocus.
 */
export function useModalLayer(dialog: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!open || element === null) return;
    const document = element.ownerDocument;
    const composition = observeComposition(document);
    const previous = document.activeElement;
    const stack = layers.get(document) ?? [];
    layers.set(document, stack);
    const layer = { element, close: () => { close.current(); } };
    stack.push(layer);
    const background = isolation.get(document) ?? isolateBackground(document);
    isolation.set(document, background);
    background.update();
    const initial = [...element.querySelectorAll<HTMLElement>('[data-modal-autofocus]')].find(visible)
      ?? tabbable(element)[0] ?? element;
    if (!element.contains(document.activeElement)) focusWithoutRing(initial, { preventScroll: true });
    let lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : initial;
    const focusin = (event: FocusEvent): void => {
      if (stack.at(-1) !== layer || !(event.target instanceof HTMLElement)) return;
      if (regions(document, element).some((region) => region.contains(event.target as Node))) {
        lastFocused = event.target;
      } else {
        const target = lastFocused.isConnected && visible(lastFocused) ? lastFocused : tabbable(element)[0] ?? element;
        focusWithoutRing(target, { preventScroll: true });
      }
    };
    const keydown = (event: KeyboardEvent): void => {
      if (
        stack.at(-1) !== layer || event.defaultPrevented || composition.guards(event)
        || event.ctrlKey || event.altKey || event.metaKey
      ) return;
      if (event.key === 'Escape' && !event.shiftKey) {
        event.preventDefault();
        if (!event.repeat) close.current();
      }
      if (event.key !== 'Tab') return;
      // A menu's own listener handles Tab from its anchor or its portaled rows.
      if (document.activeElement?.closest('[role="menu"]')) return;
      for (const portal of portals.get(document) ?? []) {
        if (portal.element.matches('[role="menu"]') && visible(portal.element)
          && portal.anchor.current?.contains(document.activeElement)) return;
      }
      const items = regions(document, element).flatMap(tabbable);
      const first = items[0] ?? element;
      const last = items.at(-1) ?? element;
      const active = document.activeElement;
      const atEdge = event.shiftKey ? active === first : active === last;
      if (active === element || !items.includes(active as HTMLElement) || atEdge) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('focusin', focusin);
    document.addEventListener('keydown', keydown);
    return () => {
      composition.dispose();
      const wasTop = stack.at(-1) === layer;
      stack.splice(stack.indexOf(layer), 1);
      document.removeEventListener('focusin', focusin);
      document.removeEventListener('keydown', keydown);
      if (stack.length === 0) {
        layers.delete(document);
        background.restore();
        isolation.delete(document);
      } else background.update();
      if (wasTop) {
        const target = previous instanceof HTMLElement && previous.isConnected && visible(previous)
          ? previous : stack.at(-1)?.element;
        if (target !== undefined) focusWithoutRing(target, { preventScroll: true });
      }
    };
  }, [dialog, open]);
}
