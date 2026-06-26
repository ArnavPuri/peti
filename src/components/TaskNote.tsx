import { useEffect, useState } from "react";
import { useTasksStore } from "../stores/tasksStore";
import { useUiStore } from "../stores/uiStore";
import { sendToPane } from "../lib/send";
import type { Task } from "../lib/ipc";

// Contents of the floating plan note: a project description, a pinned "Next up"
// group, and the task list. Clicking a task's ▶ injects its text into the
// focused terminal card. Edits mirror to each Claude pane's .peti/PLAN.md.
export default function TaskNote({ workspaceId }: { workspaceId: string }) {
  const description = useTasksStore((s) => s.description);
  const tasks = useTasksStore((s) => s.tasks);
  const load = useTasksStore((s) => s.load);
  const setDescription = useTasksStore((s) => s.setDescription);
  const add = useTasksStore((s) => s.add);
  const toggle = useTasksStore((s) => s.toggle);
  const setText = useTasksStore((s) => s.setText);
  const remove = useTasksStore((s) => s.remove);
  const move = useTasksStore((s) => s.move);
  const setPriority = useTasksStore((s) => s.setPriority);
  const toggleNextUp = useTasksStore((s) => s.toggleNextUp);
  const addLabel = useTasksStore((s) => s.addLabel);
  const removeLabel = useTasksStore((s) => s.removeLabel);

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

  const nextUp = tasks.filter((t) => t.nextUp && !t.done);

  return (
    <div className="note">
      <textarea
        className="note-desc"
        placeholder="Project description — what & why…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      {nextUp.length > 0 && (
        <div className="note-section">
          <div className="note-section-title">Next up</div>
          <ul className="note-list note-list-next">
            {nextUp.map((t) => (
              <li key={t.id} className="note-item">
                <span className="note-pri" data-pri={t.priority}>
                  P{t.priority}
                </span>
                <span className="note-text-static">{t.text}</span>
                <div className="note-actions">
                  <button
                    title="Send to focused card"
                    disabled={!focused}
                    onClick={() => inject(t.text)}
                  >
                    ▶
                  </button>
                  <button title="Unpin from Next up" onClick={() => toggleNextUp(t.id)}>
                    ★
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="note-list">
        {tasks.map((t, i) => (
          <TaskRow
            key={t.id}
            task={t}
            first={i === 0}
            last={i === tasks.length - 1}
            focused={!!focused}
            onToggle={() => toggle(t.id)}
            onText={(v) => setText(t.id, v)}
            onSend={() => inject(t.text)}
            onUp={() => move(t.id, -1)}
            onDown={() => move(t.id, 1)}
            onRemove={() => remove(t.id)}
            onCyclePriority={() => setPriority(t.id, t.priority >= 3 ? 1 : t.priority + 1)}
            onToggleNextUp={() => toggleNextUp(t.id)}
            onAddLabel={(label) => addLabel(t.id, label)}
            onRemoveLabel={(label) => removeLabel(t.id, label)}
          />
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

function TaskRow({
  task,
  first,
  last,
  focused,
  onToggle,
  onText,
  onSend,
  onUp,
  onDown,
  onRemove,
  onCyclePriority,
  onToggleNextUp,
  onAddLabel,
  onRemoveLabel,
}: {
  task: Task;
  first: boolean;
  last: boolean;
  focused: boolean;
  onToggle: () => void;
  onText: (v: string) => void;
  onSend: () => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  onCyclePriority: () => void;
  onToggleNextUp: () => void;
  onAddLabel: (label: string) => void;
  onRemoveLabel: (label: string) => void;
}) {
  const [tag, setTag] = useState("");
  return (
    <li className={"note-item" + (task.done ? " done" : "")}>
      <input type="checkbox" checked={task.done} onChange={onToggle} title="Done" />
      <button
        className="note-pri"
        data-pri={task.priority}
        title="Cycle priority"
        onClick={onCyclePriority}
      >
        P{task.priority}
      </button>
      <input className="note-text" value={task.text} onChange={(e) => onText(e.target.value)} />
      <div className="note-actions">
        <button
          title={task.nextUp ? "Unpin from Next up" : "Pin to Next up"}
          className={task.nextUp ? "active" : ""}
          onClick={onToggleNextUp}
        >
          ★
        </button>
        <button title="Send to focused card" disabled={!focused} onClick={onSend}>
          ▶
        </button>
        <button title="Move up" disabled={first} onClick={onUp}>
          ↑
        </button>
        <button title="Move down" disabled={last} onClick={onDown}>
          ↓
        </button>
        <button title="Delete" onClick={onRemove}>
          ×
        </button>
      </div>
      <div className="note-labels">
        {task.labels.map((l) => (
          <button
            key={l}
            className="note-label"
            title="Remove label"
            onClick={() => onRemoveLabel(l)}
          >
            #{l} ×
          </button>
        ))}
        <input
          className="note-label-add"
          placeholder="+tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAddLabel(tag);
              setTag("");
            }
          }}
        />
      </div>
    </li>
  );
}
