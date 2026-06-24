//! Per-session activity status, inferred from Claude's own transcript files
//! (the PRD-sanctioned approach — no terminal scraping).
//!
//! Claude writes `~/.claude/projects/<encoded-cwd>/<session>.jsonl`, where the
//! cwd is encoded by replacing every non-`[A-Za-z0-9-]` char with `-`. We watch
//! the newest jsonl in that dir and read its last message line:
//!   - assistant + stop_reason end_turn/stop_sequence/max_tokens  -> awaiting you
//!   - assistant tool_use, or a user/tool_result line             -> working
//!   - no transcript                                              -> idle

use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use directories::BaseDirs;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Working,
    Awaiting,
    Idle,
}

struct Watch {
    dir: PathBuf,
    last: Option<State>,
}

#[derive(Clone, Default)]
pub struct StatusManager {
    watched: Arc<Mutex<HashMap<String, Watch>>>,
}

#[derive(Clone, Serialize)]
struct StatusPayload {
    session_id: String,
    state: State,
}

/// Map an absolute cwd to its `~/.claude/projects/<encoded>` dir.
fn project_dir(cwd: &str) -> Option<PathBuf> {
    let home = BaseDirs::new()?.home_dir().to_path_buf();
    let encoded: String = cwd
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' })
        .collect();
    Some(home.join(".claude").join("projects").join(encoded))
}

fn newest_jsonl(dir: &Path) -> Option<PathBuf> {
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("jsonl"))
        .filter_map(|p| {
            let m = std::fs::metadata(&p).and_then(|m| m.modified()).ok()?;
            Some((p, m))
        })
        .max_by_key(|(_, m)| *m)
        .map(|(p, _)| p)
}

/// Read the tail of a (possibly large) file as a string.
fn read_tail(path: &Path, max: u64) -> Option<String> {
    let mut f = File::open(path).ok()?;
    let len = f.metadata().ok()?.len();
    let start = len.saturating_sub(max);
    f.seek(SeekFrom::Start(start)).ok()?;
    let mut buf = String::new();
    f.take(max).read_to_string(&mut buf).ok()?;
    Some(buf)
}

fn derive_state(dir: &Path) -> State {
    let Some(path) = newest_jsonl(dir) else {
        return State::Idle;
    };
    let Some(tail) = read_tail(&path, 96 * 1024) else {
        return State::Idle;
    };

    for line in tail.lines().rev() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let msg = &value["message"];
        let role = msg["role"].as_str();
        match role {
            Some("assistant") => {
                let done = matches!(
                    msg["stop_reason"].as_str(),
                    Some("end_turn") | Some("stop_sequence") | Some("max_tokens")
                );
                return if done { State::Awaiting } else { State::Working };
            }
            Some("user") => return State::Working,
            _ => continue, // skip non-message lines (permission-mode, summaries, …)
        }
    }
    State::Idle
}

impl StatusManager {
    pub fn register(&self, session_id: String, cwd: &str) {
        if let Some(dir) = project_dir(cwd) {
            self.watched
                .lock()
                .unwrap()
                .insert(session_id, Watch { dir, last: None });
        }
    }

    pub fn unregister(&self, session_id: &str) {
        self.watched.lock().unwrap().remove(session_id);
    }

    pub fn unregister_by_prefix(&self, prefix: &str) {
        self.watched
            .lock()
            .unwrap()
            .retain(|k, _| !k.starts_with(prefix));
    }

    /// Spawn the 1s poll loop. Emits `session://status` only on state changes.
    pub fn start(&self, app: AppHandle) {
        let watched = self.watched.clone();
        thread::spawn(move || loop {
            thread::sleep(Duration::from_secs(1));
            let mut changes: Vec<StatusPayload> = Vec::new();
            {
                let mut map = watched.lock().unwrap();
                for (session_id, watch) in map.iter_mut() {
                    let state = derive_state(&watch.dir);
                    if watch.last != Some(state) {
                        watch.last = Some(state);
                        changes.push(StatusPayload {
                            session_id: session_id.clone(),
                            state,
                        });
                    }
                }
            }
            for change in changes {
                let _ = app.emit("session://status", change);
            }
        });
    }
}
