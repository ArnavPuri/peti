import Switcher from "./components/Switcher";
import PaneGrid from "./components/PaneGrid";
import { useWorkspacesStore } from "./stores/workspacesStore";

export default function App() {
  const active = useWorkspacesStore((s) => s.activeWorkspace);

  return (
    <div className="app">
      <Switcher />
      <main className="stage">
        {active ? (
          // key by id so switching remounts the grid with the new panes/sizes
          <PaneGrid key={active.id} workspace={active} />
        ) : (
          <div className="empty-stage">Select a workspace to open its panes.</div>
        )}
      </main>
    </div>
  );
}
