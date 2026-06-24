import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  deleteWorkspace,
  getWorkspace,
  openPeti,
  saveWorkspace,
  type PaneType,
} from "../lib/ipc";

interface PaneForm {
  label: string;
  path: string;
  type: PaneType;
  command: string;
  resume: boolean;
}

const blankPane = (): PaneForm => ({
  label: "",
  path: "",
  type: "claude",
  command: "",
  resume: false,
});

export default function Editor({ target }: { target: string }) {
  const isNew = target === "new";
  const [name, setName] = useState("");
  const [accent, setAccent] = useState("#5cd6ae");
  const [background, setBackground] = useState("");
  const [panes, setPanes] = useState<PaneForm[]>([blankPane()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    void (async () => {
      try {
        const ws = await getWorkspace(target);
        setName(ws.name);
        setAccent(ws.accent ?? "#5cd6ae");
        setBackground(ws.background ?? "");
        setPanes(
          ws.panes.map((p) => ({
            label: p.label,
            path: p.path,
            type: p.type,
            command: p.command ?? "",
            resume: p.resume,
          })),
        );
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [isNew, target]);

  const setPane = (i: number, patch: Partial<PaneForm>) =>
    setPanes((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const pickFolder = async (i: number) => {
    const picked = await open({ directory: true, title: "Choose repo folder" });
    if (typeof picked === "string") setPane(i, { path: picked });
  };

  const pickBackground = async () => {
    const picked = await open({
      title: "Choose a background image",
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (typeof picked === "string") setBackground(picked);
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError("Give the Peti a name.");
    const usable = panes.filter((p) => p.path.trim());
    if (usable.length === 0) return setError("Add at least one pane with a folder.");

    setBusy(true);
    try {
      const id = await saveWorkspace({
        id: isNew ? name : target,
        name: name.trim(),
        accent: accent.trim() || null,
        background: background.trim() || null,
        panes: usable.map((p) => ({
          label: p.label.trim() || p.path.split("/").pop() || "pane",
          path: p.path.trim(),
          type: p.type,
          command: p.command.trim() || null,
          resume: p.resume,
        })),
      });
      await openPeti(id);
      await getCurrentWindow().close();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (isNew) return getCurrentWindow().close();
    setBusy(true);
    try {
      await deleteWorkspace(target);
      await getCurrentWindow().close();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <div className="editor">
      <h1>{isNew ? "New Peti" : `Edit · ${name || target}`}</h1>

      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Chanakya AI" />
      </label>

      <div className="field-row">
        <label className="field field-accent">
          <span>Accent</span>
          <div className="accent-input">
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
            <input value={accent} onChange={(e) => setAccent(e.target.value)} />
          </div>
        </label>
        <label className="field field-grow">
          <span>Background image</span>
          <div className="path-input">
            <input
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              placeholder="(optional) — accent gradient if empty"
            />
            <button type="button" onClick={pickBackground}>
              Pick…
            </button>
          </div>
        </label>
      </div>

      <div className="panes">
        <div className="panes-head">
          <span>Panes</span>
          <button type="button" onClick={() => setPanes((p) => [...p, blankPane()])}>
            + Add pane
          </button>
        </div>

        {panes.map((p, i) => (
          <div className="pane-row" key={i}>
            <input
              className="pane-label"
              value={p.label}
              onChange={(e) => setPane(i, { label: e.target.value })}
              placeholder="label"
            />
            <div className="path-input pane-path">
              <input
                value={p.path}
                onChange={(e) => setPane(i, { path: e.target.value })}
                placeholder="~/dev/repo"
              />
              <button type="button" onClick={() => pickFolder(i)}>
                📁
              </button>
            </div>
            <select
              value={p.type}
              onChange={(e) => setPane(i, { type: e.target.value as PaneType })}
            >
              <option value="claude">claude</option>
              <option value="shell">shell</option>
            </select>
            <input
              className="pane-command"
              value={p.command}
              onChange={(e) => setPane(i, { command: e.target.value })}
              placeholder={p.type === "shell" ? "bash" : "claude"}
            />
            <label className="pane-resume" title="Spawn with --continue">
              <input
                type="checkbox"
                checked={p.resume}
                disabled={p.type !== "claude"}
                onChange={(e) => setPane(i, { resume: e.target.checked })}
              />
              resume
            </label>
            <button
              type="button"
              className="pane-del"
              title="Remove pane"
              onClick={() => setPanes((prev) => prev.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {error && <div className="editor-error">{error}</div>}

      <div className="editor-actions">
        <button type="button" className="btn-danger" onClick={remove} disabled={busy}>
          {isNew ? "Cancel" : "Delete"}
        </button>
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save & Open"}
        </button>
      </div>
    </div>
  );
}
