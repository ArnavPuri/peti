//! Config-directory resolution and path helpers.
//!
//! Linux:  ~/.config/peti/
//! macOS:  ~/Library/Application Support/com.arnavpuri.peti/

use std::path::PathBuf;

use directories::{BaseDirs, ProjectDirs};

pub mod workspace;

pub fn config_root() -> Result<PathBuf, String> {
    let dirs = ProjectDirs::from("com", "arnavpuri", "peti")
        .ok_or("could not resolve a config directory for this platform")?;
    Ok(dirs.config_dir().to_path_buf())
}

pub fn workspaces_dir() -> Result<PathBuf, String> {
    Ok(config_root()?.join("workspaces"))
}

pub fn registry_path() -> Result<PathBuf, String> {
    Ok(config_root()?.join("registry.json"))
}

/// Create the config tree if it doesn't exist. Safe to call on every launch.
pub fn ensure_dirs() -> Result<(), String> {
    std::fs::create_dir_all(workspaces_dir()?).map_err(|e| e.to_string())
}

/// Expand a leading `~` to the user's home directory. Non-tilde paths pass
/// through unchanged.
pub fn expand_tilde(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix('~') {
        if let Some(base) = BaseDirs::new() {
            let rest = rest.strip_prefix('/').unwrap_or(rest);
            return base.home_dir().join(rest);
        }
    }
    PathBuf::from(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expand_tilde_resolves_home() {
        let p = expand_tilde("~/foo/bar");
        assert!(p.is_absolute());
        assert!(p.ends_with("foo/bar"));
    }

    #[test]
    fn expand_tilde_passes_through_absolute() {
        assert_eq!(expand_tilde("/etc/hosts"), PathBuf::from("/etc/hosts"));
    }
}
