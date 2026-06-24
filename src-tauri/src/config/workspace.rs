//! Workspace loading: human-authored TOML in, resolved `Workspace` out.
//!
//! Two sources, one list path: global `workspaces/*.toml` plus in-repo
//! `.peti/workspace.toml` files registered as pointers in `registry.json`.
//! Floating-card geometry lives in app-managed `<id>.layout.json`; the TOML is
//! never machine-written.

use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::{config_root, expand_tilde, registry_path, workspaces_dir};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum PaneType {
    #[default]
    Claude,
    Shell,
    Code,
}

/// Authored starting geometry on a `[[pane]]` (fractions of the canvas).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RectToml {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaneDef {
    pub label: String,
    pub path: String,
    #[serde(rename = "type", default)]
    pub pane_type: PaneType,
    #[serde(default)]
    pub command: Option<String>,
    /// When true (claude panes), spawn with `--continue` to resume the last
    /// session in this dir.
    #[serde(default)]
    pub resume: bool,
    #[serde(default)]
    pub rect: Option<RectToml>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceMeta {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub background: Option<String>,
    #[serde(default)]
    pub accent: Option<String>,
}

/// Mirrors the on-disk TOML: `[workspace]` + `[[pane]]`.
#[derive(Debug, Clone, Deserialize)]
struct WorkspaceFile {
    workspace: WorkspaceMeta,
    #[serde(default)]
    pane: Vec<PaneDef>,
}

/// Live floating-card geometry (fractions of the canvas; `z` is stacking order).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub z: i32,
}

/// Fully resolved workspace handed to a Peti window.
#[derive(Debug, Clone, Serialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub background: Option<String>, // resolved to an absolute path
    pub accent: Option<String>,
    pub panes: Vec<PaneDef>,
    pub rects: Vec<Rect>, // aligned with `panes` by index
    pub note: Rect,       // geometry of the floating task note
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceSummary {
    pub id: String,
    pub name: String,
    pub accent: Option<String>,
    pub background: Option<String>,
    pub pane_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PointerEntry {
    id: String,
    path: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct LayoutJson {
    #[serde(default)]
    panes: Vec<Rect>,
    #[serde(default)]
    note: Option<Rect>,
    /// Live background override (wins over the TOML's authored background).
    /// "" = accent gradient, "preset:<id>" = bundled gradient, else an image path.
    #[serde(default)]
    background: Option<String>,
}

fn default_note_rect() -> Rect {
    // Top-right by default, like the reference shot's agenda note.
    Rect { x: 0.66, y: 0.08, w: 0.30, h: 0.42, z: 100 }
}

// ---- pure helpers (unit-tested) -------------------------------------------

fn parse_workspace_file(contents: &str) -> Result<WorkspaceFile, String> {
    toml::from_str(contents).map_err(|e| e.to_string())
}

/// Stagger panes that have no authored/live geometry so they don't stack
/// exactly on top of each other.
fn cascade_rect(i: usize) -> Rect {
    let k = i as f64;
    let step = 0.045;
    Rect {
        x: (0.05 + k * step).min(0.4),
        y: (0.06 + k * step).min(0.4),
        w: 0.46,
        h: 0.52,
        z: (i + 1) as i32,
    }
}

/// Resolution order: live JSON (if it covers every pane) → authored `rect` →
/// auto-cascade.
fn resolve_rects(file: &WorkspaceFile, live: Option<Vec<Rect>>) -> Vec<Rect> {
    let n = file.pane.len();
    if let Some(r) = live {
        if r.len() == n && n > 0 {
            return r;
        }
    }
    file.pane
        .iter()
        .enumerate()
        .map(|(i, p)| match &p.rect {
            Some(rt) => Rect {
                x: rt.x,
                y: rt.y,
                w: rt.w,
                h: rt.h,
                z: (i + 1) as i32,
            },
            None => cascade_rect(i),
        })
        .collect()
}

/// Resolve a background spec. "" -> None (accent gradient); "preset:<id>" passes
/// through; otherwise it's an image path resolved to absolute.
fn resolve_background(raw: Option<&str>) -> Option<String> {
    let raw = raw?.trim();
    if raw.is_empty() {
        return None;
    }
    if raw.starts_with("preset:") || raw.starts_with("wallpaper:") {
        return Some(raw.to_string());
    }
    let expanded = expand_tilde(raw);
    let path = if expanded.is_absolute() {
        expanded
    } else {
        match config_root() {
            Ok(root) => root.join(expanded),
            Err(_) => expanded,
        }
    };
    Some(path.to_string_lossy().into_owned())
}

// ---- filesystem-facing ----------------------------------------------------

/// All workspaces, global first then pointers. Duplicate ids: first (global)
/// wins, later ones are skipped.
fn all_workspace_files() -> Vec<WorkspaceFile> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    if let Ok(dir) = workspaces_dir() {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("toml") {
                    continue;
                }
                if let Ok(contents) = fs::read_to_string(&path) {
                    if let Ok(file) = parse_workspace_file(&contents) {
                        if seen.insert(file.workspace.id.clone()) {
                            out.push(file);
                        }
                    }
                }
            }
        }
    }

    for ptr in read_registry() {
        if let Ok(contents) = fs::read_to_string(&ptr.path) {
            if let Ok(file) = parse_workspace_file(&contents) {
                if seen.insert(file.workspace.id.clone()) {
                    out.push(file);
                } else {
                    eprintln!("peti: skipping pointer with duplicate id {}", ptr.id);
                }
            }
        }
    }

    out.sort_by(|a, b| a.workspace.name.to_lowercase().cmp(&b.workspace.name.to_lowercase()));
    out
}

