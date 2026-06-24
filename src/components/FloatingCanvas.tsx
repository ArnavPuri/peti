import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import FloatingCard from "./FloatingCard";
import PaneCard from "./PaneCard";
import TaskNote from "./TaskNote";
import { saveLayout, saveNoteRect, type Rect, type Workspace } from "../lib/ipc";
import { resolveCommand } from "../lib/command";
import { useUiStore } from "../stores/uiStore";
import { useSettingsStore } from "../stores/settingsStore";

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
  const [noteRect, setNoteRect] = useState<Rect>(() => ({ ...workspace.note }));
  const [closed, setClosed] = useState<Set<number>>(() => new Set());
  const setFocused = useUiStore((s) => s.setFocused);
  const settings = useSettingsStore((s) => s.settings);

  // Stable resolved argv per pane — recomputed only when the workspace or
  // settings change, NOT on every focus/drag re-render. This is what keeps the
  // Terminal effect's `args` dependency stable so PTYs aren't torn down.
  const resolved = useMemo(
    () => workspace.panes.map((p) => resolveCommand(p, settings)),
    [workspace, settings],
  );

  // Monotonic z so "bring to front" is O(1) and shared across cards + note.
  const zCounter = useRef(Math.max(...workspace.rects.map((r) => r.z), workspace.note.z));
  const nextZ = () => (zCounter.current += 1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (workspace.panes.length > 0) setFocused(`${workspace.id}::0`);
  }, [workspace.id, workspace.panes.length, setFocused]);

  const persistRects = useMemo(
    () => debounce((rs: Rect[]) => void saveLayout(workspace.id, rs), 400),
    [workspace.id],
  );
  const persistNote = useMemo(
    () => debounce((r: Rect) => void saveNoteRect(workspace.id, r), 400),
    [workspace.id],
  );

  // Stable callbacks (take an index) so PaneCard's memo holds for siblings.
  const commitRect = useCallback(
    (i: number, rect: Rect) =>
      setRects((prev) => {
        const next = prev.map((r, j) => (j === i ? rect : r));
        persistRects(next);
        return next;
      }),
    [persistRects],
  );

  const focusPane = useCallback(
    (i: number) => {
      const z = nextZ();
      setRects((prev) => {
        const next = prev.map((r, j) => (j === i ? { ...r, z } : r));
        persistRects(next);
        return next;
      });
      setFocused(`${workspace.id}::${i}`);
    },
    [persistRects, setFocused, workspace.id],
  );

  const close = useCallback((i: number) => setClosed((prev) => new Set(prev).add(i)), []);

  const commitNote = useCallback(
    (rect: Rect) => {
      setNoteRect(rect);
      persistNote(rect);
    },
    [persistNote],
  );
  const focusNote = useCallback(() => {
    const z = nextZ();
    setNoteRect((prev) => {
      const next = { ...prev, z };
      persistNote(next);
      return next;
    });
  }, [persistNote]);

  const accent = workspace.accent ?? "#5cd6ae";

  return (
    <div className="canvas" ref={ref}>
      {workspace.panes.map((pane, i) => {
        if (closed.has(i)) return null;
        return (
          <PaneCard
            key={`${workspace.id}::${i}`}
            index={i}
            sessionId={`${workspace.id}::${i}`}
            rect={rects[i]}
            canvas={size}
            accent={accent}
            label={pane.label}
            cwd={pane.path}
            command={resolved[i].command}
            args={resolved[i].args}
            onCommit={commitRect}
            onFocus={focusPane}
            onClose={close}
          />
        );
      })}

      <FloatingCard
        rect={noteRect}
        canvas={size}
        accent={accent}
        title="tasks"
        variant="note"
        onCommit={commitNote}
        onFocus={focusNote}
      >
        <TaskNote workspaceId={workspace.id} />
      </FloatingCard>
    </div>
  );
}
