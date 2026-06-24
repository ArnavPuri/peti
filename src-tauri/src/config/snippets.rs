//! Reusable prompt snippets, app-global (`snippets.json` in the config root).

use std::fs;

use serde::{Deserialize, Serialize};

use super::config_root;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    pub id: String,
    pub title: String,
    pub text: String,
}

fn snippets_path() -> Result<std::path::PathBuf, String> {
    Ok(config_root()?.join("snippets.json"))
}

pub fn list_snippets() -> Vec<Snippet> {
    snippets_path()
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_default()
}

pub fn save_snippets(snippets: Vec<Snippet>) -> Result<(), String> {
    super::ensure_dirs()?;
    let json = serde_json::to_string_pretty(&snippets).map_err(|e| e.to_string())?;
    fs::write(snippets_path()?, json).map_err(|e| e.to_string())
}
