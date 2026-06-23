mod commands;
mod pty;

use pty::PtyManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PtyManager::default())
        .invoke_handler(tauri::generate_handler![
            commands::spawn_pane,
            commands::write_pane,
            commands::resize_pane,
            commands::kill_pane,
        ])
        .on_window_event(|window, event| {
            // Orphan cleanup is a correctness requirement (PRD §3.2): when the
            // window goes away, kill every child PTY we own.
            if let tauri::WindowEvent::Destroyed = event {
                window.state::<PtyManager>().kill_all();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
