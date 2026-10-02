import { useSyncExternalStore } from 'react';

/** Follow viewport changes without overwriting the user's desktop layout preferences. */
export function useNarrowViewport(maxWidth = 767): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', notify);
      return () => media.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