fn layout_path(id: &str) -> Result<PathBuf, String> {
    Ok(workspaces_dir()?.join(format!("{id}.layout.json")))
}

fn read_layout_json(id: &str) -> LayoutJson {
    let Ok(path) = layout_path(id) else {
        return LayoutJson::default();
    };
    fs::read_to_string(path)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_default()
}

fn write_layout_json(id: &str, layout: &LayoutJson) -> Result<(), String> {
    super::ensure_dirs()?;
    let json = serde_json::to_string_pretty(layout).map_err(|e| e.to_string())?;
    fs::write(layout_path(id)?, json).map_err(|e| e.to_string())
}

fn read_registry() -> Vec<PointerEntry> {
    let Ok(path) = registry_path() else {
        return vec![];
    };
    let Ok(contents) = fs::read_to_string(path) else {
        return vec![];
    };
    serde_json::from_str(&contents).unwrap_or_default()
}

pub fn list_workspaces() -> Vec<WorkspaceSummary> {
    all_workspace_files()
        .into_iter()
        .map(|file| WorkspaceSummary {
            id: file.workspace.id,
            name: file.workspace.name,
            accent: file.workspace.accent,
            background: file.workspace.background,
            pane_count: file.pane.len(),
        })
        .collect()
}

pub fn get_workspace(id: &str) -> Result<Workspace, String> {
    let file = all_workspace_files()
        .into_iter()
        .find(|f| f.workspace.id == id)
        .ok_or_else(|| format!("workspace not found: {id}"))?;

    let layout = read_layout_json(id);
    let live = if layout.panes.is_empty() {
        None
    } else {
        Some(layout.panes.clone())
    };
    let rects = resolve_rects(&file, live);
    let note = layout.note.unwrap_or_else(default_note_rect);
    // Live override (layout.json) wins over the authored TOML background.
    let bg_spec = layout
        .background
        .as_deref()
        .or(file.workspace.background.as_deref());
    let background = resolve_background(bg_spec);

    Ok(Workspace {
        id: file.workspace.id,
        name: file.workspace.name,
        background,
        accent: file.workspace.accent,
        panes: file.pane,
        rects,
        note,
    })
}

/// Persist pane geometry, preserving the saved note rect.
pub fn save_layout(id: &str, panes: Vec<Rect>) -> Result<(), String> {
    let mut layout = read_layout_json(id);
    layout.panes = panes;
    write_layout_json(id, &layout)
}

/// Persist the note geometry, preserving the saved pane rects.
pub fn save_note_rect(id: &str, note: Rect) -> Result<(), String> {
    let mut layout = read_layout_json(id);
    layout.note = Some(note);
    write_layout_json(id, &layout)
}

/// Set the live background override ("" / "preset:<id>" / image path).
pub fn save_background(id: &str, spec: String) -> Result<(), String> {
    let mut layout = read_layout_json(id);
    layout.background = Some(spec);
    write_layout_json(id, &layout)
}

/// Drop the live override so the TOML's authored background takes over again.
pub fn clear_background_override(id: &str) -> Result<(), String> {
    let mut layout = read_layout_json(id);
    if layout.background.is_some() {
        layout.background = None;
        write_layout_json(id, &layout)?;
    }
    Ok(())
}

// ---- create / edit / delete (in-app editor) -------------------------------

/// Input from the editor form. Serializes straight to the on-disk TOML shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaneInput {
    pub label: String,
    pub path: String,
    #[serde(rename = "type", default)]
    pub pane_type: PaneType,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub command: Option<String>,
    #[serde(default)]
    pub resume: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkspaceInput {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub accent: Option<String>,
    #[serde(default)]
    pub background: Option<String>,
    pub panes: Vec<PaneInput>,
}

