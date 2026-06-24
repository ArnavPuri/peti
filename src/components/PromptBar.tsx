import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useUiStore } from "../stores/uiStore";
import { useSnippetsStore } from "../stores/snippetsStore";
import { sendToPane } from "../lib/send";
import type { Workspace } from "../lib/ipc";

// Bottom-center prompt bar. Dispatches to whichever terminal card has focus.
// Enter sends; Shift+Enter inserts a newline. The Insert/Send toggle controls
// whether the paste auto-submits in the card. The ≣ button opens reusable
// prompt snippets.
export default function PromptBar({ workspace }: { workspace: Workspace }) {
  const focused = useUiStore((s) => s.focusedSessionId);
  const sendMode = useUiStore((s) => s.sendMode);
  const setSendMode = useUiStore((s) => s.setSendMode);
  const snippets = useSnippetsStore((s) => s.snippets);
  const loadSnippets = useSnippetsStore((s) => s.load);
  const addSnippet = useSnippetsStore((s) => s.add);
  const removeSnippet = useSnippetsStore((s) => s.remove);
  const [text, setText] = useState("");
  const [snipsOpen, setSnipsOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void loadSnippets();
  }, [loadSnippets]);

  const targetLabel = (() => {
    if (!focused) return null;
    const idx = Number(focused.split("::")[1]);
    return workspace.panes[idx]?.label ?? null;
  })();

  const dispatch = () => {
    if (!text.trim() || !focused) return;
    void sendToPane(focused, text, sendMode);
    setText("");
    ref.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      dispatch();
    }
  };

  const insertSnippet = (snippetText: string) => {
    setText(snippetText);
    setSnipsOpen(false);
    ref.current?.focus();
  };

  return (
    <div className="promptbar">
      <div className="promptbar-snips">
        <button
          className="promptbar-mode"
          title="Prompt snippets"
          onClick={() => setSnipsOpen((o) => !o)}
        >
          ≣
        </button>
        {snipsOpen && (
          <div className="snips-pop">
            <div className="snips-list">
              {snippets.map((s) => (
                <div key={s.id} className="snips-row">
                  <button className="snips-use" title={s.text} onClick={() => insertSnippet(s.text)}>
                    {s.title}
                  </button>
                  <button className="snips-del" title="Delete" onClick={() => removeSnippet(s.id)}>
                    ×
                  </button>
                </div>
              ))}
              {snippets.length === 0 && <div className="snips-empty">No snippets yet.</div>}
            </div>
            <button
              className="snips-save"
              disabled={!text.trim()}
              onClick={() => {
                addSnippet(text);
              }}
            >
              ＋ Save current prompt
            </button>
          </div>
        )}
      </div>

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
        placeholder={targetLabel ? `Message ${targetLabel}…` : "Focus a card to send…"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />

      <span className="promptbar-target">{targetLabel ?? "no card"}</span>
    </div>
  );
}
