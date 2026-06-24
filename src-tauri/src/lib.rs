mod commands;
mod config;
mod pty;
mod window;

use pty::PtyManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PtyManager::default())
        .setup(|app| {
            let _ = config::ensure_dirs();
            let handle = app.handle();

            let _ = window::build_menu(handle);
            handle.on_menu_event(|app, event| {
                if let Some(id) = event.id().0.strip_prefix("open:") {
                    let _ = window::open_peti_window(app, id);
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
            commands::add_workspace_pointer,
            commands::open_peti,
        ])
        .on_window_event(|window, event| {
            // Orphan cleanup (PRD §3.2), window-scoped: a Peti window closing
            // kills only its own children, never another Peti's.
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(id) = window.label().strip_prefix("peti:") {
                    window
                        .state::<PtyManager>()
                        .kill_by_prefix(&format!("{id}::"));
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
