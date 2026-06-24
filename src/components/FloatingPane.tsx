import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import Terminal from "./Terminal";
import type { Rect } from "../lib/ipc";

interface Props {
  rect: Rect;
  canvas: { w: number; h: number };
  accent: string;
  label: string;
  sessionId: string;
  cwd: string;
  command: string;
  args: string[];
  onCommit: (rect: Rect) => void;
  onFocus: () => void;
  onClose: () => void;
}

const MIN_W = 0.15;
const MIN_H = 0.15;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// A draggable / resizable translucent terminal card.
//
// Smoothness: the gesture runs *imperatively* — pointermove mutates the card's
// transform/size directly on the DOM node (no React re-render per frame) and we
// commit to React state once, on release. Position uses GPU-composited
// translate3d (not left/top), and blur is dropped mid-gesture (the `.gesturing`
// class) so the backdrop isn't re-sampled every frame.
export default function FloatingPane(props: Props) {
  const { rect, canvas, accent, label, onCommit, onFocus, onClose } = props;
  const cardRef = useRef<HTMLDivElement>(null);
  const [gesturing, setGesturing] = useState(false);

  // Live geometry during a gesture. Re-synced from props on every render (which
  // never happens mid-gesture, since moves are imperative).
  const live = useRef<Rect>(rect);
  live.current = rect;

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
      className={`pane-card${gesturing ? " gesturing" : ""}`}
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
        <span className="pane-card-label">{label}</span>
        <button
          className="pane-card-close"
          title="Close pane"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="pane-card-body">
        <Terminal
          sessionId={props.sessionId}
          cwd={props.cwd}
          command={props.command}
          args={props.args}
        />
      </div>

      <div
        className="pane-card-resize"
        onPointerDown={startResize}
        onPointerMove={onResizeMove}
        onPointerUp={endResize}
      />
    </div>
  );
}
