import { useEffect } from "react";
import Background from "./Background";
import FloatingCanvas from "./FloatingCanvas";
import PromptBar from "./PromptBar";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";

// A single self-contained Peti window.
export default function PetiView({ petiId }: { petiId: string | null }) {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const error = useWorkspaceStore((s) => s.error);
  const load = useWorkspaceStore((s) => s.load);
  const loadSettings = useSettingsStore((s) => s.load);
  const settings = useSettingsStore((s) => s.settings);
  const setSendMode = useUiStore((s) => s.setSendMode);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (petiId) void load(petiId);
  }, [load, petiId]);

  // Seed the prompt bar's mode from the app default.
  useEffect(() => {
    setSendMode(settings.send_mode === "send" ? "send" : "insert");
  }, [settings.send_mode, setSendMode]);

  if (!petiId) {
    return (
      <div className="empty-stage">
        No Peti selected. Create one from the <b>Peti ▸ New Peti…</b> menu.
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
      <PromptBar workspace={workspace} />
    </div>
  );
}
