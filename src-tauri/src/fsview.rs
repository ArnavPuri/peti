//! Read-only filesystem access for the code-viewer card: list a directory
//! (lazy, one level) and read a (capped, UTF-8) file.

use std::cmp::Ordering;
use std::fs::{self, File};
use std::io::Read;

use serde::Serialize;

use crate::config::expand_tilde;

#[derive(Debug, Clone, Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String, // absolute
    pub is_dir: bool,
}

pub fn list_dir(path: &str) -> Result<Vec<DirEntry>, String> {
    let dir = expand_tilde(path);
    let mut entries: Vec<DirEntry> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|e| {
            let p = e.path();
            DirEntry {
                is_dir: p.is_dir(),
                name: e.file_name().to_string_lossy().into_owned(),
                path: p.to_string_lossy().into_owned(),
            }
        })
        .collect();

    // Directories first, then alphabetical (case-insensitive).
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

const MAX_BYTES: u64 = 512 * 1024;

#[derive(Debug, Clone, Serialize)]
pub struct FileContents {
    pub content: String,
    pub truncated: bool,
    pub binary: bool,
}

pub fn read_file(path: &str) -> Result<FileContents, String> {
    let p = expand_tilde(path);
    let size = fs::metadata(&p).map_err(|e| e.to_string())?.len();

    let mut buf = Vec::new();
    File::open(&p)
        .map_err(|e| e.to_string())?
        .take(MAX_BYTES)
        .read_to_end(&mut buf)
        .map_err(|e| e.to_string())?;

    let truncated = size > MAX_BYTES;
    match String::from_utf8(buf) {
        Ok(content) => Ok(FileContents { content, truncated, binary: false }),
        Err(_) => Ok(FileContents { content: String::new(), truncated, binary: true }),
    }
}
