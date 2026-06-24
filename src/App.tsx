import { useEffect } from "react";
import Editor from "./components/Editor";
import Settings from "./components/Settings";
import PetiView from "./components/PetiView";
import { useSettingsStore } from "./stores/settingsStore";
import { applyTheme, watchSystemTheme } from "./lib/theme";

// Each window's role comes from its URL, set by the backend when it's opened:
//   ?peti=<id>   a Peti window      ?edit=<id|new>  the editor      ?settings
const params = new URLSearchParams(window.location.search);
const editTarget = params.get("edit");
const isSettings = params.has("settings");
const petiId = params.get("peti");

export default function App() {
  const loadSettings = useSettingsStore((s) => s.load);
  const theme = useSettingsStore((s) => s.settings.theme);

  // Every window loads settings + applies the theme (and tracks OS changes).
  useEffect(() => {
    void loadSettings();
    return watchSystemTheme(() => useSettingsStore.getState().settings.theme);
  }, [loadSettings]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  if (editTarget !== null) return <Editor target={editTarget} />;
  if (isSettings) return <Settings />;
  return <PetiView petiId={petiId} />;
}
