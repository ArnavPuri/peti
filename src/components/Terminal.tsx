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

interface Props {
  cwd: string;
  command: string;
  args: string[];
}

// One pane for the spike. Phase 1 will mint an id per workspace pane.
const SESSION_ID = "spike";

export default function Terminal({ cwd, command, args }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

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
      void writePane(SESSION_ID, encoder.encode(data));
    });

    // container resize -> fit -> pty resize (drives SIGWINCH)
    const handleResize = () => {
      fit.fit();
      void resizePane(SESSION_ID, term.cols, term.rows);
    };
    const observer = new ResizeObserver(handleResize);
    observer.observe(host);

    (async () => {
      const unOut = await onPaneOutput((p) => {
        if (p.session_id !== SESSION_ID) return;
        term.write(new Uint8Array(p.data));
      });
      const unExit = await onPaneExit((p) => {
        if (p.session_id !== SESSION_ID) return;
        term.write("\r\n\x1b[2m[process exited]\x1b[0m\r\n");
      });
      unlisteners.push(unOut, unExit);

      // Effect cleanup may have already fired while we were awaiting.
      if (disposed) {
        unOut();
        unExit();
        return;
      }

      await spawnPane({
        sessionId: SESSION_ID,
        cwd,
        command,
        args,
        cols: term.cols,
        rows: term.rows,
      });
      term.focus();
    })();

    return () => {
      disposed = true;
      observer.disconnect();
      unlisteners.forEach((u) => u());
      void killPane(SESSION_ID);
      term.dispose();
    };
  }, [cwd, command, args]);

  return <div className="terminal-host" ref={hostRef} />;
}
