/**
 * Keep a fixed-position floating element anchored to a trigger.
 *
 * A portaled panel is positioned from its anchor's viewport rect, which stops
 * being true the moment anything scrolls or the window resizes. This owns that
 * one concern: measure the anchor, offset the panel below or above it, clamp
 * the result inside the viewport, and re-run on scroll (capture phase, so
 * scrollers nested inside the page are caught too), on resize, and on the
 * panel's own size changes while the element is open.
 */

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import { overlayTopMargin } from './overlay-top-margin';

/** Inputs for {@link useAnchoredPosition}. */
export interface AnchoredPositionOptions {
  /** Whether the floating element is mounted and should track its anchor. */
  open: boolean;
  /** The element the panel is placed from. */
  anchorRef: RefObject<HTMLElement | null>;
  /** The floating element, measured so the clamp uses real dimensions. */
  panelRef: RefObject<HTMLElement | null>;
  /** Which anchor edge the panel hangs from: below it (`bottom`, the default) or above it (`top`). */
  side?: 'top' | 'bottom';
  /** Which anchor edge the panel lines up with: its left edge (`start`, the default) or its right edge (`end`). */
  align?: 'start' | 'end';
  /** Distance kept between the anchor edge named by `side` and the panel. */
  gap: number;
  /** Distance kept between the panel and each viewport edge; the frame's overlay inset widens the top margin. */
  margin: number;
}

/**
 * Track an anchor and return the panel's fixed coordinates.
 * @param options - the open state, the two refs, the placement side and alignment, and the gap/margin distances.
 * @returns `left`/`top` for the panel, or `null` before the first measurement.
 */
export function useAnchoredPosition(options: AnchoredPositionOptions): CSSProperties | null {
  const { open, anchorRef, panelRef, side = 'bottom', align = 'start', gap, margin } = options;
  const [position, setPosition] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (rect === undefined) return;
      const panel = panelRef.current;
      const width = panel?.offsetWidth ?? 0;
      const height = panel?.offsetHeight ?? 0;
      let left = align === 'end' ? rect.right - width : rect.left;
      let top = side === 'top' ? rect.top - gap - height : rect.bottom + gap;
      if (width > 0) left = Math.min(Math.max(left, margin), window.innerWidth - width - margin);
      if (height > 0) top = Math.min(Math.max(top, overlayTopMargin(margin)), window.innerHeight - height - margin);
      setPosition({ left, top });
    };
    // The first run measures the panel in the same commit that opened it, so
    // the clamp uses real dimensions before anything paints.
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    // The panel's own height changes without either event — a status line
    // appearing inside it, or a `resize: vertical` textarea dragged taller.
    const panel = panelRef.current;
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && panel !== null) {
      observer = new ResizeObserver(place);
      observer.observe(panel);
    }
    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchorRef, panelRef, side, align, gap, margin]);
  return position;
}
