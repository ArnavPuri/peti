import { memo } from "react";
import FloatingCard from "./FloatingCard";
import Terminal from "./Terminal";
import type { Rect } from "../lib/ipc";

interface Props {
  index: number;
  sessionId: string;
  rect: Rect;
  canvas: { w: number; h: number };
  accent: string;
  label: string;
  cwd: string;
  command: string;
  args: string[];
  onCommit: (index: number, rect: Rect) => void;
  onFocus: (index: number) => void;
  onClose: (index: number) => void;
}

// Memoized so focusing one card (which re-renders FloatingCanvas) doesn't
// re-render every other card. All props are referentially stable except `rect`,
// which only changes for the card that actually moved/focused — so siblings
// skip rendering entirely, and crucially their Terminal effect never re-runs.
function PaneCard(props: Props) {
  const { index, onCommit, onFocus, onClose } = props;
  return (
    <FloatingCard
      rect={props.rect}
      canvas={props.canvas}
      accent={props.accent}
      title={props.label}
      variant="terminal"
      onCommit={(r) => onCommit(index, r)}
      onFocus={() => onFocus(index)}
      onClose={() => onClose(index)}
    >
      <Terminal
        sessionId={props.sessionId}
        cwd={props.cwd}
        command={props.command}
        args={props.args}
      />
    </FloatingCard>
  );
}

export default memo(PaneCard);
