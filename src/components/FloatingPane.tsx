import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
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
  onChange: (patch: Partial<Rect>) => void;
  onFocus: () => void;
  onClose: () => void;
}

const MIN_W = 0.15;
const MIN_H = 0.15;

// A draggable / resizable translucent terminal card. Drag from the title bar,
// resize from the bottom-right corner; both report geometry as canvas fractions.
export default function FloatingPane(props: Props) {
  const { rect, canvas, accent, label, onChange, onFocus, onClose } = props;
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const resize = useRef<{ px: number; py: number; ow: number; oh: number } | null>(null);

  const startDrag = (e: ReactPointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: rect.x, oy: rect.y };
    onFocus();
  };
  const onDragMove = (e: ReactPointerEvent) => {
    if (!drag.current || canvas.w === 0) return;
    const dx = (e.clientX - drag.current.px) / canvas.w;
    const dy = (e.clientY - drag.current.py) / canvas.h;
    onChange({
      x: Math.min(Math.max(drag.current.ox + dx, 0), 1 - rect.w),
      y: Math.min(Math.max(drag.current.oy + dy, 0), 1 - rect.h),
    });
  };
  const endDrag = (e: ReactPointerEvent) => {
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resize.current = { px: e.clientX, py: e.clientY, ow: rect.w, oh: rect.h };
    onFocus();
  };
  const onResizeMove = (e: ReactPointerEvent) => {
    if (!resize.current || canvas.w === 0) return;
    const dw = (e.clientX - resize.current.px) / canvas.w;
    const dh = (e.clientY - resize.current.py) / canvas.h;
    onChange({
      w: Math.min(Math.max(resize.current.ow + dw, MIN_W), 1 - rect.x),
      h: Math.min(Math.max(resize.current.oh + dh, MIN_H), 1 - rect.y),
    });
  };
  const endResize = (e: ReactPointerEvent) => {
    resize.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const style: CSSProperties = {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
    zIndex: rect.z,
    borderColor: `${accent}55`,
  };

  return (
    <div className="pane-card" style={style} onPointerDown={onFocus}>
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
