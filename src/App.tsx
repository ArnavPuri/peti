import { useEffect } from "react";
import Background from "./components/Background";
import FloatingCanvas from "./components/FloatingCanvas";
import { useWorkspaceStore } from "./stores/workspaceStore";

// Which Peti this window is, from `index.html?peti=<id>` set by the backend.
const petiId = new URLSearchParams(window.location.search).get("peti");

export default function App() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const error = useWorkspaceStore((s) => s.error);
  const load = useWorkspaceStore((s) => s.load);

  useEffect(() => {
    if (petiId) void load(petiId);
  }, [load]);

  if (!petiId) {
    return (
      <div className="empty-stage">
        No Peti selected. Add a workspace TOML, then open it from the <b>Peti</b> menu.
      </div>
    );
  }
  if (error) {
    return (
      <div className="empty-stage">
        Failed to load “{petiId}”:<br />
        {error}
      </div>
    );
  }
  if (!workspace) {
    return <div className="empty-stage">Opening {petiId}…</div>;
  }

  return (
    <div className="peti">
      <Background workspace={workspace} />
      <FloatingCanvas workspace={workspace} />
    </div>
  );
}
