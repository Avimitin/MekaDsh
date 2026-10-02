/**
 * App-wide toast queue: a tiny external store behind {@link toast}, plus the
 * {@link ToastViewport} that renders the visible toasts portaled to
 * `document.body`, bottom-center above the composer. Toasts auto-dismiss after
 * six seconds (or the caller's duration), at most three are visible at once
 * (the rest queue in arrival order), and hovering the viewport pauses every
 * countdown so a reader can finish the message.
 */
import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import css from './ToastViewport.module.css';

/** Per-toast options accepted by {@link toast}. */
export interface ToastOptions {
  /** Auto-dismiss delay in ms; defaults to 6000. */
  duration?: number;
  /** Activation callback; the toast renders as a button and dismisses on press. */
  onClick?: () => void;
}

/** One queued or visible toast. */
export interface ToastRecord {
  readonly id: number;
  readonly message: string;
  readonly duration: number;
  /** Activation callback, when the toast was queued with one. */
  readonly onClick: (() => void) | undefined;
  /** In its leave fade; removal follows. */
  readonly leaving: boolean;
}

const DEFAULT_DURATION_MS = 6000;
const MAX_VISIBLE = 3;
/** Matches the viewport stylesheet's leaving fade. */
const LEAVE_MS = 300;

interface LiveToast extends ToastRecord {
  timer: ReturnType<typeof setTimeout> | null;
  /** Remaining ms when the countdown last paused or started. */
  remaining: number;
  /** Epoch ms the current countdown segment started. */
  startedAt: number;
  /** In its leave fade; the timer removes it when the fade ends. */
  leaving: boolean;
}

interface ToastSnapshot {
  readonly visible: readonly ToastRecord[];
}

let nextId = 1;
let live: LiveToast[] = [];
let queued: LiveToast[] = [];
let snapshot: ToastSnapshot = { visible: [] };
const listeners = new Set<() => void>();

function publish(): void {
  snapshot = {
    visible: live.map(({ id, message, duration, onClick, leaving }) => ({ id, message, duration, onClick, leaving })),
  };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ToastSnapshot {
  return snapshot;
}

function clearTimer(entry: LiveToast): void {
  if (entry.timer === null) return;
  clearTimeout(entry.timer);
  entry.timer = null;
}

/** Promote queued toasts into free visible slots, then republish. */
function promote(): void {
  while (live.length < MAX_VISIBLE && queued.length > 0) {
    const entry = queued.shift();
    if (entry === undefined) break;
    entry.startedAt = Date.now();
    entry.timer = setTimeout(() => {
      beginLeave(entry);
    }, entry.remaining);
    live.push(entry);
  }
  publish();
}

function beginLeave(entry: LiveToast): void {
  if (entry.leaving) return;
  clearTimer(entry);
  entry.leaving = true;
  entry.timer = setTimeout(() => {
    live = live.filter((item) => item !== entry);
    promote();
  }, LEAVE_MS);
  publish();
}

function remove(entry: LiveToast): void {
  clearTimer(entry);
  queued = queued.filter((item) => item !== entry);
  if (!live.includes(entry)) {
    publish();
    return;
  }
  live = live.filter((item) => item !== entry);
  promote();
}

/**
 * Show a toast. At most {@link MAX_VISIBLE} toasts are visible at once; the
 * rest queue in arrival order and promote as visible ones dismiss.
 * @param message - the banner text.
 * @param options - optional duration override in ms (default 6000).
 * @returns the toast id, for {@link dismissToast}.
 */
export function toast(message: string, options?: ToastOptions): number {
  const entry: LiveToast = {
    id: nextId++,
    message,
    duration: options?.duration ?? DEFAULT_DURATION_MS,
    onClick: options?.onClick,
    timer: null,
    remaining: options?.duration ?? DEFAULT_DURATION_MS,
    startedAt: 0,
    leaving: false,
  };
  queued.push(entry);
  promote();
  return entry.id;
}

/**
 * Dismiss a toast now, whether it is visible or still queued.
 * @param id - the id {@link toast} returned.
 */
export function dismissToast(id: number): void {
  const entry = [...live, ...queued].find((item) => item.id === id);
  if (entry !== undefined) remove(entry);
}

/**
 * Pause every visible toast's countdown while `paused` holds; resuming
 * restarts each countdown with its remaining time.
 * @param paused - whether the pointer rests on the viewport.
 */
function setPaused(paused: boolean): void {
  const now = Date.now();
  for (const entry of live) {
    if (entry.leaving) continue;
    if (paused) {
      if (entry.timer === null) continue;
      clearTimer(entry);
      entry.remaining = Math.max(0, entry.remaining - (now - entry.startedAt));
    } else if (entry.timer === null) {
      entry.startedAt = now;
      entry.timer = setTimeout(() => {
        beginLeave(entry);
      }, entry.remaining);
    }
  }
}

/**
 * Read the visible toasts; re-renders only when the visible set changes.
 * @returns the currently visible toast records.
 */
export function useVisibleToasts(): readonly ToastRecord[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).visible;
}

/**
 * Render the toast queue portaled to `document.body`, bottom-center above the
 * composer. Mount once near the app root.
 * @returns the viewport portal.
 */
export function ToastViewport() {
  const visible = useVisibleToasts();
  if (visible.length === 0) return null;
  return createPortal(
    <div
      className={css.viewport}
      role="region"
      aria-label="Notifications"
      onPointerEnter={() => {
        setPaused(true);
      }}
      onPointerLeave={() => {
        setPaused(false);
      }}
    >
      {visible.map((entry) => (
        entry.onClick === undefined
          ? (
            <div key={entry.id} className={css.item} role="alert" data-leaving={entry.leaving || undefined}>
              {entry.message}
            </div>
          )
          : (
            <button
              key={entry.id}
              type="button"
              className={css.itemAction}
              data-leaving={entry.leaving || undefined}
              onClick={() => {
                entry.onClick?.();
                dismissToast(entry.id);
              }}
            >
              {entry.message}
            </button>
          )
      ))}
    </div>,
    document.body,
  );
}
