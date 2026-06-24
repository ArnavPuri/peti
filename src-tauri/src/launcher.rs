//! Generate a per-Peti macOS `.app` launcher. It's a tiny wrapper that runs
//! `open peti://open/<id>`, with an icon rendered from the Peti's identity, so
//! it looks and behaves like its own app in the Dock.

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::config::workspace as ws;

fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '-' })
        .collect();
    let cleaned = cleaned.trim().to_string();
    if cleaned.is_empty() {
        "Peti".to_string()
    } else {
        cleaned
    }
}

fn magick_ok(args: &[&std::ffi::OsStr]) -> bool {
    Command::new("magick")
        .args(args)
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Render a 1024px rounded icon (background image if any, else accent gradient)
/// to `out` as .icns via ImageMagick + iconutil. Best-effort: returns Err on
/// failure so the caller can still produce an icon-less app.
fn generate_icon(id: &str, accent: &str, bg_image: Option<&str>, out: &Path) -> Result<(), String> {
    use std::ffi::OsStr;

    let tmp = std::env::temp_dir().join(format!("peti-launcher-{id}"));
    let iconset = tmp.join("icon.iconset");
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&iconset).map_err(|e| e.to_string())?;
    let content = tmp.join("content.png");
    let padded = tmp.join("padded.png");

    // 824px content square: the background image (cover-cropped) or a gradient.
    let content_ok = if let Some(img) = bg_image {
        magick_ok(&[
            OsStr::new(img),
            OsStr::new("-resize"),
            OsStr::new("824x824^"),
            OsStr::new("-gravity"),
            OsStr::new("center"),
            OsStr::new("-extent"),
            OsStr::new("824x824"),
            content.as_os_str(),
        ])
    } else {
        let grad = format!("radial-gradient:{accent}-#0a0d12");
        magick_ok(&[
            OsStr::new("-size"),
            OsStr::new("824x824"),
            OsStr::new(&grad),
            content.as_os_str(),
        ])
    };
    if !content_ok {
        return Err("icon: magick content step failed".into());
    }

    // Round the corners and pad to 1024 on transparency (macOS icon shape).
    let round_ok = magick_ok(&[
        content.as_os_str(),
        OsStr::new("-alpha"),
        OsStr::new("set"),
        OsStr::new("-background"),
        OsStr::new("none"),
        OsStr::new("("),
        OsStr::new("+clone"),
        OsStr::new("-channel"),
        OsStr::new("A"),
        OsStr::new("-evaluate"),
        OsStr::new("multiply"),
        OsStr::new("0"),
        OsStr::new("+channel"),
        OsStr::new("-fill"),
        OsStr::new("white"),
        OsStr::new("-draw"),
        OsStr::new("roundrectangle 0,0,823,823,170,170"),
        OsStr::new(")"),
        OsStr::new("-compose"),
        OsStr::new("DstIn"),
        OsStr::new("-composite"),
        OsStr::new("-background"),
        OsStr::new("none"),
        OsStr::new("-gravity"),
        OsStr::new("center"),
        OsStr::new("-extent"),
        OsStr::new("1024x1024"),
        padded.as_os_str(),
    ]);
    if !round_ok {
        return Err("icon: magick rounding step failed".into());
    }

    // Build a proper .iconset and pack with iconutil (sips single-file is flaky).
    for s in [16u32, 32, 128, 256, 512] {
        for (suffix, px) in [(String::new(), s), ("@2x".to_string(), s * 2)] {
            let name = format!("icon_{s}x{s}{suffix}.png");
            let dim = format!("{px}x{px}");
            if !magick_ok(&[
                padded.as_os_str(),
                OsStr::new("-resize"),
                OsStr::new(&dim),
                iconset.join(&name).as_os_str(),
            ]) {
                return Err("icon: magick resize step failed".into());
            }
        }
    }

    let icns_ok = Command::new("iconutil")
        .arg("-c")
        .arg("icns")
        .arg(&iconset)
        .arg("-o")
        .arg(out)
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !icns_ok {
        return Err("icon: iconutil failed".into());
    }
    Ok(())
}

/// Build `<dest_dir>/<Name>.app` for the given workspace. Returns the app path.
pub fn create_launcher(id: &str, dest_dir: &str) -> Result<String, String> {
    let workspace = ws::get_workspace(id)?;
    let accent = workspace.accent.as_deref().unwrap_or("#5CD6AE");

    // Only a real on-disk image is usable as an icon base; presets/wallpapers
    // (bundled in the webview) fall back to the accent gradient.
    let bg_image = workspace.background.as_deref().filter(|b| {
        !b.starts_with("preset:") && !b.starts_with("wallpaper:") && Path::new(b).exists()
    });

    let app_path = PathBuf::from(dest_dir).join(format!("{}.app", sanitize_filename(&workspace.name)));
    let contents = app_path.join("Contents");
    let macos = contents.join("MacOS");
    let resources = contents.join("Resources");
    fs::create_dir_all(&macos).map_err(|e| e.to_string())?;
    fs::create_dir_all(&resources).map_err(|e| e.to_string())?;

    // launch script
    let launch = macos.join("launch");
    fs::write(&launch, format!("#!/bin/sh\nopen \"peti://open/{id}\"\n")).map_err(|e| e.to_string())?;
    fs::set_permissions(&launch, fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;

    // Info.plist
    let plist = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>{name}</string>
  <key>CFBundleDisplayName</key><string>{name}</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundleIdentifier</key><string>com.arnavpuri.peti.launcher.{id}</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>10.15</string>
</dict>
</plist>
"#,
        name = workspace.name,
        id = id,
    );
    fs::write(contents.join("Info.plist"), plist).map_err(|e| e.to_string())?;

    // icon (best-effort)
    let _ = generate_icon(id, accent, bg_image, &resources.join("icon.icns"));

    // Nudge Finder/LaunchServices to pick up the new bundle + icon.
    let _ = Command::new("touch").arg(&app_path).status();

    Ok(app_path.to_string_lossy().into_owned())
}
