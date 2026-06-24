use tauri::{AppHandle, State};

use crate::config::workspace as ws;
use crate::pty::PtyManager;

#[tauri::command]
pub fn spawn_pane(
    app: AppHandle,
    manager: State<PtyManager>,
    session_id: String,
    cwd: String,
    command: String,
    args: Vec<String>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let cwd = crate::config::expand_tilde(&cwd)
        .to_string_lossy()
        .into_owned();
    manager.spawn(app, session_id, cwd, command, args, cols, rows)
}

#[tauri::command]
pub fn list_workspaces() -> Vec<ws::WorkspaceSummary> {
    ws::list_workspaces()
}

#[tauri::command]
pub fn get_workspace(id: String) -> Result<ws::Workspace, String> {
    ws::get_workspace(&id)
}

#[tauri::command]
pub fn save_layout(id: String, sizes: Vec<f64>) -> Result<(), String> {
    ws::save_layout(&id, sizes)
}

#[tauri::command]
pub fn add_workspace_pointer(path: String) -> Result<(), String> {
    ws::add_workspace_pointer(path)
}

#[tauri::command]
pub fn write_pane(
    manager: State<PtyManager>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    manager.write(&session_id, &data)
}

#[tauri::command]
pub fn resize_pane(
    manager: State<PtyManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    manager.resize(&session_id, cols, rows)
}

#[tauri::command]
pub fn kill_pane(manager: State<PtyManager>, session_id: String) -> Result<(), String> {
    manager.kill(&session_id)
}
