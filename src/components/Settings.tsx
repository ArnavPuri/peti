import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getSettings, saveSettings, type AppSettings } from "../lib/ipc";
import { applyTheme } from "../lib/theme";

const PERMISSION_MODES = ["", "default", "acceptEdits", "plan", "bypassPermissions"];

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>({
    send_mode: "insert",
    default_model: "",
    permission_mode: "",
    alerts: true,
    theme: "dark",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setSettings(await getSettings());
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  const patch = (p: Partial<AppSettings>) => setSettings((s) => ({ ...s, ...p }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveSettings(settings);
      await getCurrentWindow().close();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <div className="editor settings">
      <h1>Settings</h1>
      <p className="settings-note">
        Applied to newly spawned panes. Per-pane commands override these.
      </p>

      <label className="field">
        <span>Default send mode</span>
        <select
          value={settings.send_mode}
          onChange={(e) => patch({ send_mode: e.target.value as AppSettings["send_mode"] })}
        >
          <option value="insert">Insert (paste, you press Enter)</option>
          <option value="send">Send (paste + submit)</option>
        </select>
      </label>

      <label className="field">
        <span>Default model (claude --model)</span>
        <input
          value={settings.default_model}
          onChange={(e) => patch({ default_model: e.target.value })}
          placeholder="(empty) — e.g. opus, sonnet"
        />
      </label>

      <label className="field">
        <span>Permission mode (claude --permission-mode)</span>
        <select
          value={settings.permission_mode}
          onChange={(e) => patch({ permission_mode: e.target.value })}
        >
          {PERMISSION_MODES.map((m) => (
            <option key={m} value={m}>
              {m === "" ? "(unset)" : m}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Theme</span>
        <select
          value={settings.theme}
          onChange={(e) => {
            const theme = e.target.value as AppSettings["theme"];
            patch({ theme });
            applyTheme(theme); // live preview
          }}
        >
          <option value="system">System</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>

      <label className="field field-check">
        <input
          type="checkbox"
          checked={settings.alerts}
          onChange={(e) => patch({ alerts: e.target.checked })}
        />
        <span>Alert me (notification + chime) when a Claude card awaits my input</span>
      </label>

      {error && <div className="editor-error">{error}</div>}

      <div className="editor-actions">
        <button type="button" onClick={() => getCurrentWindow().close()} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
