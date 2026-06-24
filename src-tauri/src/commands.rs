use tauri::{AppHandle, State};

use crate::config::settings::{self, AppSettings};
use crate::config::tasks::{self, Task};
use crate::config::workspace as ws;
use crate::pty::PtyManager;
use crate::status::StatusManager;

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn spawn_pane(
    app: AppHandle,
    manager: State<PtyManager>,
    status: State<StatusManager>,
    session_id: String,
    cwd: String,
    command: String,
    args: Vec<String>,
    cols: u16,
    rows: u16,
    watch_status: bool,
) -> Result<(), String> {
    let cwd = crate::config::expand_tilde(&cwd)
        .to_string_lossy()
        .into_owned();
    manager.spawn(app, session_id.clone(), cwd.clone(), command, args, cols, rows)?;
    if watch_status {
        status.register(session_id, &cwd);
    }
    Ok(())
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
pub fn save_layout(id: String, panes: Vec<ws::Rect>) -> Result<(), String> {
    ws::save_layout(&id, panes)
}

#[tauri::command]
pub fn add_workspace_pointer(path: String) -> Result<(), String> {
    ws::add_workspace_pointer(path)
}

#[tauri::command]
pub fn save_note_rect(id: String, note: ws::Rect) -> Result<(), String> {
    ws::save_note_rect(&id, note)
}

#[tauri::command]
pub fn open_peti(app: AppHandle, id: String) -> Result<(), String> {
    crate::window::open_peti_window(&app, &id)
}

#[tauri::command]
pub fn list_tasks(id: String) -> Vec<Task> {
    tasks::list_tasks(&id)
}

#[tauri::command]
pub fn save_tasks(id: String, tasks: Vec<Task>) -> Result<(), String> {
    crate::config::tasks::save_tasks(&id, tasks)
}

#[tauri::command]
pub fn save_workspace(app: AppHandle, workspace: ws::WorkspaceInput) -> Result<String, String> {
    let id = ws::save_workspace(workspace)?;
    let _ = ws::clear_background_override(&id); // editor's TOML background is authoritative
    crate::window::build_menu(&app)?; // surface the new/renamed Peti in the menu
    Ok(id)
}

#[tauri::command]
pub fn save_background(id: String, spec: String) -> Result<(), String> {
    ws::save_background(&id, spec)
}

#[tauri::command]
pub fn delete_workspace(app: AppHandle, id: String) -> Result<(), String> {
    ws::delete_workspace(&id)?;
    crate::window::build_menu(&app)?;
    Ok(())
}

#[tauri::command]
pub fn scan_repos(parent: String) -> Vec<crate::config::scan::RepoEntry> {
    crate::config::scan::scan_repos(&parent)
}

#[tauri::command]
pub fn export_workspace(id: String, dest: String) -> Result<(), String> {
    ws::export_workspace(&id, dest)
}

#[tauri::command]
pub fn import_workspace(app: AppHandle, src: String) -> Result<String, String> {
    let id = ws::import_workspace(src)?;
    crate::window::build_menu(&app)?;
    Ok(id)
}

#[tauri::command]
pub fn list_snippets() -> Vec<crate::config::snippets::Snippet> {
    crate::config::snippets::list_snippets()
}

#[tauri::command]
pub fn save_snippets(snippets: Vec<crate::config::snippets::Snippet>) -> Result<(), String> {
    crate::config::snippets::save_snippets(snippets)
}

#[tauri::command]
pub fn get_settings() -> AppSettings {
    settings::get_settings()
}

#[tauri::command]
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
    crate::config::settings::save_settings(settings)
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
pub fn kill_pane(
    manager: State<PtyManager>,
    status: State<StatusManager>,
    session_id: String,
) -> Result<(), String> {
    status.unregister(&session_id);
    manager.kill(&session_id)
}
