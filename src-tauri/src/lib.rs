mod commands;
mod config;
mod pty;
mod status;
mod window;

use pty::PtyManager;
use status::StatusManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(PtyManager::default())
        .manage(StatusManager::default())
        .setup(|app| {
            let _ = config::ensure_dirs();
            let handle = app.handle();

            app.state::<StatusManager>().start(handle.clone());

            let _ = window::build_menu(handle);
            handle.on_menu_event(|app, event| {
                let id = event.id().0.as_str();
                if let Some(ws) = id.strip_prefix("open:") {
                    let _ = window::open_peti_window(app, ws);
                } else if let Some(ws) = id.strip_prefix("edit:") {
                    let _ = window::open_editor_window(app, ws);
                } else if id == "new-peti" {
                    let _ = window::open_editor_window(app, "new");
                } else if id == "settings" {
                    let _ = window::open_settings_window(app);
                }
            });

            // Open the first Peti on launch; if there are none, show a bare
            // window with the "add a Peti" hint (no ?peti= param).
            match config::workspace::list_workspaces().first() {
                Some(first) => {
                    let _ = window::open_peti_window(handle, &first.id);
                }
                None => {
                    let _ = tauri::WebviewWindowBuilder::new(
                        handle,
                        "peti",
                        tauri::WebviewUrl::App("index.html".into()),
                    )
                    .title("Peti")
                    .inner_size(820.0, 600.0)
                    .build();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::spawn_pane,
            commands::write_pane,
            commands::resize_pane,
            commands::kill_pane,
            commands::list_workspaces,
            commands::get_workspace,
            commands::save_layout,
            commands::save_note_rect,
            commands::add_workspace_pointer,
            commands::open_peti,
            commands::list_tasks,
            commands::save_tasks,
            commands::save_workspace,
            commands::delete_workspace,
            commands::scan_repos,
            commands::export_workspace,
            commands::import_workspace,
            commands::get_settings,
            commands::save_settings,
        ])
        .on_window_event(|window, event| {
            // Orphan cleanup (PRD §3.2), window-scoped: a Peti window closing
            // kills only its own children, never another Peti's.
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(id) = window.label().strip_prefix("peti:") {
                    let prefix = format!("{id}::");
                    window.state::<PtyManager>().kill_by_prefix(&prefix);
                    window.state::<StatusManager>().unregister_by_prefix(&prefix);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
