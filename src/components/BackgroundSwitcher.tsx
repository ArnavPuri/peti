import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { PRESETS, accentGradient } from "../lib/backgrounds";

// A small in-Peti control to swap the background live (presets / own image /
// accent gradient) without opening the editor. Persisted via the store.
export default function BackgroundSwitcher() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const setBackground = useWorkspaceStore((s) => s.setBackground);
  const [open_, setOpen] = useState(false);

  if (!workspace) return null;
  const accent = workspace.accent ?? "#5cd6ae";
  const current = workspace.background ?? "";

  const pick = (spec: string) => {
    setBackground(spec);
    setOpen(false);
  };

  const pickImage = async () => {
    const f = await open({
      title: "Choose a background image",
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (typeof f === "string") pick(f);
  };

  return (
    <div className="bgswitch">
      {open_ && (
        <div className="bgswitch-pop">
          <div className="bgswitch-grid">
            <button
              className={"bgswitch-swatch" + (current === "" ? " active" : "")}
              style={{ background: accentGradient(accent) }}
              title="Accent gradient"
              onClick={() => pick("")}
            />
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={"bgswitch-swatch" + (current === `preset:${p.id}` ? " active" : "")}
                style={{ background: p.css }}
                title={p.label}
                onClick={() => pick(`preset:${p.id}`)}
              />
            ))}
          </div>
          <button className="bgswitch-image" onClick={pickImage}>
            Choose image…
          </button>
        </div>
      )}
      <button
        className="bgswitch-btn"
        title="Change background"
        onClick={() => setOpen((o) => !o)}
      >
        🖼
      </button>
    </div>
  );
}
