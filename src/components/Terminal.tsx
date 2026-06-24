import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
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
}

export default function Terminal({ sessionId, cwd, command, args }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

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
      theme: { background: "#0d0f12", foreground: "#e6e6e6" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    // keystrokes -> pty
    const encoder = new TextEncoder();
    term.onData((data) => {
      void writePane(sessionId, encoder.encode(data));
    });

    // container resize (window OR card drag-resize) -> fit -> pty resize.
    // rAF-coalesced and guarded so a live resize doesn't spam fit/SIGWINCH; we
    // only message the PTY when the grid (cols/rows) actually changes.
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

      // cleanup may have already run while we awaited the listeners
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
    };
  }, [sessionId, cwd, command, args]);

  return <div className="term-host" ref={hostRef} />;
}