#[derive(Serialize)]
struct MetaWrite {
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    background: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    accent: Option<String>,
}

#[derive(Serialize)]
struct WorkspaceWrite {
    workspace: MetaWrite,
    #[serde(rename = "pane")]
    panes: Vec<PaneInput>,
}

fn sanitize_id(raw: &str) -> Result<String, String> {
    let id: String = raw
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    let id = id.trim_matches('-').to_string();
    if id.is_empty() {
        return Err("workspace id/name must contain at least one letter or digit".into());
    }
    Ok(id)
}

/// Render an editor input to (sanitized id, TOML string). Pure — no fs.
fn render_workspace_toml(input: WorkspaceInput) -> Result<(String, String), String> {
    let id = sanitize_id(&input.id)?;
    let empty = |s: &Option<String>| s.as_ref().map(|v| v.trim().is_empty()).unwrap_or(true);
    let doc = WorkspaceWrite {
        workspace: MetaWrite {
            id: id.clone(),
            name: input.name.trim().to_string(),
            background: if empty(&input.background) { None } else { input.background },
            accent: if empty(&input.accent) { None } else { input.accent },
        },
        panes: input.panes,
    };
    let toml = toml::to_string_pretty(&doc).map_err(|e| e.to_string())?;
    Ok((id, toml))
}

/// Write a global workspace TOML from the editor. Returns the (sanitized) id.
pub fn save_workspace(input: WorkspaceInput) -> Result<String, String> {
    super::ensure_dirs()?;
    let (id, toml) = render_workspace_toml(input)?;
    fs::write(workspaces_dir()?.join(format!("{id}.toml")), toml).map_err(|e| e.to_string())?;
    Ok(id)
}

/// Locate the source TOML for a workspace (global file, else a pointer path).
fn source_path(id: &str) -> Option<PathBuf> {
    let global = workspaces_dir().ok()?.join(format!("{id}.toml"));
    if global.exists() {
        return Some(global);
    }
    read_registry()
        .into_iter()
        .find(|e| e.id == id)
        .map(|e| PathBuf::from(e.path))
}

/// Copy a workspace's TOML to a chosen path (verbatim — keeps comments).
pub fn export_workspace(id: &str, dest: String) -> Result<(), String> {
    let src = source_path(id).ok_or_else(|| format!("no TOML found for {id}"))?;
    let content = fs::read_to_string(&src).map_err(|e| e.to_string())?;
    fs::write(&dest, content).map_err(|e| e.to_string())
}

/// Import a workspace TOML from a chosen file into the global registry.
pub fn import_workspace(src: String) -> Result<String, String> {
    let content = fs::read_to_string(&src).map_err(|e| format!("cannot read {src}: {e}"))?;
    let file = parse_workspace_file(&content)?; // validate + grab id
    let id = sanitize_id(&file.workspace.id)?;
    super::ensure_dirs()?;
    fs::write(workspaces_dir()?.join(format!("{id}.toml")), content).map_err(|e| e.to_string())?;
    Ok(id)
}

/// Delete a global workspace and its app-managed sidecars; drop any pointer.
pub fn delete_workspace(id: &str) -> Result<(), String> {
    let dir = workspaces_dir()?;
    for suffix in ["toml", "layout.json", "tasks.json"] {
        let _ = fs::remove_file(dir.join(format!("{id}.{suffix}")));
    }
    let entries: Vec<PointerEntry> = read_registry().into_iter().filter(|e| e.id != id).collect();
    if let Ok(path) = registry_path() {
        let _ = fs::write(
            path,
            serde_json::to_string_pretty(&entries).unwrap_or_else(|_| "[]".into()),
        );
    }
    Ok(())
}

