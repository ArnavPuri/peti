import { useEffect } from "react";
import Background from "./Background";
import BackgroundSwitcher from "./BackgroundSwitcher";
import FloatingCanvas from "./FloatingCanvas";
import PromptBar from "./PromptBar";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useSessionsStore } from "../stores/sessionsStore";
import { useUiStore } from "../stores/uiStore";
import { onSessionStatus, openEditor } from "../lib/ipc";
import { chime, ensureNotifyPermission, notify } from "../lib/alerts";

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

  // Track Claude activity; alert (notification + chime) when a card transitions
  // working -> awaiting (Claude finished and wants you). Only on a real
  // transition, so resuming an already-idle session doesn't ping.
  useEffect(() => {
    if (!workspace) return;
    void ensureNotifyPermission();
    let un: (() => void) | undefined;
    void onSessionStatus((p) => {
      const { activity, setActivity } = useSessionsStore.getState();
      const prev = activity[p.session_id];
      setActivity(p.session_id, p.state);
      if (p.state === "awaiting" && prev === "working") {
        if (useSettingsStore.getState().settings.alerts) {
          const idx = Number(p.session_id.split("::")[1]);
          const label = workspace.panes[idx]?.label ?? "Claude";
          notify(`${label} — ready`, `${workspace.name}: Claude is awaiting your input`);
          chime();
        }
      }
    }).then((u) => {
      un = u;
    });
    return () => un?.();
  }, [workspace]);

  if (!petiId) {
    return (
      <div className="empty-stage">
        <p>No Peti open yet.</p>
        <button className="btn-primary empty-new" onClick={() => void openEditor("new")}>
          ＋ New Peti
        </button>
        <p className="settings-note">…or pick one from the Peti menu.</p>
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
      <BackgroundSwitcher />
      <PromptBar workspace={workspace} />
    </div>
  );
}
