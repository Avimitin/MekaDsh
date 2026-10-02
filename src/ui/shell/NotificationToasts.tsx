/**
 * Completion toasts (mekaweb's toasts.tsx logic): bridges the notifications
 * core's in-app completion events into the primitives toast store. The core
 * already respects settings.inAppNotifications before publishing a toast and
 * owns the browser-notification and sound paths; this component only renders,
 * dismisses each core toast on mekaweb's six-second cadence so the core list
 * stays bounded, and keeps the polite announcement for screen readers.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useRuntime } from '../../connections/context';
import { toast } from '../primitives/toast-store';

/** How long a completion toast stays up; matches mekaweb's auto-dismiss. */
const TOAST_DURATION_MS = 6000;

export function NotificationToasts() {
  const { notifications } = useRuntime();
  const { toasts, announcement } = useSyncExternalStore(
    notifications.subscribe,
    notifications.getSnapshot,
  );
  // Bridge each core toast exactly once; the primitives viewport owns the
  // rendered lifetime, the core's own dismiss follows on the same cadence.
  const bridged = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = bridged.current;
    for (const item of toasts) {
      if (timers.has(item.id)) continue;
      timers.set(
        item.id,
        setTimeout(() => {
          timers.delete(item.id);
          notifications.dismiss(item.id);
        }, TOAST_DURATION_MS),
      );
      toast(`${item.outcome === 'failed' ? 'Turn failed' : 'Response ready'}: ${item.title}`, {
        duration: TOAST_DURATION_MS,
      });
    }
  }, [notifications, toasts]);
  useEffect(() => {
    const timers = bridged.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {announcement && (
        <span key={announcement.id}>
          {announcement.outcome === 'failed' ? 'Turn failed' : 'Response ready'}.{' '}
          {announcement.title}
        </span>
      )}
    </div>
  );
}
