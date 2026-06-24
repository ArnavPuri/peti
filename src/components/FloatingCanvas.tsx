import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import FloatingCard from "./FloatingCard";
import PaneCard from "./PaneCard";
import TaskNote from "./TaskNote";
import Dock, { type DockCard } from "./Dock";
import { saveLayout, saveNoteRect, type PaneType, type Rect, type Workspace } from "../lib/ipc";
import { resolveCommand } from "../lib/command";
import { useUiStore } from "../stores/uiStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useSessionsStore } from "../stores/sessionsStore";

function debounce<T extends (...a: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: never[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

// Ephemeral, session-only card added at runtime (not written to the TOML).
interface ExtraDef {
  sid: string;
  label: string;
  cwd: string;
  type: PaneType;
  command: string;
}

const isExtra = (sid: string) => (sid.split("::")[1] ?? "").startsWith("x");
const baseIndex = (sid: string) => Number(sid.split("::")[1]);

export default function FloatingCanvas({ workspace }: { workspace: Workspace }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [rects, setRects] = useState<Rect[]>(() => workspace.rects.map((r) => ({ ...r })));
  const [noteRect, setNoteRect] = useState<Rect>(() => ({ ...workspace.note }));
  const [closed, setClosed] = useState<Set<number>>(() => new Set());
  const [extras, setExtras] = useState<ExtraDef[]>([]);
  const [extraRects, setExtraRects] = useState<Record<string, Rect>>({});
  const setFocused = useUiStore((s) => s.setFocused);
  const settings = useSettingsStore((s) => s.settings);
  const activity = useSessionsStore((s) => s.activity);

  // Stable resolved argv (keeps the Terminal effect's `args` dep stable).
  const resolved = useMemo(
    () => workspace.panes.map((p) => resolveCommand(p, settings)),
    [workspace, settings],
  );
  const resolvedExtras = useMemo(
    () =>
      extras.map((e) =>
        resolveCommand(
          { label: e.label, path: e.cwd, type: e.type, command: e.command || null, resume: false },
          settings,
        ),
      ),
    [extras, settings],
  );

  const zCounter = useRef(Math.max(...workspace.rects.map((r) => r.z), workspace.note.z));
  const nextZ = () => (zCounter.current += 1);
  const extraCounter = useRef(0);

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

  // Unified handlers keyed by sessionId (stable for PaneCard's memo).
  const commit = useCallback(
    (sid: string, rect: Rect) => {
      if (isExtra(sid)) {
        setExtraRects((prev) => ({ ...prev, [sid]: rect }));
      } else {
        const i = baseIndex(sid);
        setRects((prev) => {
          const next = prev.map((r, j) => (j === i ? rect : r));
          persistRects(next);
          return next;
        });
      }
    },
    [persistRects],
  );

  const focus = useCallback(
    (sid: string) => {
      const z = nextZ();
      if (isExtra(sid)) {
        setExtraRects((prev) => ({ ...prev, [sid]: { ...prev[sid], z } }));
      } else {
        const i = baseIndex(sid);
        setRects((prev) => {
          const next = prev.map((r, j) => (j === i ? { ...r, z } : r));
          persistRects(next);
          return next;
        });
      }
      setFocused(sid);
    },
    [persistRects, setFocused],
  );

  const close = useCallback((sid: string) => {
    if (isExtra(sid)) {
      setExtras((prev) => prev.filter((e) => e.sid !== sid));
      setExtraRects((prev) => {
        const next = { ...prev };
        delete next[sid];
        return next;
      });
    } else {
      setClosed((prev) => new Set(prev).add(baseIndex(sid)));
    }
  }, []);

  // Dock "raise": reopen a closed base card, else bring to front.
  const raise = (sid: string) => {
    if (!isExtra(sid)) {
      const i = baseIndex(sid);
      if (closed.has(i)) {
        setClosed((prev) => {
          const next = new Set(prev);
          next.delete(i);
          return next;
        });
        setFocused(sid);
        return;
      }
    }
    focus(sid);
  };

  const currentCwd = (): string => {
    const f = useUiStore.getState().focusedSessionId;
    if (f) {
      if (isExtra(f)) {
        const e = extras.find((x) => x.sid === f);
        if (e) return e.cwd;
      } else {
        const p = workspace.panes[baseIndex(f)];
        if (p) return p.path;
      }
    }
    return workspace.panes[0]?.path ?? "~";
  };

  const addCard = async (type: PaneType, pickFolder: boolean) => {
    let cwd = currentCwd();
    if (pickFolder) {
      const picked = await open({ directory: true, title: "Folder for the new card" });
      if (typeof picked !== "string") return;
      cwd = picked;
    }
    const n = extraCounter.current++;
    const sid = `${workspace.id}::x${n}`;
    const label = cwd.split("/").filter(Boolean).pop() || type;
    const off = (extras.length % 5) * 0.04;
    const rect: Rect = { x: 0.2 + off, y: 0.18 + off, w: 0.46, h: 0.52, z: nextZ() };
    setExtraRects((prev) => ({ ...prev, [sid]: rect }));
    setExtras((prev) => [...prev, { sid, label, cwd, type, command: "" }]);
    setFocused(sid);
  };

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

  const dockCards: DockCard[] = [
    ...workspace.panes.map((p, i) => ({
      sid: `${workspace.id}::${i}`,
      label: p.label,
      status: activity[`${workspace.id}::${i}`],
      closed: closed.has(i),
    })),
    ...extras.map((e) => ({ sid: e.sid, label: e.label, status: activity[e.sid], closed: false })),
  ];

  return (
    <div className="canvas" ref={ref}>
      {workspace.panes.map((pane, i) => {
        if (closed.has(i)) return null;
        const sid = `${workspace.id}::${i}`;
        return (
          <PaneCard
            key={sid}
            sessionId={sid}
            rect={rects[i]}
            canvas={size}
            accent={accent}
            label={pane.label}
            cwd={pane.path}
            command={resolved[i].command}
            args={resolved[i].args}
            watchStatus={pane.type === "claude"}
            status={activity[sid]}
            onCommit={commit}
            onFocus={focus}
            onClose={close}
          />
        );
      })}

      {extras.map((e, k) => (
        <PaneCard
          key={e.sid}
          sessionId={e.sid}
          rect={extraRects[e.sid]}
          canvas={size}
          accent={accent}
          label={e.label}
          cwd={e.cwd}
          command={resolvedExtras[k].command}
          args={resolvedExtras[k].args}
          watchStatus={e.type === "claude"}
          status={activity[e.sid]}
          onCommit={commit}
          onFocus={focus}
          onClose={close}
        />
      ))}

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

      <Dock cards={dockCards} onRaise={raise} onClose={close} onAdd={addCard} />
    </div>
  );
}
