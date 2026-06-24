import { useEffect, useState } from "react";
import { useTasksStore } from "../stores/tasksStore";
import { useUiStore } from "../stores/uiStore";
import { sendToPane } from "../lib/send";

// Contents of the floating task note. Clicking a task's ▶ injects its text into
// the focused terminal card (via the prompt's current send mode).
export default function TaskNote({ workspaceId }: { workspaceId: string }) {
  const tasks = useTasksStore((s) => s.tasks);
  const load = useTasksStore((s) => s.load);
  const add = useTasksStore((s) => s.add);
  const toggle = useTasksStore((s) => s.toggle);
  const setText = useTasksStore((s) => s.setText);
  const remove = useTasksStore((s) => s.remove);
  const move = useTasksStore((s) => s.move);

  const focused = useUiStore((s) => s.focusedSessionId);
  const sendMode = useUiStore((s) => s.sendMode);

  const [draft, setDraft] = useState("");

  useEffect(() => {
    void load(workspaceId);
  }, [load, workspaceId]);

  const inject = (text: string) => {
    if (!focused) return;
    void sendToPane(focused, text, sendMode);
  };

  return (
    <div className="note">
      <ul className="note-list">
        {tasks.map((t, i) => (
          <li key={t.id} className={"note-item" + (t.done ? " done" : "")}>
            <input
              type="checkbox"
              checked={t.done}
              onChange={() => toggle(t.id)}
              title="Done"
            />
            <input
              className="note-text"
              value={t.text}
              onChange={(e) => setText(t.id, e.target.value)}
            />
            <div className="note-actions">
              <button
                title="Send to focused card"
                disabled={!focused}
                onClick={() => inject(t.text)}
              >
                ▶
              </button>
              <button title="Move up" disabled={i === 0} onClick={() => move(t.id, -1)}>
                ↑
              </button>
              <button
                title="Move down"
                disabled={i === tasks.length - 1}
                onClick={() => move(t.id, 1)}
              >
                ↓
              </button>
              <button title="Delete" onClick={() => remove(t.id)}>
                ×
              </button>
            </div>
          </li>
        ))}
        {tasks.length === 0 && <li className="note-empty">No tasks yet.</li>}
      </ul>

      <form
        className="note-add"
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
          setDraft("");
        }}
      >
        <input
          placeholder="Add a task…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </form>
    </div>
  );
}
