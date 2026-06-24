import { useRef, useState, type KeyboardEvent } from "react";
import { useUiStore } from "../stores/uiStore";
import { sendToPane } from "../lib/send";
import type { Workspace } from "../lib/ipc";

// Bottom-center prompt bar. Dispatches to whichever terminal card has focus.
// Enter sends; Shift+Enter inserts a newline. The Insert/Send toggle controls
// whether the paste auto-submits in the card.
export default function PromptBar({ workspace }: { workspace: Workspace }) {
  const focused = useUiStore((s) => s.focusedSessionId);
  const sendMode = useUiStore((s) => s.sendMode);
  const setSendMode = useUiStore((s) => s.setSendMode);
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Map the focused session id ("<wsId>::<idx>") to its pane label.
  const targetLabel = (() => {
    if (!focused) return null;
    const idx = Number(focused.split("::")[1]);
    return workspace.panes[idx]?.label ?? null;
  })();

  const dispatch = () => {
    const payload = text;
    if (!payload.trim() || !focused) return;
    void sendToPane(focused, payload, sendMode);
    setText("");
    ref.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      dispatch();
    }
  };

  return (
    <div className="promptbar">
      <button
        className="promptbar-mode"
        title="Toggle paste mode"
        onClick={() => setSendMode(sendMode === "send" ? "insert" : "send")}
      >
        {sendMode === "send" ? "Send" : "Insert"}
      </button>

      <textarea
        ref={ref}
        className="promptbar-input"
        rows={1}
        placeholder={
          targetLabel ? `Message ${targetLabel}…` : "Focus a card to send…"
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />

      <span className="promptbar-target">{targetLabel ?? "no card"}</span>
    </div>
  );
}
