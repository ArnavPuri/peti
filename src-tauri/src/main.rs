// Prevents an extra console window on Windows in release. We don't ship Windows
// in v1, but keeping the attribute is harmless and matches Tauri convention.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    peti_lib::run();
}
