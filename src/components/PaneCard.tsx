import { memo, useEffect, useState } from "react";
import FloatingCard from "./FloatingCard";
import Terminal from "./Terminal";
import { gitStatus, type GitInfo, type Rect, type SessionState } from "../lib/ipc";

interface Props {
  sessionId: string;
  rect: Rect;
  canvas: { w: number; h: number };
  accent: string;
  label: string;
  cwd: string;
  command: string;
  args: string[];
  watchStatus: boolean;
  status?: SessionState;
  onCommit: (sessionId: string, rect: Rect) => void;
  onFocus: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
}

// Memoized so focusing one card (which re-renders FloatingCanvas) doesn't
// re-render every other card. All props are referentially stable except `rect`,
// which only changes for the card that actually moved/focused — so siblings
// skip rendering entirely, and crucially their Terminal effect never re-runs.
function PaneCard(props: Props) {
  const { sessionId, onCommit, onFocus, onClose } = props;
  const [git, setGit] = useState<GitInfo | null>(null);

  // Poll the pane's repo (branch + dirty) every few seconds.
  useEffect(() => {
    let alive = true;
    const tick = () =>
      gitStatus(props.cwd)
        .then((g) => alive && setGit(g))
        .catch(() => {});
    tick();
    const iv = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [props.cwd]);

  return (
    <FloatingCard
      rect={props.rect}
      canvas={props.canvas}
      accent={props.accent}
      title={props.label}
      variant="terminal"
      status={props.status}
      git={git}
      onCommit={(r) => onCommit(sessionId, r)}
      onFocus={() => onFocus(sessionId)}
      onClose={() => onClose(sessionId)}
    >
      <Terminal
        sessionId={props.sessionId}
        cwd={props.cwd}
        command={props.command}
        args={props.args}
        watchStatus={props.watchStatus}
      />
    </FloatingCard>
  );
}

export default memo(PaneCard);
