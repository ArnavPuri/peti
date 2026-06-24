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

/// Build the native menu: the OS default (so Cmd+Q / copy / paste survive) plus
/// a "Peti" submenu listing every workspace. Menu item ids are `open:<wsId>`.
pub fn build_menu(app: &AppHandle) -> Result<(), String> {
    let mut peti = SubmenuBuilder::new(app, "Peti");
    for w in ws::list_workspaces() {
        let item = MenuItem::with_id(app, format!("open:{}", w.id), &w.name, true, None::<&str>)
            .map_err(|e| e.to_string())?;
        peti = peti.item(&item);
    }
    let peti = peti.build().map_err(|e| e.to_string())?;

    let menu = Menu::default(app).map_err(|e| e.to_string())?;
    menu.append(&peti).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}
