import { useEffect } from "react";
import { useWorkspacesStore } from "../stores/workspacesStore";

export default function Switcher() {
  const summaries = useWorkspacesStore((s) => s.summaries);
  const activeId = useWorkspacesStore((s) => s.activeId);
  const error = useWorkspacesStore((s) => s.error);
  const loadList = useWorkspacesStore((s) => s.loadList);
  const open = useWorkspacesStore((s) => s.open);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  return (
    <aside className="switcher">
      <div className="switcher-title">peti</div>

      {summaries.length === 0 && (
        <div className="switcher-empty">No workspaces yet.</div>
      )}

      <ul className="switcher-list">
        {summaries.map((w) => (
          <li key={w.id}>
            <button
              className={"switcher-item" + (w.id === activeId ? " active" : "")}
              onClick={() => void open(w.id)}
            >
              <span className="dot" style={{ background: w.accent ?? "#5cd6ae" }} />
              <span className="switcher-name">{w.name}</span>
              <span className="switcher-count">{w.pane_count}</span>
            </button>
          </li>
        ))}
      </ul>

      {error && <div className="switcher-error">{error}</div>}
    </aside>
  );
}
