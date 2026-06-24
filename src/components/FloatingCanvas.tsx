import { useLayoutEffect, useMemo, useRef, useState } from "react";
import FloatingPane from "./FloatingPane";
import { saveLayout, type Rect, type Workspace } from "../lib/ipc";
import { resolveCommand } from "../lib/command";

function debounce<T extends (...a: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: never[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export default function FloatingCanvas({ workspace }: { workspace: Workspace }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [rects, setRects] = useState<Rect[]>(() => workspace.rects.map((r) => ({ ...r })));
  const [closed, setClosed] = useState<Set<number>>(() => new Set());

  // Measure the canvas in px so drag/resize can map pointer deltas to fractions.
  // useLayoutEffect so the first paint already has real px (no zero-size flash).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const persist = useMemo(
    () => debounce((rs: Rect[]) => void saveLayout(workspace.id, rs), 400),
    [workspace.id],
  );

  const commitRect = (i: number, rect: Rect) => {
    setRects((prev) => {
      const next = prev.map((r, j) => (j === i ? rect : r));
      persist(next);
      return next;
    });
  };

  const bringToFront = (i: number) => {
    setRects((prev) => {
      const maxZ = Math.max(...prev.map((r) => r.z));
      if (prev[i].z === maxZ) return prev;
      const next = prev.map((r, j) => (j === i ? { ...r, z: maxZ + 1 } : r));
      persist(next);
      return next;
    });
  };

  const close = (i: number) => setClosed((prev) => new Set(prev).add(i));

  return (
    <div className="canvas" ref={ref}>
      {workspace.panes.map((pane, i) => {
        if (closed.has(i)) return null;
        const sessionId = `${workspace.id}::${i}`;
        const { command, args } = resolveCommand(pane);
        return (
          <FloatingPane
            key={sessionId}
            rect={rects[i]}
            canvas={size}
            accent={workspace.accent ?? "#5cd6ae"}
            label={pane.label}
            sessionId={sessionId}
            cwd={pane.path}
            command={command}
            args={args}
            onCommit={(r) => commitRect(i, r)}
            onFocus={() => bringToFront(i)}
            onClose={() => close(i)}
          />
        );
      })}
    </div>
  );
}
