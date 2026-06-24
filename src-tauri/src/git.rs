//! Lightweight per-pane git status (branch + dirty), shelling out to `git`.

use std::process::Command;

use serde::Serialize;

use crate::config::expand_tilde;

#[derive(Debug, Clone, Serialize)]
pub struct GitInfo {
    pub branch: String,
    pub dirty: bool,
}

/// Returns None when the dir isn't a git repo (or git isn't available).
pub fn status(cwd: &str) -> Option<GitInfo> {
    let dir = expand_tilde(cwd);
    let dir = dir.to_str()?;

    let branch_out = Command::new("git")
        .args(["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .ok()?;
    if !branch_out.status.success() {
        return None;
    }
    let branch = String::from_utf8_lossy(&branch_out.stdout).trim().to_string();
    if branch.is_empty() {
        return None;
    }

    let dirty_out = Command::new("git")
        .args(["-C", dir, "status", "--porcelain"])
        .output()
        .ok()?;
    let dirty = !String::from_utf8_lossy(&dirty_out.stdout).trim().is_empty();

    Some(GitInfo { branch, dirty })
}
