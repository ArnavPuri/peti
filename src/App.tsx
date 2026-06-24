import Editor from "./components/Editor";
import Settings from "./components/Settings";
import PetiView from "./components/PetiView";

// Each window's role comes from its URL, set by the backend when it's opened:
//   ?peti=<id>   a Peti window      ?edit=<id|new>  the editor      ?settings
const params = new URLSearchParams(window.location.search);
const editTarget = params.get("edit");
const isSettings = params.has("settings");
const petiId = params.get("peti");

export default function App() {
  if (editTarget !== null) return <Editor target={editTarget} />;
  if (isSettings) return <Settings />;
  return <PetiView petiId={petiId} />;
}
