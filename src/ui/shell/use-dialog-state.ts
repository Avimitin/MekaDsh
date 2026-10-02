import { useLayoutEffect } from 'react';

/**
 * Stamps data-state="open" on a mounted primitives Modal. dsh Modals emit no
 * data-state, but use-shortcut's overlay detection (`[role="dialog"][data-state="open"]`)
 * gates application shortcuts while a dialog is up, and the shortcuts dialog's
 * own open check reads the same attribute.
 */
export function useDialogState(className: string | undefined, open: boolean) {
  useLayoutEffect(() => {
    if (!open || !className) return;
    for (const dialog of document.querySelectorAll(`.${className}[role="dialog"]`))
      dialog.setAttribute('data-state', 'open');
  }, [className, open]);
}
