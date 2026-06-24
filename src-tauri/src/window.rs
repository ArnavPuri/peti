//! Multi-window: each Peti is its own OS window, opened from a native menu.
//! Window label is `peti:<id>`; the frontend reads `?peti=<id>` to know which
//! workspace to load. There is no in-app switcher.

use tauri::menu::{Menu, MenuItem, SubmenuBuilder};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::config::workspace as ws;

/// Open the Peti's window, or focus it if it already exists.
pub fn open_peti_window(app: &AppHandle, id: &str) -> Result<(), String> {
    let label = format!("peti:{id}");

    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.set_focus();
        return Ok(());
    }

    let title = ws::get_workspace(id)
        .map(|w| w.name)
        .unwrap_or_else(|_| id.to_string());

    WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::App(format!("index.html?peti={id}").into()),
    )
    .title(title)
    .inner_size(1100.0, 760.0)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Open the editor window for a target ("new" or a workspace id).
pub fn open_editor_window(app: &AppHandle, target: &str) -> Result<(), String> {
    let label = format!("editor:{target}");
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.set_focus();
        return Ok(());
    }
    let title = if target == "new" {
        "New Peti".to_string()
    } else {
        format!("Edit · {target}")
    };
    WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::App(format!("index.html?edit={target}").into()),
    )
    .title(title)
    .inner_size(660.0, 740.0)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Open the app settings window.
pub fn open_settings_window(app: &AppHandle) -> Result<(), String> {
    let label = "settings";
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html?settings".into()))
        .title("Peti Settings")
        .inner_size(480.0, 460.0)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Build the native menu: the OS default (so Cmd+Q / copy / paste survive) plus
/// a "Peti" submenu — New / Open ▸ / Edit ▸ / Settings. Item ids: `new-peti`,
/// `open:<id>`, `edit:<id>`, `settings`.
pub fn build_menu(app: &AppHandle) -> Result<(), String> {
    let workspaces = ws::list_workspaces();

    let new_item = MenuItem::with_id(app, "new-peti", "New Peti…", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)
        .map_err(|e| e.to_string())?;

    let mut open_sub = SubmenuBuilder::new(app, "Open");
    let mut edit_sub = SubmenuBuilder::new(app, "Edit");
    for w in &workspaces {
        let open = MenuItem::with_id(app, format!("open:{}", w.id), &w.name, true, None::<&str>)
            .map_err(|e| e.to_string())?;
        let edit = MenuItem::with_id(app, format!("edit:{}", w.id), &w.name, true, None::<&str>)
            .map_err(|e| e.to_string())?;
        open_sub = open_sub.item(&open);
        edit_sub = edit_sub.item(&edit);
    }
    let open_sub = open_sub.build().map_err(|e| e.to_string())?;
    let edit_sub = edit_sub.build().map_err(|e| e.to_string())?;

    let peti = SubmenuBuilder::new(app, "Peti")
        .item(&new_item)
        .separator()
        .item(&open_sub)
        .item(&edit_sub)
        .separator()
        .item(&settings_item)
        .build()
        .map_err(|e| e.to_string())?;

    let menu = Menu::default(app).map_err(|e| e.to_string())?;
    menu.append(&peti).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}
