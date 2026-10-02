import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { ComposerOptions } from '../../session/controller';
import { useSettings } from '../../connections/context';
import { useSessionNavigation } from '../../features/session-navigation';
import { shortcutAttribute, shortcutHint } from '../../lib/shortcut-keys';
import { cn } from '../../lib/cn';
import { Tag } from '../primitives/Tag';
import {
  IconCloseOutlineRegular,
  IconPaperclipOutlineMedium,
  IconSendOutlineMedium,
  IconSkillOutlineRegular,
  IconStopFillMedium,
  IconWarningOutlineRegular,
} from '../icons';
import { fileImage, imageAccept, imageFiles, pastedFiles } from './image-input';
import { useComposerKeymap } from './keymap';
import { observeControlRow } from './control-row-layout';
import { isSafariBrowser, repairSafariTextareaLayout } from './safari';
import css from './Composer.module.css';

export type ComposerActionKind = 'send' | 'queue' | 'steer' | 'interrupt' | 'stop';

/** 14 lines of 24px plus the pads: the draft's internal-scroll cap. */
const MAX_INPUT_HEIGHT = 344;

function ImageChip({
  image,
  disabled,
  onRemove,
}: {
  image: ComposerOptions['images'][number];
  disabled: boolean;
  onRemove: () => void;
}) {
  const [error, setError] = useState(false);
  return (
    <span className={css.chip} title={image.name} {...(error ? { 'data-error': '' } : {})}>
      {error ? (
        <span className={css.chipError} role="img" aria-label={`${image.name} (preview unavailable)`}>
          <IconWarningOutlineRegular size={16} />
        </span>
      ) : (
        <img
          className={css.thumb}
          src={`data:${image.media_type};base64,${image.data}`}
          alt={image.name}
          onError={() => setError(true)}
        />
      )}
      <button
        type="button"
        className={css.chipRemove}
        aria-label={`Remove ${image.name}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <IconCloseOutlineRegular size={10} />
      </button>
    </span>
  );
}

/**
 * The dsh capsule: one rounded card holding the chips row, the auto-growing
 * plain textarea (2 rows, capped at 14 lines, then internal scroll), and the
 * control row. All session wiring arrives as props; this component owns the
 * text surface, the keymap, attachment intake (button, paste, drop), and the
 * send/stop button.
 */
export function InputBar({
  text,
  onTextChange,
  readOnly,
  pending = false,
  placeholder,
  focusId,
  autoFocus = false,
  images,
  imagesDisabled,
  onImagesChange,
  skill,
  onClearSkill,
  showAttachments,
  cyclePermission,
  permissionLabel,
  profileLabel,
  action,
  leading,
  pills,
  settings,
  onError,
}: {
  text: string;
  onTextChange: (value: string) => void;
  readOnly: boolean;
  /** Blocks edits while keeping focus, so a failed submission can be corrected in place. */
  pending?: boolean;
  placeholder: string;
  focusId: string;
  autoFocus?: boolean;
  images: ComposerOptions['images'];
  imagesDisabled: boolean;
  onImagesChange: (
    update: (images: ComposerOptions['images']) => ComposerOptions['images'],
  ) => void;
  skill: string;
  onClearSkill: () => void;
  /** Vision gating: attachment controls render only when the profile accepts images. */
  showAttachments: boolean;
  cyclePermission: { enabled: boolean; disabled: boolean; cycle: () => void };
  permissionLabel?: string | undefined;
  profileLabel?: string | undefined;
  action: {
    kind: ComposerActionKind;
    label: string;
    disabled: boolean;
    busy: boolean;
    /** Shows the creation spinner in place of the glyph. */
    spinner?: boolean;
    run: () => void;
  };
  /** The "+" skills menu seat. */
  leading: ReactNode;
  /** Permission and profile pills. */
  pills: ReactNode;
  /** The settings gear seat. */
  settings: ReactNode;
  onError: (error: unknown) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { composerFocusRef } = useSessionNavigation();
  const fontSize = useSettings().conversationFontSize;

  useLayoutEffect(() => {
    if (
      composerFocusRef.current !== focusId ||
      !input.current ||
      input.current.disabled ||
      !input.current.getClientRects().length
    )
      return;
    composerFocusRef.current = null;
    input.current.focus({ preventScroll: true });
  });
  useEffect(() => {
    const el = input.current;
    if (autoFocus && el && !el.disabled) el.focus({ preventScroll: true });
  }, [autoFocus]);

  // Auto-grow: collapse to measure, so deleted lines shrink the input as well.
  // Below the cap the box is sized to its text (a sub-pixel remainder never
  // shows a scrollbar); at the cap overflow-y flips to an internal scroll.
  const measure = (): void => {
    const el = input.current;
    if (!el) return;
    const { scrollTop } = el;
    el.style.overflowY = 'hidden';
    el.style.height = '0px';
    const needed = el.scrollHeight;
    el.style.height = `${String(Math.min(MAX_INPUT_HEIGHT, needed))}px`;
    if (needed > MAX_INPUT_HEIGHT) el.style.overflowY = 'auto';
    el.scrollTop = scrollTop;
    if (isSafariBrowser(navigator)) repairSafariTextareaLayout(el);
  };
  const measureRef = useRef(measure);
  measureRef.current = measure;
  useLayoutEffect(() => {
    measureRef.current();
  }, [text, fontSize]);
  useEffect(() => {
    const node = card.current;
    if (!node) return;
    // A width change rewraps the text, which can change the needed height.
    const observer = new ResizeObserver(() => measureRef.current());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const node = row.current;
    if (node === null) return;
    return observeControlRow(node);
  }, []);

  const [attachBusy, setAttachBusy] = useState(false);
  const canAttach = showAttachments && !readOnly && !imagesDisabled && !attachBusy;
  async function attach(files: File[]) {
    // A drag can offer files and deliver none.
    if (!files.length || attachBusy) return;
    setAttachBusy(true);
    try {
      // The batch is refused as a whole before any of it enters the chips row.
      const added = await Promise.all(imageFiles(files).map(fileImage));
      onImagesChange((current) => [...current, ...added]);
    } catch (error) {
      onError(error);
    } finally {
      setAttachBusy(false);
    }
  }

  const [dropping, setDropping] = useState(false);
  function dragFiles(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    if (event.type === 'drop') {
      setDropping(false);
      if (canAttach) void attach(Array.from(event.dataTransfer.files));
    } else {
      event.dataTransfer.dropEffect = canAttach ? 'copy' : 'none';
      setDropping(canAttach);
    }
  }
  useEffect(() => {
    function guard(event: globalThis.DragEvent) {
      // A file dropped where nothing takes it would open in place of the app.
      if (event.defaultPrevented || !event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'none';
    }
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
    };
  }, []);

  const stop = action.kind === 'stop';
  const blocked = action.disabled || (!stop && attachBusy);
  const keymap = useComposerKeymap({
    canSubmit: () => !blocked && !stop,
    submit: () => action.run(),
    canCyclePermission: () => cyclePermission.enabled,
    permissionDisabled: () => cyclePermission.disabled,
    cyclePermission: () => cyclePermission.cycle(),
  });

  // Button presses steal focus from the textarea; suppress at mousedown so
  // typing continues seamlessly.
  const keepFocus = (event: MouseEvent<HTMLButtonElement>): void => {
    if (document.activeElement === input.current) event.preventDefault();
  };

  return (
    <div
      ref={card}
      className={css.card}
      data-composer-card
      {...(dropping ? { 'data-dropping': '' } : {})}
      onDragEnter={dragFiles}
      onDragOver={dragFiles}
      onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node && card.current?.contains(event.relatedTarget)))
          setDropping(false);
      }}
      onDrop={dragFiles}
    >
      {!readOnly && permissionLabel && (
        <span className="sr-only" role="status">
          Permission mode: {permissionLabel}
        </span>
      )}
      {!readOnly && profileLabel && (
        <span className="sr-only" role="status">
          Profile: {profileLabel}
        </span>
      )}
      {(images.length > 0 || skill) && (
        <div className={css.chips}>
          {skill && (
            <Tag tone="info">
              <span className={css.tagContent}>
                <IconSkillOutlineRegular size={12} />
                {skill}
                <button
                  type="button"
                  className={css.tagClear}
                  aria-label={`Clear skill ${skill}`}
                  onClick={onClearSkill}
                >
                  <IconCloseOutlineRegular size={10} />
                </button>
              </span>
            </Tag>
          )}
          {images.map((image, index) => (
            <ImageChip
              key={`${image.name}:${String(index)}`}
              image={image}
              disabled={imagesDisabled}
              onRemove={() => onImagesChange((current) => current.filter((item) => item !== image))}
            />
          ))}
        </div>
      )}
      <textarea
        ref={input}
        className={css.input}
        aria-label="Message"
        aria-keyshortcuts={cyclePermission.enabled ? 'Shift+Tab' : undefined}
        placeholder={placeholder}
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={keymap.onKeyDown}
        onCompositionStart={keymap.onCompositionStart}
        onCompositionEnd={keymap.onCompositionEnd}
        onPaste={(event) => {
          const files = pastedFiles(event.clipboardData);
          if (!files || !canAttach) return;
          event.preventDefault();
          void attach(files);
        }}
        rows={2}
        disabled={readOnly}
        readOnly={pending}
        aria-busy={pending || undefined}
      />
      <div ref={row} className={css.row} role="group" aria-label="Message controls">
        <div className={css.tools}>
          {leading}
          {showAttachments && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept={imageAccept}
                aria-label="Image files"
                tabIndex={-1}
                multiple
                hidden
                disabled={!canAttach}
                onChange={(event) => {
                  void attach(Array.from(event.target.files ?? []));
                  // Reset so picking the same file again re-fires the change event.
                  event.target.value = '';
                }}
              />
              <button
                type="button"
                className={css.iconButton}
                aria-label="Attach images"
                title="Attach images (idle sessions only)"
                disabled={!canAttach}
                onMouseDown={keepFocus}
                onClick={() => fileInput.current?.click()}
              >
                <IconPaperclipOutlineMedium size={16} />
              </button>
            </>
          )}
          {pills}
        </div>
        <div className={css.trailing}>
          {settings}
          <button
            type="button"
            className={cn(css.primary, stop && css.primaryStop)}
            aria-label={action.label}
            title={
              stop
                ? action.busy
                  ? 'Stopping turn…'
                  : `${action.label} (${shortcutHint('stopTurn')})`
                : action.label
            }
            aria-keyshortcuts={stop ? shortcutAttribute('stopTurn') : undefined}
            aria-busy={action.busy || undefined}
            disabled={blocked}
            onMouseDown={keepFocus}
            onClick={action.run}
          >
            {action.spinner ? (
              <span className={css.spinner} aria-hidden="true" />
            ) : stop ? (
              <IconStopFillMedium size={16} />
            ) : (
              <IconSendOutlineMedium size={16} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
