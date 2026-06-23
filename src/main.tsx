import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// No StrictMode on purpose: its dev-only double mount/unmount would spawn and
// kill the PTY twice, which muddies the Phase 0 lifecycle we're trying to verify.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
