import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  IconCloseOutlineRegular,
  IconDownloadOutlineRegular,
  IconFullscreenOutlineRegular,
  IconPlusOutlineRegular,
} from '../../icons/index';
import {
  fitMedia,
  MAX_MEDIA_ZOOM,
  pointerGesture,
  updateMediaView,
  type MediaView,
  type Point,
  type Size,
} from './media-viewport';
import { useModalLayer } from '../../primitives/useModalLayer';
import css from './MediaViewer.module.css';

const EMPTY_SIZE: Size = { width: 0, height: 0 };

/**
 * Document-level image viewer in the dsh ImageLightbox chrome: a dimmed mask,
 * a close control, and a zoom/pan canvas with a toolbar. Closes on Escape,
 * backdrop press, or the close control, and restores focus to the opener on
 * unmount. Rendered through a body portal so a transformed or filtered
 * ancestor cannot trap the fixed backdrop.
 * @param props.src - the image URL (an object URL keeps its owner).
 * @param props.alt - the image's alt text.
 * @param props.onClose - dismiss callback owned by the opener.
 */
export function MediaViewer({
  src,
  alt = 'Image',
  onClose,
}: {
  src: string;
  alt?: string | undefined;
  onClose: () => void;
}) {
  const backdrop = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const instructions = useId();
  const [dragging, setDragging] = useState(false);
  const [image, setImage] = useState<Size>(EMPTY_SIZE);
  const [view, dispatch] = useReducer(
    (state: MediaView, action: Parameters<typeof updateMediaView>[1]) =>
      updateMediaView(state, action, image),
    { viewport: EMPTY_SIZE, scale: 1, offset: { x: 0, y: 0 }, fitting: true },
  );
  const fit = fitMedia(image, view.viewport);
  const ready = image.width > 0 && view.viewport.width > 0 && view.viewport.height > 0;

  useModalLayer(backdrop, true, onClose);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const active = pointers.current;
    const clear = () => {
      const captured = [...active.keys()];
      active.clear();
      for (const id of captured)
        if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
      setDragging(false);
    };
    const observer = new ResizeObserver(() => {
      clear();
      dispatch({
        type: 'resize',
        viewport: { width: element.clientWidth, height: element.clientHeight },
      });
    });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      if (!event.cancelable) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect();
        dispatch({
          type: 'zoom',
          factor: Math.exp(Math.max(-1, Math.min(1, -event.deltaY * unit * 0.01))),
          point: {
            x: event.clientX - rect.left - element.clientLeft,
            y: event.clientY - rect.top - element.clientTop,
          },
        });
      } else {
        dispatch({
          type: 'pan',
          delta: {
            x: -(event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX) * unit,
            y: event.shiftKey && !event.deltaX ? 0 : -event.deltaY * unit,
          },
        });
      }
    };
    // React's delegated wheel listener is passive; cancel only gestures on this canvas.
    element.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('blur', clear);
    return () => {
      observer.disconnect();
      element.removeEventListener('wheel', wheel);
      window.removeEventListener('blur', clear);
      active.clear();
    };
  }, []);

  function point(event: PointerEvent<HTMLDivElement>): Point {
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    return {
      x: event.clientX - rect.left - element.clientLeft,
      y: event.clientY - rect.top - element.clientTop,
    };
  }
  function endPointer(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(pointers.current.size > 0);
  }

  return createPortal(
    <div ref={backdrop} tabIndex={-1} className={css.backdrop} role="dialog" aria-modal="true" aria-label={alt}>
      <div className={css.mask} aria-hidden="true" onMouseDown={onClose} />
      <div className={css.frame}>
        <div className={css.toolbar} role="group" aria-label="Image zoom controls">
          <button
            type="button"
            className={css.toolAction}
            aria-label="Zoom out"
            title="Zoom out (−)"
            disabled={!ready || view.scale <= fit + 0.000001}
            onClick={() => dispatch({ type: 'zoom', factor: 0.8 })}
          >
            −
          </button>
          <span className={css.zoomLevel}>{Math.round(view.scale * 100)}%</span>
          <button
            type="button"
            className={css.toolAction}
            aria-label="Zoom in"
            title="Zoom in (+)"
            disabled={!ready || view.scale >= MAX_MEDIA_ZOOM}
            onClick={() => dispatch({ type: 'zoom', factor: 1.25 })}
          >
            <IconPlusOutlineRegular size={16} />
          </button>
          <button
            type="button"
            className={css.toolAction}
            aria-label="Fit image"
            title="Fit image (0)"
            aria-pressed={view.fitting}
            onClick={() => dispatch({ type: 'fit' })}
          >
            <IconFullscreenOutlineRegular size={16} />
          </button>
          <button
            type="button"
            className={css.toolAction}
            aria-label="Actual size"
            title="Actual size (1)"
            onClick={() => dispatch({ type: 'actual' })}
          >
            100%
          </button>
          <a
            className={css.toolAction}
            href={src}
            download
            aria-label="Download image"
            title="Download image"
          >
            <IconDownloadOutlineRegular size={16} />
          </a>
        </div>
        <p className="sr-only" id={instructions}>
          Drag or scroll to pan. Pinch or Ctrl+scroll to zoom. Use plus and minus to zoom, arrow
          keys to pan, 0 to fit, and 1 for actual size.
        </p>
        <div
          ref={canvas}
          data-modal-autofocus
          className={css.canvas}
          role="group"
          aria-label="Expanded image"
          aria-describedby={instructions}
          tabIndex={0}
          data-dragging={dragging || undefined}
          data-pannable={ready && view.scale > fit + 0.000001 ? true : undefined}
          onPointerDown={(event) => {
            if (event.button !== 0 || pointers.current.size >= 2) return;
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
            pointers.current.set(event.pointerId, point(event));
            setDragging(true);
          }}
          onPointerMove={(event) => {
            if (!pointers.current.has(event.pointerId)) return;
            const before = pointerGesture(pointers.current.values())!;
            pointers.current.set(event.pointerId, point(event));
            const after = pointerGesture(pointers.current.values())!;
            dispatch({
              type: 'gesture',
              from: before.center,
              to: after.center,
              factor: before.distance > 0 ? after.distance / before.distance : 1,
            });
          }}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onLostPointerCapture={endPointer}
          onKeyDown={(event) => {
            if (
              event.target !== event.currentTarget ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey
            )
              return;
            const step = event.shiftKey ? 240 : 60;
            switch (event.key) {
              case '+':
              case '=':
                dispatch({ type: 'zoom', factor: 1.25 });
                break;
              case '-':
              case '_':
                dispatch({ type: 'zoom', factor: 0.8 });
                break;
              case '0':
              case 'Home':
                dispatch({ type: 'fit' });
                break;
              case '1':
                dispatch({ type: 'actual' });
                break;
              case 'ArrowLeft':
                dispatch({ type: 'pan', delta: { x: step, y: 0 } });
                break;
              case 'ArrowRight':
                dispatch({ type: 'pan', delta: { x: -step, y: 0 } });
                break;
              case 'ArrowUp':
                dispatch({ type: 'pan', delta: { x: 0, y: step } });
                break;
              case 'ArrowDown':
                dispatch({ type: 'pan', delta: { x: 0, y: -step } });
                break;
              default:
                return;
            }
            event.preventDefault();
          }}
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            onLoad={(event) => {
              const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
              if (width > 0 && height > 0) setImage({ width, height });
            }}
            style={{
              width: image.width * view.scale,
              height: image.height * view.scale,
              transform: `translate(${view.offset.x}px, ${view.offset.y}px)`,
              visibility: ready ? 'visible' : 'hidden',
            }}
          />
        </div>
      </div>
      <button type="button" className={css.close} aria-label="Close" onClick={onClose}>
        <IconCloseOutlineRegular size={16} />
      </button>
    </div>,
    document.body,
  );
}
