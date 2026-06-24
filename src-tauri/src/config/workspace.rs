//! Workspace loading: human-authored TOML in, resolved `Workspace` out.
//!
//! Two sources, one list path: global `workspaces/*.toml` plus in-repo
//! `.peti/workspace.toml` files registered as pointers in `registry.json`.
//! Pane sizes live in app-managed `<id>.layout.json`; the TOML is never
//! machine-written.

use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::{registry_path, workspaces_dir};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum PaneType {
    #[default]
    Claude,
    Shell,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaneDef {
    pub label: String,
    pub path: String,
    #[serde(rename = "type", default)]
    pub pane_type: PaneType,
    #[serde(default)]
    pub command: Option<String>,
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

#[derive(Debug, Clone, Deserialize)]
struct LayoutToml {
    #[serde(default)]
    sizes: Vec<f64>,
}

/// Mirrors the on-disk TOML: `[workspace]`, `[[pane]]`, optional `[layout]`.
#[derive(Debug, Clone, Deserialize)]
struct WorkspaceFile {
    workspace: WorkspaceMeta,
    #[serde(default)]
    pane: Vec<PaneDef>,
    #[serde(default)]
    layout: Option<LayoutToml>,
}

/// Fully resolved workspace handed to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub background: Option<String>,
    pub accent: Option<String>,
    pub panes: Vec<PaneDef>,
    pub sizes: Vec<f64>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LayoutJson {
    sizes: Vec<f64>,
}

// ---- pure helpers (unit-tested) -------------------------------------------

fn parse_workspace_file(contents: &str) -> Result<WorkspaceFile, String> {
    toml::from_str(contents).map_err(|e| e.to_string())
}

fn equal_sizes(n: usize) -> Vec<f64> {
    if n == 0 {
        return vec![];
    }
    vec![1.0 / n as f64; n]
}

/// Read order: live JSON sizes (if pane count matches) → authored TOML sizes
/// (if pane count matches) → equal split.
fn resolve_sizes(file: &WorkspaceFile, live: Option<Vec<f64>>) -> Vec<f64> {
    let n = file.pane.len();
    if let Some(s) = live {
        if s.len() == n && n > 0 {
            return s;
        }
    }
    if let Some(layout) = &file.layout {
        if layout.sizes.len() == n && n > 0 {
            return layout.sizes.clone();
        }
    }
    equal_sizes(n)
}

fn into_workspace(file: WorkspaceFile, sizes: Vec<f64>) -> Workspace {
    Workspace {
        id: file.workspace.id,
        name: file.workspace.name,
        background: file.workspace.background,
        accent: file.workspace.accent,
        panes: file.pane,
        sizes,
    }
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

    out
}

fn layout_path(id: &str) -> Result<PathBuf, String> {
    Ok(workspaces_dir()?.join(format!("{id}.layout.json")))
}

fn read_layout(id: &str) -> Option<Vec<f64>> {
    let contents = fs::read_to_string(layout_path(id).ok()?).ok()?;
    let parsed: LayoutJson = serde_json::from_str(&contents).ok()?;
    Some(parsed.sizes)
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
    let sizes = resolve_sizes(&file, read_layout(id));
    Ok(into_workspace(file, sizes))
}

pub fn save_layout(id: &str, sizes: Vec<f64>) -> Result<(), String> {
    super::ensure_dirs()?;
    let json = serde_json::to_string_pretty(&LayoutJson { sizes }).map_err(|e| e.to_string())?;
    fs::write(layout_path(id)?, json).map_err(|e| e.to_string())
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

[[pane]]
label = "web"
path = "~/dev/web"
type = "shell"
command = "zsh"

[layout]
sizes = [0.6, 0.4]
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
    }

    #[test]
    fn live_layout_wins_when_pane_count_matches() {
        let f = parse_workspace_file(SAMPLE).unwrap();
        assert_eq!(resolve_sizes(&f, Some(vec![0.5, 0.5])), vec![0.5, 0.5]);
    }

    #[test]
    fn falls_back_to_authored_sizes() {
        let f = parse_workspace_file(SAMPLE).unwrap();
        assert_eq!(resolve_sizes(&f, None), vec![0.6, 0.4]);
    }

    #[test]
    fn mismatched_live_layout_ignored() {
        let f = parse_workspace_file(SAMPLE).unwrap();
        // 3 live sizes but 2 panes -> ignore live, use authored
        assert_eq!(resolve_sizes(&f, Some(vec![0.3, 0.3, 0.4])), vec![0.6, 0.4]);
    }

    #[test]
    fn equal_split_when_no_layout() {
        let toml = "[workspace]\nid='x'\nname='X'\n\
                    [[pane]]\nlabel='a'\npath='/a'\n\
                    [[pane]]\nlabel='b'\npath='/b'\n\
                    [[pane]]\nlabel='c'\npath='/c'\n";
        let f = parse_workspace_file(toml).unwrap();
        let sizes = resolve_sizes(&f, None);
        assert_eq!(sizes.len(), 3);
        assert!((sizes.iter().sum::<f64>() - 1.0).abs() < 1e-9);
    }

    #[test]
    fn rejects_invalid_toml() {
        assert!(parse_workspace_file("not = [valid").is_err());
    }
}
