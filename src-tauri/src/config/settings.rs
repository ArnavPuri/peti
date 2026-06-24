//! App-global settings, stored as `settings.json` in the config root. Empty
//! strings mean "unset" (no flag appended).

use std::fs;

use serde::{Deserialize, Serialize};

use super::config_root;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    pub send_mode: String,       // "insert" | "send"
    pub default_model: String,   // e.g. "opus" | "sonnet" | ""
    pub permission_mode: String, // e.g. "default" | "acceptEdits" | "plan" | ""
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            send_mode: "insert".into(),
            default_model: String::new(),
            permission_mode: String::new(),
        }
    }
}

fn settings_path() -> Result<std::path::PathBuf, String> {
    Ok(config_root()?.join("settings.json"))
}

pub fn get_settings() -> AppSettings {
    settings_path()
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_default()
}

pub fn save_settings(settings: AppSettings) -> Result<(), String> {
    super::ensure_dirs()?;
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(settings_path()?, json).map_err(|e| e.to_string())
}
