import Terminal from "./components/Terminal";

// Phase 0 spike: hardcode the cwd. Point this anywhere to test a real repo.
const SPIKE_CWD = "/Users/arnavpuri/development/peti";
// Module-level constant so the array reference is stable across renders
// (otherwise Terminal's effect would re-run and re-spawn the PTY).
const SPIKE_ARGS: string[] = [];

export default function App() {
  return (
    <div className="app">
      <header className="titlebar">peti · phase 0 terminal spike</header>
      <Terminal cwd={SPIKE_CWD} command="claude" args={SPIKE_ARGS} />
    </div>
  );
}
