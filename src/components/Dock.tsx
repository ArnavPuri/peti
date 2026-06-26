import { useState } from "react";
import type { PaneType, SessionState } from "../lib/ipc";

export interface DockCard {
  sid: string;
  label: string;
  status?: SessionState;
  closed: boolean;
}

interface Props {
  cards: DockCard[];
  onRaise: (sid: string) => void;
  onClose: (sid: string) => void;
  onAdd: (type: PaneType, pickFolder: boolean) => void;
}

// A slim overview rail of every card (status dot + raise + close) plus a +
// button to spawn a new Claude/shell on the fly.
export default function Dock({ cards, onRaise, onClose, onAdd }: Props) {
  const [addOpen, setAddOpen] = useState(false);

  const add = (type: PaneType, pickFolder: boolean) => {
    setAddOpen(false);
    onAdd(type, pickFolder);
  };

  return (
    <div className="dock">
      {cards.map((c) => (
        <div
          key={c.sid}
          className={"dock-chip" + (c.closed ? " closed" : "")}
          title={c.closed ? "Closed — click to reopen" : c.status ?? c.label}
        >
          <button className="dock-raise" onClick={() => onRaise(c.sid)}>
            <span className={"dock-dot" + (c.status ? ` status-${c.status}` : "")} />
            <span className="dock-label">{c.label}</span>
          </button>
          {!c.closed && (
            <button className="dock-close icon-btn" title="Close" onClick={() => onClose(c.sid)}>
              ×
            </button>
          )}
        </div>
      ))}

      <div className="dock-add-wrap">
        <button className="dock-add icon-btn" title="Add a card" onClick={() => setAddOpen((o) => !o)}>
          ＋
        </button>
        {addOpen && (
          <div className="dock-add-pop">
            <button onClick={() => add("claude", false)}>New Claude (here)</button>
            <button onClick={() => add("shell", false)}>New Shell (here)</button>
            <button onClick={() => add("code", false)}>New Code viewer (here)</button>
            <div className="dock-add-sep" />
            <button onClick={() => add("claude", true)}>Claude in folder…</button>
            <button onClick={() => add("shell", true)}>Shell in folder…</button>
            <button onClick={() => add("code", true)}>Code viewer in folder…</button>
          </div>
        )}
      </div>
    </div>
  );
}
