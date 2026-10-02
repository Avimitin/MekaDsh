import { useEffect, useRef, useState, type RefObject } from 'react';

/** Per-session scroll memory, keyed by connection + session, surviving route revisits. */
const positions = new Map<string, { top: number; following: boolean }>();

/** Distance from the floor that still counts as following the tail. */
const FOLLOW_THRESHOLD = 120;
/** A user-message anchor this far below the viewport top still counts as the current turn. */
const TURN_THRESHOLD = 72;

function scrollBehavior(): 'auto' | 'smooth' {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';
}

export interface ChatScroll {
  scrollerRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  dockRef: RefObject<HTMLDivElement | null>;
  /** Whether the transcript has more content below the viewport (drives the seat's data flag). */
  contentBelow: boolean;
  /** Whether the floating jump-to-latest control is showing (the reader scrolled up). */
  showLatest: boolean;
  /** Return to the tail and resume following it. */
  jumpToLatest: () => void;
  /** Current user-message anchor index (0-based) and the total, for the TurnNavigator pill. */
  turn: { current: number; total: number };
  /** Scroll so user-message anchor `index` sits near the viewport top. */
  jumpToTurn: (index: number) => void;
  /** Stop following the tail without moving (opening a disclosure keeps its content in place). */
  unfollow: () => void;
  onScroll: () => void;
}

/**
 * dsh chat scroll policy over the conversation scrollport: follow the tail only while the reader
 * has not scrolled up, snap to the floor for the reader's own submission, remember each session's
 * position across revisits, and expose user-message anchors for turn navigation.
 */
export function useChatScroll({
  scrollKey,
  revision,
  snapKey,
}: {
  /** Stable identity of this scrollport (connection + session); position memory keys off it. */
  scrollKey: string;
  /** SessionState.revision: any committed content change follows the tail when still following. */
  revision: number;
  /** Key of the reader's own newest preview submission; a new one snaps to the floor. */
  snapKey: string | undefined;
}): ChatScroll {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const appliedSnap = useRef<string | undefined>(undefined);
  const [showLatest, setShowLatest] = useState(false);
  const [contentBelow, setContentBelow] = useState(false);
  const [turn, setTurn] = useState({ current: 0, total: 0 });

  const readTurns = () => {
    const node = scrollerRef.current;
    const content = contentRef.current;
    if (!node || !content) return;
    const anchors = content.querySelectorAll('[data-turn-anchor]');
    const total = anchors.length;
    if (total === 0) {
      setTurn((current) => (current.total === 0 ? current : { current: 0, total: 0 }));
      return;
    }
    const viewportTop = node.getBoundingClientRect().top;
    let current = 0;
    anchors.forEach((anchor, index) => {
      if (anchor.getBoundingClientRect().top - viewportTop <= TURN_THRESHOLD) current = index;
    });
    setTurn((previous) =>
      previous.current === current && previous.total === total
        ? previous
        : { current, total },
    );
  };

  const measure = () => {
    const node = scrollerRef.current;
    if (!node) return;
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    setContentBelow(remaining > 1);
    readTurns();
  };

  const onScroll = () => {
    const node = scrollerRef.current;
    if (!node) return;
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    following.current = remaining < FOLLOW_THRESHOLD;
    setShowLatest(!following.current);
    setContentBelow(remaining > 1);
    positions.set(scrollKey, { top: node.scrollTop, following: following.current });
    readTurns();
  };

  const jumpToLatest = () => {
    const node = scrollerRef.current;
    if (!node) return;
    following.current = true;
    node.scrollTo({ top: node.scrollHeight, behavior: scrollBehavior() });
    setShowLatest(false);
  };

  const jumpToTurn = (index: number) => {
    const node = scrollerRef.current;
    const anchor = contentRef.current?.querySelectorAll('[data-turn-anchor]')[index];
    if (!node || !(anchor instanceof HTMLElement)) return;
    const top =
      anchor.getBoundingClientRect().top - node.getBoundingClientRect().top + node.scrollTop - 12;
    following.current = false;
    node.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior() });
    setShowLatest(true);
  };

  // Session switch: restore the remembered position (or the tail) and remember on the way out.
  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    // The remembered tail is not the reader's fresh submission; never snap over it.
    appliedSnap.current = snapKey;
    const position = positions.get(scrollKey);
    following.current = position?.following ?? true;
    node.scrollTop = following.current ? node.scrollHeight : (position?.top ?? 0);
    setShowLatest(!following.current);
    return () => {
      positions.set(scrollKey, { top: node.scrollTop, following: following.current });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  // Committed content: keep the tail only while following, then re-measure the turn anchors.
  useEffect(() => {
    const node = scrollerRef.current;
    if (node && following.current) node.scrollTop = node.scrollHeight;
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  // The reader's own submission always snaps to the floor.
  useEffect(() => {
    if (!snapKey || appliedSnap.current === snapKey) return;
    appliedSnap.current = snapKey;
    const node = scrollerRef.current;
    if (!node) return;
    following.current = true;
    node.scrollTop = node.scrollHeight;
    setShowLatest(false);
  }, [snapKey]);

  // Composer seat and content size: publish the seat height and keep the tail while following.
  useEffect(() => {
    const node = scrollerRef.current;
    const body = contentRef.current;
    const footer = dockRef.current;
    if (!node || !body || !footer) return;
    const composer = footer.querySelector<HTMLElement>('[data-composer]');
    const observer = new ResizeObserver(() => {
      // Keep focused content above the sticky seat and match its optional inner scrollbar.
      node.style.setProperty('--dsh-composer-height', `${footer.offsetHeight}px`);
      node.style.setProperty(
        '--composer-scrollbar',
        `${composer ? composer.offsetWidth - composer.clientWidth : 0}px`,
      );
      node.style.setProperty('--dsh-conversation-viewport-height', `${node.clientHeight}px`);
      if (following.current) node.scrollTop = node.scrollHeight;
      measure();
    });
    observer.observe(body);
    observer.observe(footer);
    if (composer) observer.observe(composer);
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  return {
    scrollerRef,
    contentRef,
    dockRef,
    contentBelow,
    showLatest,
    jumpToLatest,
    turn,
    jumpToTurn,
    unfollow: () => {
      following.current = false;
    },
    onScroll,
  };
}
