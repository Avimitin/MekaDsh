/**
 * Keyboard shortcuts reference (mekaweb's dialog content, dsh Modal): the
 * shortcut list from lib/shortcut-keys with keycap styling. The dialog carries
 * the global 'keyboard-shortcuts-dialog' class that use-shortcut's help-open
 * check reads, plus a data-state stamp for its overlay check. ShortcutsButton
 * opens it from anywhere by dispatching the window event the dialog listens
 * for, so the controlled open state stays owned by app.tsx.
 */
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import {
  appleKeyboard,
  shortcutAttribute,
  shortcutHint,
  shortcutKeys,
  shortcuts,
  type Shortcut,
} from '../../lib/shortcut-keys';
import { cn } from '../../lib/cn';
import { Modal } from '../primitives/Modal';
import { ShortcutKeys } from '../primitives/ShortcutKeys';
import { Tooltip } from '../primitives/Tooltip';
import { IconQuestionOutlineRegular } from '../icons';
import { useDialogState } from './use-dialog-state';
import css from './ShortcutsDialog.module.css';

/** Window event the ShortcutsButton dispatches and the dialog listens for. */
const OPEN_EVENT = 'mekadsh:open-shortcuts';

export function ShortcutsDialog({
  open,
  onOpenChange,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const apple = appleKeyboard();
  useDialogState('keyboard-shortcuts-dialog', open);
  useEffect(() => {
    const openDialog = () => onOpenChange(true);
    window.addEventListener(OPEN_EVENT, openDialog);
    return () => window.removeEventListener(OPEN_EVENT, openDialog);
  }, [onOpenChange]);
  // The modal layer restores focus on close; when it cannot (the invoking
  // control left the DOM), fall back to the element the app captured.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) {
      const active = document.activeElement;
      if (active === null || active === document.body) {
        const target = returnFocus.current;
        if (target?.isConnected && target.getClientRects().length)
          target.focus({ preventScroll: true });
      }
    }
    wasOpen.current = open;
  }, [open, returnFocus]);
  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Keyboard shortcuts"
      closeLabel="Close"
      className={cn(css.dialog, 'keyboard-shortcuts-dialog')}
    >
      <dl className={css.list}>
        {(Object.keys(shortcuts) as Shortcut[]).map((action) => (
          <div key={action} className={css.row}>
            <dt className={css.term}>{shortcuts[action].label}</dt>
            <dd className={css.keys} aria-label={shortcutHint(action)}>
              <ShortcutKeys keys={shortcutKeys(action, apple)} />
            </dd>
          </div>
        ))}
      </dl>
      <p className={css.note}>
        In the message box: Enter to send, Shift+Enter for a new line, Shift+Tab to cycle
        permissions.
      </p>
    </Modal>
  );
}

/** Sidebar footer button opening the shortcuts dialog; icon-only in the rail. */
export function ShortcutsButton({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Tooltip
      label="Keyboard shortcuts"
      shortcutKeys={shortcutKeys('showShortcuts', appleKeyboard())}
      delayMs={500}
      disabled={!collapsed}
    >
      <button
        type="button"
        className={cn(css.shortcutsButton, collapsed && css.collapsed)}
        aria-label="Keyboard shortcuts"
        aria-haspopup="dialog"
        aria-keyshortcuts={shortcutAttribute('showShortcuts')}
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT))}
      >
        <IconQuestionOutlineRegular size={collapsed ? 18 : 16} />
        {!collapsed && <span className={css.buttonLabel}>Shortcuts</span>}
      </button>
    </Tooltip>
  );
}