/// Register an in-repo `.peti/workspace.toml` by absolute path. Validates that
/// it parses (and grabs its id) before recording the pointer.
pub fn add_workspace_pointer(path: String) -> Result<(), String> {
    super::ensure_dirs()?;
    let contents = fs::read_to_string(&path).map_err(|e| format!("cannot read {path}: {e}"))?;
    let file = parse_workspace_file(&contents)?;

    let mut entries = read_registry();
    if entries.iter().any(|e| e.path == path) {
        return Ok(());
    }
    entries.push(PointerEntry {
        id: file.workspace.id,
        path,
    });
    let json = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    fs::write(registry_path()?, json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r##"
[workspace]
id = "demo"
name = "Demo"
accent = "#5CD6AE"

[[pane]]
label = "api"
path = "~/dev/api"
type = "claude"
rect = { x = 0.1, y = 0.2, w = 0.4, h = 0.5 }

[[pane]]
label = "web"
path = "~/dev/web"
type = "shell"
command = "zsh"
"##;

    #[test]
    fn parses_workspace_with_panes() {
        let f = parse_workspace_file(SAMPLE).unwrap();
        assert_eq!(f.workspace.id, "demo");
        assert_eq!(f.workspace.accent.as_deref(), Some("#5CD6AE"));
        assert_eq!(f.pane.len(), 2);
        assert_eq!(f.pane[0].pane_type, PaneType::Claude);
        assert_eq!(f.pane[1].pane_type, PaneType::Shell);
        assert_eq!(f.pane[1].command.as_deref(), Some("zsh"));
    }

    #[test]
    fn pane_type_defaults_to_claude() {
        let toml = "[workspace]\nid='x'\nname='X'\n[[pane]]\nlabel='a'\npath='/tmp'\n";
        let f = parse_workspace_file(toml).unwrap();
        assert_eq!(f.pane[0].pane_type, PaneType::Claude);
        assert!(f.pane[0].command.is_none());
        assert!(f.pane[0].rect.is_none());
    }

    #[test]
    fn authored_rect_used_with_index_z() {
        let f = parse_workspace_file(SAMPLE).unwrap();
        let rects = resolve_rects(&f, None);
        assert_eq!(rects[0], Rect { x: 0.1, y: 0.2, w: 0.4, h: 0.5, z: 1 });
        // pane 1 has no authored rect -> cascade, with z = 2
        assert_eq!(rects[1].z, 2);
    }

    #[test]
    fn live_layout_wins_when_pane_count_matches() {
        let f = parse_workspace_file(SAMPLE).unwrap();
        let live = vec![
            Rect { x: 0.0, y: 0.0, w: 0.5, h: 0.5, z: 5 },
            Rect { x: 0.5, y: 0.0, w: 0.5, h: 0.5, z: 6 },
        ];
        assert_eq!(resolve_rects(&f, Some(live.clone())), live);
    }

    #[test]
    fn mismatched_live_layout_ignored() {
        let f = parse_workspace_file(SAMPLE).unwrap();
        // 1 live rect but 2 panes -> ignore live, use authored/cascade
        let rects = resolve_rects(&f, Some(vec![Rect { x: 0.0, y: 0.0, w: 1.0, h: 1.0, z: 1 }]));
        assert_eq!(rects.len(), 2);
        assert_eq!(rects[0].x, 0.1); // authored
    }

    #[test]
    fn cascade_staggers_and_orders_z() {
        let toml = "[workspace]\nid='x'\nname='X'\n\
                    [[pane]]\nlabel='a'\npath='/a'\n\
                    [[pane]]\nlabel='b'\npath='/b'\n";
        let f = parse_workspace_file(toml).unwrap();
        let rects = resolve_rects(&f, None);
        assert_eq!(rects.len(), 2);
        assert!(rects[1].x > rects[0].x);
        assert_eq!(rects[0].z, 1);
        assert_eq!(rects[1].z, 2);
    }

    #[test]
    fn rejects_invalid_toml() {
        assert!(parse_workspace_file("not = [valid").is_err());
    }

    #[test]
    fn sanitize_id_slugs_and_rejects_empty() {
        assert_eq!(sanitize_id("Chanakya AI!").unwrap(), "chanakya-ai");
        assert!(sanitize_id("  ").is_err());
        assert!(sanitize_id("***").is_err());
    }

    #[test]
    fn editor_output_round_trips() {
        let input = WorkspaceInput {
            id: "My Cool Peti".into(),
            name: "My Cool Peti".into(),
            accent: Some("#5CD6AE".into()),
            background: None, // omitted -> absent in TOML
            panes: vec![
                PaneInput {
                    label: "api".into(),
                    path: "~/dev/api".into(),
                    pane_type: PaneType::Claude,
                    command: None,
                    resume: true,
                },
                PaneInput {
                    label: "sh".into(),
                    path: "~/dev".into(),
                    pane_type: PaneType::Shell,
                    command: Some("zsh".into()),
                    resume: false,
                },
            ],
        };
        let (id, toml) = render_workspace_toml(input).unwrap();
        assert_eq!(id, "my-cool-peti");

        let parsed = parse_workspace_file(&toml).unwrap();
        assert_eq!(parsed.workspace.id, "my-cool-peti");
        assert_eq!(parsed.workspace.background, None);
        assert_eq!(parsed.pane.len(), 2);
        assert!(parsed.pane[0].resume);
        assert_eq!(parsed.pane[1].pane_type, PaneType::Shell);
        assert_eq!(parsed.pane[1].command.as_deref(), Some("zsh"));
    }
}
