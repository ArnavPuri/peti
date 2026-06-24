import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { Rect } from "../lib/ipc";

interface Props {
  rect: Rect;
  canvas: { w: number; h: number };
  accent: string;
  title: ReactNode;
  children: ReactNode;
  variant?: "terminal" | "note";
  onCommit: (rect: Rect) => void;
  onFocus: () => void;
  onClose?: () => void;
}

const MIN_W = 0.15;
const MIN_H = 0.12;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// A draggable / resizable translucent card. The gesture runs imperatively —
// pointermove mutates the node's transform/size directly (no React re-render
// per frame) and commits to state once on release. Position is GPU-composited
// translate3d; blur is dropped mid-gesture (`.gesturing`) so the backdrop isn't
// re-sampled every frame.
export default function FloatingCard(props: Props) {
  const { rect, canvas, accent, title, children, onCommit, onFocus, onClose } = props;
  const cardRef = useRef<HTMLDivElement>(null);
  const [gesturing, setGesturing] = useState(false);

  const live = useRef<Rect>(rect);
  live.current = rect; // re-synced each render (never happens mid-gesture)

  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const resize = useRef<{ px: number; py: number; ow: number; oh: number } | null>(null);

  const applyTransform = () => {
    const el = cardRef.current;
    if (!el) return;
    const r = live.current;
    el.style.transform = `translate3d(${r.x * canvas.w}px, ${r.y * canvas.h}px, 0)`;
    el.style.width = `${r.w * canvas.w}px`;
    el.style.height = `${r.h * canvas.h}px`;
  };

  const startDrag = (e: ReactPointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: rect.x, oy: rect.y };
    onFocus();
    setGesturing(true);
  };
  const onDragMove = (e: ReactPointerEvent) => {
    if (!drag.current || canvas.w === 0) return;
    const dx = (e.clientX - drag.current.px) / canvas.w;
    const dy = (e.clientY - drag.current.py) / canvas.h;
    live.current = {
      ...live.current,
      x: clamp(drag.current.ox + dx, 0, 1 - live.current.w),
      y: clamp(drag.current.oy + dy, 0, 1 - live.current.h),
    };
    applyTransform();
  };
  const endDrag = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    setGesturing(false);
    onCommit(live.current);
  };

  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resize.current = { px: e.clientX, py: e.clientY, ow: rect.w, oh: rect.h };
    onFocus();
    setGesturing(true);
  };
  const onResizeMove = (e: ReactPointerEvent) => {
    if (!resize.current || canvas.w === 0) return;
    const dw = (e.clientX - resize.current.px) / canvas.w;
    const dh = (e.clientY - resize.current.py) / canvas.h;
    live.current = {
      ...live.current,
      w: clamp(resize.current.ow + dw, MIN_W, 1 - live.current.x),
      h: clamp(resize.current.oh + dh, MIN_H, 1 - live.current.y),
    };
    applyTransform();
  };
  const endResize = (e: ReactPointerEvent) => {
    if (!resize.current) return;
    resize.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    setGesturing(false);
    onCommit(live.current);
  };

  const style: CSSProperties = {
    transform: `translate3d(${rect.x * canvas.w}px, ${rect.y * canvas.h}px, 0)`,
    width: `${rect.w * canvas.w}px`,
    height: `${rect.h * canvas.h}px`,
    zIndex: rect.z,
    borderColor: `${accent}55`,
  };

  return (
    <div
      ref={cardRef}
      className={`pane-card pane-card--${props.variant ?? "terminal"}${gesturing ? " gesturing" : ""}`}
      style={style}
      onPointerDown={onFocus}
    >
      <div
        className="pane-card-title"
        onPointerDown={startDrag}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
      >
        <span className="pane-card-dot" style={{ background: accent }} />
        <span className="pane-card-label">{title}</span>
        {onClose && (
          <button
            className="pane-card-close"
            title="Close"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
          >
            ×
          </button>
        )}
      </div>

      <div className="pane-card-body">{children}</div>

      <div
        className="pane-card-resize"
        onPointerDown={startResize}
        onPointerMove={onResizeMove}
        onPointerUp={endResize}
      />
    </div>
  );
}
