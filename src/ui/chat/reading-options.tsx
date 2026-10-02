import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  CONVERSATION_FONT,
  CONVERSATION_OFFSET,
  CONVERSATION_WIDTH,
  normalizeConversationOffset,
  type ConversationAppearance,
} from '../../connections/storage';
import { useRuntime, useSettings } from '../../connections/context';
import { Button } from '../primitives/Button';
import { MenuSurface } from '../primitives/MenuSurface';
import { useDismissOnOutsidePointer } from '../primitives/useDismissOnOutsidePointer';
import { IconCloseOutlineRegular, IconSlidersTwoOutlineRegular } from '../icons';
import css from './reading-options.module.css';

export type ReadingOptions = ConversationAppearance;
export type ReadingState = {
  options: ReadingOptions;
  adjusted: boolean;
  change: (options: Partial<ReadingOptions> | null) => void;
  saveDefaults: (options: ReadingOptions) => void;
  pane: RefObject<HTMLElement | null>;
  /** Keeps the center guide on screen while the offset slider is held. */
  holdGuide: (holding: boolean) => void;
};
export const ReadingContext = createContext<ReadingState | null>(null);

type ReadingPosition = {
  scroller: HTMLElement;
  atStart: boolean;
  following: boolean;
  anchor: Element | null;
  fraction: number;
  screenY: number;
};

function readingPosition(pane: HTMLElement | null): ReadingPosition | undefined {
  const scroller = pane?.querySelector<HTMLElement>('[data-conversation-scroll]');
  const column = pane?.querySelector<HTMLElement>('[data-conversation-column]');
  const dock = pane?.querySelector<HTMLElement>('[data-composer-seat]');
  if (!scroller || !column || !dock) return;
  const bounds = column.getBoundingClientRect();
  const screenY = (scroller.getBoundingClientRect().top + dock.getBoundingClientRect().top) / 2;
  // The popover may cover this point in a short viewport; anchor the content beneath it.
  const anchor =
    document
      .elementsFromPoint((bounds.left + bounds.right) / 2, screenY)
      .find((hit) => column.contains(hit)) ?? null;
  const rect = anchor?.getBoundingClientRect();
  return {
    scroller,
    atStart: scroller.scrollTop === 0,
    following: scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120,
    anchor,
    fraction: rect?.height ? (screenY - rect.top) / rect.height : 0,
    screenY,
  };
}

/** The pane's reading column (the conversation's); offset geometry measures it after CSS applies. */
function readingColumn(pane: HTMLElement | null) {
  return pane?.querySelector<HTMLElement>('[data-conversation-column]') ?? null;
}

/**
 * Center-column reading surface: per-pane temporary reading overrides over the saved
 * appearance settings, publishing width/anchor/offset/font as CSS variables.
 */
