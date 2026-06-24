import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import {
  spawnPane,
  writePane,
  resizePane,
  killPane,
  onPaneOutput,
  onPaneExit,
} from "../lib/ipc";
import { useSessionsStore } from "../stores/sessionsStore";

interface Props {
  sessionId: string;
  cwd: string;
  command: string;
  args: string[];
  watchStatus: boolean;
}

const MIN_FONT = 9;
const MAX_FONT = 22;

export default function Terminal({ sessionId, cwd, command, args, watchStatus }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const { setStatus, remove } = useSessionsStore.getState();
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const term = new XTerm({
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
      theme: { background: "#0d0f12", foreground: "#e6e6e6" },
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.open(host);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;

    // keystrokes -> pty
    const encoder = new TextEncoder();
    term.onData((data) => {
      void writePane(sessionId, encoder.encode(data));
    });

    // QoL keybindings handled here so they don't reach the PTY.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return true;
      const key = e.key.toLowerCase();

      // Cmd/Ctrl+C copies only when there's a selection; otherwise let it
      // through as SIGINT.
      if (key === "c" && term.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection());
        return false;
      }
      if (key === "v") {
        void navigator.clipboard.readText().then((t) => {
          if (t) void writePane(sessionId, encoder.encode(t));
        });
        return false;
      }
      if (key === "k") {
        term.clear();
        return false;
      }
      if (key === "f") {
        setFindOpen(true);
        return false;
      }
      if (key === "=" || key === "+") {
        term.options.fontSize = Math.min((term.options.fontSize ?? 13) + 1, MAX_FONT);
        fit.fit();
        return false;
      }
      if (key === "-") {
        term.options.fontSize = Math.max((term.options.fontSize ?? 13) - 1, MIN_FONT);
        fit.fit();
        return false;
      }
      if (key === "0") {
        term.options.fontSize = 13;
        fit.fit();
        return false;
      }
      return true;
    });

    // container resize -> fit -> pty resize (rAF-coalesced, change-guarded).
    let raf = 0;
    let lastCols = -1;
    let lastRows = -1;
    const handleResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        fit.fit();
        if (term.cols !== lastCols || term.rows !== lastRows) {
          lastCols = term.cols;
          lastRows = term.rows;
          void resizePane(sessionId, term.cols, term.rows);
        }
      });
    };
    const observer = new ResizeObserver(handleResize);
    observer.observe(host);

    (async () => {
      const unOut = await onPaneOutput((p) => {
        if (p.session_id !== sessionId) return;
        term.write(new Uint8Array(p.data));
      });
      const unExit = await onPaneExit((p) => {
        if (p.session_id !== sessionId) return;
        setStatus(sessionId, "exited");
        term.write("\r\n\x1b[2m[process exited]\x1b[0m\r\n");
      });
      unlisteners.push(unOut, unExit);

      if (disposed) {
        unOut();
        unExit();
        return;
      }

      setStatus(sessionId, "spawning");
      try {
        await spawnPane({
          sessionId,
          cwd,
          command,
          args,
          cols: term.cols,
          rows: term.rows,
          watchStatus,
        });
        setStatus(sessionId, "running");
        term.focus();
      } catch (e) {
        setStatus(sessionId, "exited");
        term.write(`\r\n\x1b[31mfailed to start: ${String(e)}\x1b[0m\r\n`);
      }
    })();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      unlisteners.forEach((u) => u());
      void killPane(sessionId);
      remove(sessionId);
      term.dispose();
      termRef.current = null;
      searchRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId, cwd, command, args, watchStatus]);

  const runFind = (text: string, prev = false) => {
    setFindText(text);
    if (!text) return;
    if (prev) searchRef.current?.findPrevious(text);
    else searchRef.current?.findNext(text);
  };

  const onFindKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runFind(findText, e.shiftKey);
    } else if (e.key === "Escape") {
      setFindOpen(false);
      setFindText("");
      searchRef.current?.clearDecorations();
      termRef.current?.focus();
    }
  };

  return (
    <div className="term-wrap">
      {findOpen && (
        <div className="term-find">
          <input
            autoFocus
            placeholder="Find…"
            value={findText}
            onChange={(e) => runFind(e.target.value)}
            onKeyDown={onFindKey}
          />
          <button title="Previous" onClick={() => runFind(findText, true)}>
            ↑
          </button>
          <button title="Next" onClick={() => runFind(findText)}>
            ↓
          </button>
          <button
            title="Close"
            onClick={() => {
              setFindOpen(false);
              setFindText("");
              searchRef.current?.clearDecorations();
              termRef.current?.focus();
            }}
          >
            ×
          </button>
        </div>
      )}
      <div className="term-host" ref={hostRef} />
    </div>
  );
}
