use tauri::{AppHandle, State};

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
    manager.spawn(app, session_id, cwd, command, args, cols, rows)
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
