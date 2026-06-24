mod commands;
mod config;
mod git;
mod launcher;
mod pty;
mod status;
mod window;

use pty::PtyManager;
use status::StatusManager;
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

/// Parse `peti://open/<id>` -> the workspace id.
fn peti_url_id(url: &str) -> Option<String> {
    url.strip_prefix("peti://open/")
        .map(|s| s.trim_end_matches('/').to_string())
        .filter(|s| !s.is_empty())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(PtyManager::default())
        .manage(StatusManager::default())
        .setup(|app| {
            let _ = config::ensure_dirs();
            let handle = app.handle();

            // Route peti://open/<id> to the right window (app already running).
            let dl_handle = handle.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    if let Some(id) = peti_url_id(url.as_str()) {
                        let _ = window::open_peti_window(&dl_handle, &id);
                    }
                }
            });

            // Was the app cold-launched by a peti:// URL?
            let launch_ids: Vec<String> = app
                .deep_link()
                .get_current()
                .ok()
                .flatten()
                .unwrap_or_default()
                .iter()
                .filter_map(|u| peti_url_id(u.as_str()))
                .collect();

            // Menubar/tray indicator — updated by the status poll with the
            // count of Claudes awaiting input across all Petis.
            if let Some(icon) = app.default_window_icon().cloned() {
                let _ = tauri::tray::TrayIconBuilder::with_id("peti")
                    .icon(icon)
                    .icon_as_template(true)
                    .tooltip("Peti")
                    .build(app);
            }

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

            if !launch_ids.is_empty() {
                // Launched via a peti:// launcher — open exactly those.
                for id in &launch_ids {
                    let _ = window::open_peti_window(handle, id);
                }
            } else {
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
            commands::save_background,
            commands::add_workspace_pointer,
            commands::open_peti,
            commands::open_editor,
            commands::create_launcher,
            commands::list_tasks,
            commands::save_tasks,
            commands::save_workspace,
            commands::delete_workspace,
            commands::scan_repos,
            commands::export_workspace,
            commands::import_workspace,
            commands::get_settings,
            commands::save_settings,
            commands::list_snippets,
            commands::save_snippets,
            commands::git_status,
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
