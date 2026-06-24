import { useEffect, useState } from "react";
import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  createLauncher,
  deleteWorkspace,
  exportWorkspace,
  getWorkspace,
  importWorkspace,
  openPeti,
  saveWorkspace,
  scanRepos,
  type PaneType,
} from "../lib/ipc";

interface PaneForm {
  label: string;
  path: string;
  type: PaneType;
  command: string;
  resume: boolean;
}

interface ScanRow {
  path: string;
  name: string;
  git: boolean;
  checked: boolean;
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
  const [scan, setScan] = useState<ScanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  const scanFolder = async () => {
    const dir = await open({ directory: true, title: "Scan a folder for repos" });
    if (typeof dir !== "string") return;
    const repos = await scanRepos(dir);
    setScan(repos.map((r) => ({ ...r, checked: r.git })));
  };

  const addScanned = () => {
    const picks = (scan ?? []).filter((s) => s.checked);
    setPanes((prev) => {
      // drop the lone empty starter pane
      const base = prev.length === 1 && !prev[0].path && !prev[0].label ? [] : prev;
      return [
        ...base,
        ...picks.map((p) => ({
          label: p.name,
          path: p.path,
          type: "claude" as PaneType,
          command: "",
          resume: false,
        })),
      ];
    });
    setScan(null);
  };

  const importFile = async () => {
    const f = await open({
      title: "Import a Peti TOML",
      filters: [{ name: "TOML", extensions: ["toml"] }],
    });
    if (typeof f !== "string") return;
    setBusy(true);
    try {
      const id = await importWorkspace(f);
      await openPeti(id);
      await getCurrentWindow().close();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  const exportFile = async () => {
    const dest = await saveDialog({
      title: "Export Peti",
      defaultPath: `${target}.toml`,
      filters: [{ name: "TOML", extensions: ["toml"] }],
    });
    if (typeof dest !== "string") return;
    try {
      await exportWorkspace(target, dest);
    } catch (e) {
      setError(String(e));
    }
  };

  const makeLauncher = async () => {
    const dir = await open({ directory: true, title: "Where to save the launcher app" });
    if (typeof dir !== "string") return;
    setError(null);
    setNotice(null);
    try {
      const path = await createLauncher(target, dir);
      setNotice(`Launcher created at ${path}. First time, macOS may ask to allow it.`);
    } catch (e) {
      setError(String(e));
    }
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

      <div className="editor-toolbar">
        <button type="button" onClick={scanFolder}>
          🔍 Scan folder…
        </button>
        {isNew ? (
          <button type="button" onClick={importFile}>
            ⬇ Import from file…
          </button>
        ) : (
          <>
            <button type="button" onClick={exportFile}>
              ⬆ Export…
            </button>
            <button type="button" onClick={makeLauncher}>
              🚀 Create launcher…
            </button>
          </>
        )}
      </div>

      {scan && (
        <div className="scan-panel">
          <div className="scan-head">
            <span>{scan.length} folders found — pick panes to add</span>
            <div>
              <button type="button" onClick={addScanned} disabled={!scan.some((s) => s.checked)}>
                Add selected
              </button>
              <button type="button" onClick={() => setScan(null)}>
                Cancel
              </button>
            </div>
          </div>
          <div className="scan-list">
            {scan.map((s, i) => (
              <label key={s.path} className="scan-row">
                <input
                  type="checkbox"
                  checked={s.checked}
                  onChange={(e) =>
                    setScan((prev) =>
                      (prev ?? []).map((r, j) => (j === i ? { ...r, checked: e.target.checked } : r)),
                    )
                  }
                />
                <span className="scan-name">{s.name}</span>
                {s.git && <span className="scan-git">git</span>}
              </label>
            ))}
            {scan.length === 0 && <div className="note-empty">No subfolders here.</div>}
          </div>
        </div>
      )}

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
              <option value="code">code</option>
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
      {notice && <div className="editor-notice">{notice}</div>}

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