export function ReadingPane({ children }: { children: ReactNode }) {
  const { storage } = useRuntime();
  const settings = useSettings();
  const saved = useMemo<ReadingOptions>(
    () => ({
      fontSize: settings.conversationFontSize,
      maxWidth: settings.conversationMaxWidth,
      anchor: settings.conversationAnchor,
      offset: settings.conversationOffset,
    }),
    [
      settings.conversationFontSize,
      settings.conversationMaxWidth,
      settings.conversationAnchor,
      settings.conversationOffset,
    ],
  );
  const [overrides, setOverrides] = useState<Partial<ReadingOptions>>({});
  const options = useMemo(() => ({ ...saved, ...overrides }), [saved, overrides]);
  const pane = useRef<HTMLElement>(null);
  const position = useRef<ReadingPosition | undefined>(undefined);
  // The center guide shows while the slider is held and briefly after the position changes.
  const [holding, setHolding] = useState(false);
  const [lingering, setLingering] = useState(false);
  const lingerTimer = useRef<number>(undefined);
  const flashGuide = useCallback(() => {
    setLingering(true);
    window.clearTimeout(lingerTimer.current);
    lingerTimer.current = window.setTimeout(() => setLingering(false), GUIDE_LINGER);
  }, []);
  useEffect(() => () => window.clearTimeout(lingerTimer.current), []);
  const holdGuide = useCallback(
    (hold: boolean) => {
      setHolding(hold);
      if (!hold) flashGuide();
    },
    [flashGuide],
  );
  const change = useCallback(
    (next: Partial<ReadingOptions> | null) => {
      if (next && ('offset' in next || 'anchor' in next)) flashGuide();
      // Only size changes rewrap the text; moving the column keeps every line where it was.
      if (!next || 'fontSize' in next || 'maxWidth' in next)
        position.current = readingPosition(pane.current);
      setOverrides((current) => {
        if (!next) return {};
        const updated: Partial<ReadingOptions> = { ...current, ...next };
        for (const key of Object.keys(updated) as (keyof ReadingOptions)[])
          if (updated[key] === saved[key]) delete updated[key];
        return updated;
      });
    },
    [saved, flashGuide],
  );
  useLayoutEffect(() => {
    const restore = position.current;
    position.current = undefined;
    if (!restore) return;
    const { scroller, atStart, following, anchor, fraction, screenY } = restore;
    if (following) scroller.scrollTop = scroller.scrollHeight;
    else if (atStart) scroller.scrollTop = 0;
    else if (anchor?.isConnected) {
      const rect = anchor.getBoundingClientRect();
      scroller.scrollTop += rect.top + rect.height * fraction - screenY;
    }
  }, [options]);
  const adjusted = Object.keys(overrides).length > 0;
  const saveDefaults = useCallback(
    (next: ReadingOptions) => {
      position.current = readingPosition(pane.current);
      storage.conversationAppearance(next);
      setOverrides({});
    },
    [storage],
  );
  const value = useMemo(
    () => ({ options, adjusted, change, saveDefaults, pane, holdGuide }),
    [options, adjusted, change, saveDefaults, holdGuide],
  );
  // Anchor 'page' centers on the window's middle, expressed in the pane's own coordinates.
  const [pageCenter, setPageCenter] = useState<string>();
  useEffect(() => {
    const node = pane.current;
    if (!node || options.anchor !== 'page') {
      setPageCenter(undefined);
      return;
    }
    const measure = () =>
      setPageCenter(`${Math.round(window.innerWidth / 2 - node.getBoundingClientRect().left)}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [options.anchor]);
  return (
    <ReadingContext.Provider value={value}>
      <section
        ref={pane}
        className={css.pane}
        data-anchor={options.anchor}
        style={
          {
            '--dsh-conversation-max-width':
              options.maxWidth === 'full' ? '100%' : `${options.maxWidth}px`,
            '--dsh-conversation-offset': `${options.offset}px`,
            '--dsh-content-font-size': `${options.fontSize}px`,
            '--dsh-content-font-delta': `${options.fontSize - 14}px`,
            ...(pageCenter ? { '--dsh-conversation-center': pageCenter } : {}),
          } as CSSProperties
        }
      >
        {children}
        <CenterGuide pane={pane} options={options} visible={holding || lingering} />
      </section>
    </ReadingContext.Provider>
  );
}

const GUIDE_LINGER = 1200;

/**
 * A vertical line through the reading column's center, across the visible conversation. It is
 * placed from the column itself, after CSS has applied the anchor, offset, and limits.
 */
function CenterGuide({
  pane,
  options,
  visible,
}: {
  pane: RefObject<HTMLElement | null>;
  options: ReadingOptions;
  visible: boolean;
}) {
  const line = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = pane.current;
    if (!visible || !node) return;
    const place = () => {
      const column = readingColumn(node);
      const scroller = node.querySelector<HTMLElement>('[data-conversation-scroll]');
      if (!column || !scroller || !line.current) return;
      const bounds = node.getBoundingClientRect();
      const box = column.getBoundingClientRect();
      const area = scroller.getBoundingClientRect();
      line.current.style.left = `${box.left + box.width / 2 - bounds.left}px`;
      line.current.style.top = `${area.top - bounds.top}px`;
      line.current.style.height = `${area.height}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(node);
    const column = readingColumn(node);
    if (column) observer.observe(column);
    return () => observer.disconnect();
  }, [pane, options, visible]);
  return (
    <div ref={line} className={css.centerGuide} data-visible={visible || undefined} aria-hidden />
  );
}

type OffsetRange = { min: number; max: number };

/**
 * The offsets that put the reading column against either edge of the conversation area, measured
 * the way the stylesheet places it. They change with the window, panels, and column width.
 */
function offsetRange(pane: HTMLElement | null, anchor: ReadingOptions['anchor']) {
  const column = readingColumn(pane);
  const area = column?.parentElement;
  if (!column || !area) return;
  const style = getComputedStyle(area);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const width = area.clientWidth - paddingLeft - (parseFloat(style.paddingRight) || 0);
  const left = area.getBoundingClientRect().left + area.clientLeft + paddingLeft;
  const center = anchor === 'area' ? width / 2 : window.innerWidth / 2 - left;
  const half = column.getBoundingClientRect().width / 2;
  const min = Math.ceil(half - center);
  return { min, max: Math.max(min, Math.floor(width - half - center)) };
}

function useOffsetRange(
  pane: RefObject<HTMLElement | null>,
  anchor: ReadingOptions['anchor'],
  maxWidth: ReadingOptions['maxWidth'],
) {
  const [range, setRange] = useState<OffsetRange>();
  useEffect(() => {
    const node = pane.current;
    const measure = () =>
      setRange((current) => {
        const next = offsetRange(node, anchor);
        return current?.min === next?.min && current?.max === next?.max ? current : next;
      });
    measure();
    if (!node) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const column of node.querySelectorAll('[data-conversation-column]'))
      observer.observe(column);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [pane, anchor, maxWidth]);
  return range;
}

/** Signed pixels with a true minus sign. */
function formatOffset(offset: number) {
  return `${offset < 0 ? '−' : ''}${Math.abs(offset)} px`;
}

function describeOffset(offset: number) {
  if (offset === 0) return 'Centered';
  return `${Math.abs(offset)} pixels ${offset < 0 ? 'left' : 'right'}`;
}

export function ReadingOptionsControl() {
  const value = useContext(ReadingContext);
  const root = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  useDismissOnOutsidePointer(root, open, setOpen);
  if (!value) throw new Error('Reading options require a ReadingPane.');
  return (
    <span ref={root} className={css.control}>
      <Button
        className={css.trigger}
        variant="ghost"
        size="sm"
        aria-label="Reading options"
        title="Reading options"
        aria-expanded={open}
        data-adjusted={value.adjusted || undefined}
        onClick={() => setOpen((shown) => !shown)}
      >
        <IconSlidersTwoOutlineRegular size={16} />
      </Button>
      {open && (
        <MenuSurface className={css.popover} role="dialog" aria-label="Reading options">
          <ReadingOptionsForm value={value} close={() => setOpen(false)} />
        </MenuSurface>
      )}
    </span>
  );
}

function ReadingOptionsForm({ value, close }: { value: ReadingState; close: () => void }) {
  const id = useId();
  const [edited, setEdited] = useState(false);
  const [generation, setGeneration] = useState(0);
  const { options, adjusted, change, saveDefaults, pane, holdGuide } = value;
  const range = useOffsetRange(pane, options.anchor, options.maxWidth);
  const movable = range !== undefined && range.max > range.min;
  const shown = range ? Math.max(range.min, Math.min(range.max, options.offset)) : options.offset;
  // Dragging near center settles on it, so returning to 0 needs no precision. Keys step exactly,
  // since a snap would pull a single step from 0 straight back.
  const snap = range ? Math.max(3, (range.max - range.min) * 0.02) : 0;
  const dragging = useRef(false);
  return (
    <form
      className={css.form}
      onChange={() => setEdited(true)}
      onSubmit={(event) => {
        event.preventDefault();
        if (!event.currentTarget.reportValidity()) return;
        const data = new FormData(event.currentTarget);
        saveDefaults({
          fontSize: Number(data.get('fontSize')),
          maxWidth: data.get('maxWidth') === '' ? 'full' : Number(data.get('maxWidth')),
          anchor: options.anchor,
          offset: normalizeConversationOffset(Number(data.get('offset'))),
        });
        setEdited(false);
        setGeneration((current) => current + 1);
      }}
    >
      <div className={css.section} role="group" aria-labelledby={id + '-size'}>
        <h3 id={id + '-size'}>Size</h3>
        <div className={css.row}>
          <label htmlFor={id + '-font'}>Font size</label>
          <PixelInput
            key={`font-${generation}`}
            id={id + '-font'}
            name="fontSize"
            label="Font size"
            value={options.fontSize}
            step={CONVERSATION_FONT.step}
            onCommit={(fontSize) => {
              if (typeof fontSize === 'number') change({ fontSize });
            }}
          />
        </div>
        <div className={css.row}>
          <label htmlFor={id + '-width'}>Max width</label>
          <PixelInput
            key={`width-${generation}`}
            id={id + '-width'}
            name="maxWidth"
            label="Max width"
            value={options.maxWidth}
            step={CONVERSATION_WIDTH.step}
            fullWidthFallback={CONVERSATION_WIDTH.default}
            onCommit={(maxWidth) => change({ maxWidth })}
          />
        </div>
      </div>
      <div className={css.section} role="group" aria-labelledby={id + '-position'}>
        <h3 id={id + '-position'}>Position</h3>
        <div className={css.row} role="radiogroup" aria-labelledby={id + '-anchor'}>
          <span id={id + '-anchor'}>Center on</span>
          <div className={css.segmented}>
            {(
              [
                ['page', 'Page', 'Center on the middle of the page; panels do not move it'],
                ['area', 'Area', 'Center between the panels'],
              ] as const
            ).map(([anchor, label, title]) => (
              <label key={anchor} title={title}>
                <input
                  type="radio"
                  name="anchor"
                  value={anchor}
                  checked={options.anchor === anchor}
                  onChange={() => change({ anchor })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className={css.row}>
          <label htmlFor={id + '-offset'}>Offset</label>
          <PixelInput
            key={`offset-${generation}`}
            id={id + '-offset'}
            name="offset"
            label="Offset"
            value={options.offset}
            step={CONVERSATION_OFFSET.step}
            min={-CONVERSATION_OFFSET.limit}
            hint="Pixels to move the conversation; negative moves it left. Press Enter to apply."
            onCommit={(offset) => {
              if (typeof offset === 'number') change({ offset: normalizeConversationOffset(offset) });
            }}
          />
        </div>
        <div className={css.offset}>
          <div
            className={css.offsetTrack}
            style={
              movable && range.min <= 0 && range.max >= 0
                ? ({ '--zero': -range.min / (range.max - range.min) } as CSSProperties)
                : undefined
            }
          >
            <input
              type="range"
              aria-label="Offset slider"
              aria-valuetext={describeOffset(shown)}
              title="Drag to the notch to remove the offset"
              min={range?.min ?? 0}
              max={range?.max ?? 0}
              step={1}
              value={shown}
              disabled={!movable}
              onPointerDown={() => {
                dragging.current = true;
                holdGuide(true);
                // The release can land outside the slider.
                const end = () => {
                  dragging.current = false;
                  holdGuide(false);
                  window.removeEventListener('pointerup', end);
                  window.removeEventListener('pointercancel', end);
                };
                window.addEventListener('pointerup', end);
                window.addEventListener('pointercancel', end);
              }}
              onChange={(event) => {
                const next = Number(event.target.value);
                change({ offset: dragging.current && Math.abs(next) <= snap ? 0 : next });
              }}
            />
          </div>
          {!movable ? (
            <p>No room to move the conversation at this width.</p>
          ) : (
            options.offset !== 0 &&
            shown !== options.offset && <p>Limited to {formatOffset(shown)} at this width.</p>
          )}
        </div>
      </div>
      <div className={css.footer}>
        <Button
          variant="ghost"
          disabled={!adjusted && !edited}
          onClick={() => {
            change(null);
            setEdited(false);
            setGeneration((current) => current + 1);
          }}
          title="Restore saved appearance settings"
        >
          Reset
        </Button>
        <Button
          variant="outline"
          type="submit"
          disabled={!adjusted && !edited}
          title="Save these reading options in Settings, Appearance"
        >
          Save
        </Button>
        <Button variant="ghost" aria-label="Close reading options" onClick={close}>
          <IconCloseOutlineRegular size={14} />
        </Button>
      </div>
    </form>
  );
}

/** A draft number field: Enter commits; the step buttons commit immediately. */
function PixelInput({
  id,
  name,
  label,
  value,
  step,
  min = 1,
  hint,
  fullWidthFallback,
  onCommit,
}: {
  id?: string | undefined;
  name?: string;
  label: string;
  value: number | 'full';
  step: number;
  /** The lowest value; the default allows only sizes. */
  min?: number;
  /** Replaces the field's default tooltip. */
  hint?: string;
  fullWidthFallback?: number;
  onCommit: (value: number | 'full') => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<{ source: typeof value; text?: string }>({ source: value });
  // A replaced external value retires the old draft, even if that value returns later.
  if (draft.source !== value) setDraft({ source: value });
  const text =
    draft.source === value && draft.text !== undefined
      ? draft.text
      : value === 'full'
        ? ''
        : String(value);
  const full = fullWidthFallback !== undefined && text === '';
  const numeric = Number(text);

  function commit(delta = 0) {
    const node = input.current;
    if (!node?.reportValidity()) return;
    let next: number | 'full' = node.value === '' ? 'full' : node.valueAsNumber;
    if (delta) {
      next =
        next === 'full' ? (fullWidthFallback ?? min) : Math.max(min, Number((next + delta).toFixed(6)));
    }
    if (typeof next === 'number' && (!Number.isFinite(next) || next < min)) return;
    onCommit(next);
    setDraft({ source: value });
  }

  return (
    <div className={css.pixelInput}>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={!full && text !== '' && numeric <= min}
        onClick={() => commit(-step)}
      >
        −
      </Button>
      <div className={css.pixelField}>
        <input
          ref={input}
          id={id}
          name={name}
          type="number"
          inputMode="decimal"
          enterKeyHint="done"
          min={min}
          step="any"
          required={fullWidthFallback === undefined}
          aria-label={label}
          title={
            hint ??
            (fullWidthFallback === undefined
              ? 'Size in pixels. Press Enter to apply.'
              : 'Width in pixels. Leave blank for full width. Press Enter to apply.')
          }
          placeholder={fullWidthFallback === undefined ? undefined : 'Full'}
          value={text}
          onChange={(event) => setDraft({ source: value, text: event.target.value })}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey)
              return;
            if (event.key === 'Enter' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              if (event.key === 'ArrowUp' && full) return;
              commit(event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0);
            } else if (event.key === 'Escape') {
              setDraft({ source: value });
            }
          }}
        />
        {!full && <span aria-hidden="true">px</span>}
      </div>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={full}
        onClick={() => commit(step)}
      >
        +
      </Button>
    </div>
  );
}
