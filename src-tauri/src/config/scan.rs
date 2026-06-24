//! Folder scan for the editor's "Scan folder…" — list immediate subdirectories
//! so a multi-repo project becomes panes in one gesture.

use std::fs;

use serde::Serialize;

use super::expand_tilde;

#[derive(Debug, Clone, Serialize)]
pub struct RepoEntry {
    pub path: String, // absolute
    pub name: String,
    pub git: bool, // has a .git — likely a repo, pre-checked in the UI
}

pub fn scan_repos(parent: &str) -> Vec<RepoEntry> {
    let dir = expand_tilde(parent);
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if name.starts_with('.') {
                continue;
            }
            out.push(RepoEntry {
                git: path.join(".git").exists(),
                name: name.to_string(),
                path: path.to_string_lossy().into_owned(),
            });
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}
