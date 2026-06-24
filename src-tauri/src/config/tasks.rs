//! Per-workspace task list, stored as `<id>.tasks.json` (app-managed, frequent
//! writes). The whole list is read/written at once — it's a personal list, not
//! a database.

use std::fs;

use serde::{Deserialize, Serialize};

use super::workspaces_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub done: bool,
    #[serde(default)]
    pub order: i64,
}

fn tasks_path(id: &str) -> Result<std::path::PathBuf, String> {
    Ok(workspaces_dir()?.join(format!("{id}.tasks.json")))
}

pub fn list_tasks(id: &str) -> Vec<Task> {
    let Ok(path) = tasks_path(id) else {
        return vec![];
    };
    let Ok(contents) = fs::read_to_string(path) else {
        return vec![];
    };
    let mut tasks: Vec<Task> = serde_json::from_str(&contents).unwrap_or_default();
    tasks.sort_by_key(|t| t.order);
    tasks
}

pub fn save_tasks(id: &str, tasks: Vec<Task>) -> Result<(), String> {
    super::ensure_dirs()?;
    let json = serde_json::to_string_pretty(&tasks).map_err(|e| e.to_string())?;
    fs::write(tasks_path(id)?, json).map_err(|e| e.to_string())
}
