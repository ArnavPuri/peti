//! The heart of Phase 0: one PTY per pane, a reader thread that streams output
//! to the frontend as events, and explicit teardown so no child is orphaned.

use std::collections::HashSet;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Mutex, OnceLock};
use std::thread;

use directories::BaseDirs;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub type SessionId = String;

/// GUI-launched macOS apps inherit only a minimal PATH, so a bare `claude`
/// (in ~/.local/bin, homebrew, nvm, …) isn't found. Capture the user's login
/// shell PATH once and use it for spawned panes.
static LOGIN_PATH: OnceLock<Option<String>> = OnceLock::new();

fn resolve_login_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let script = "printf 'PETIPATH=%s\\n' \"$PATH\"";
    for flag in ["-ilc", "-lc"] {
        if let Ok(output) = std::process::Command::new(&shell).arg(flag).arg(script).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if let Some(p) = line.strip_prefix("PETIPATH=") {
                    let p = p.trim();
                    if !p.is_empty() {
                        return Some(p.to_string());
                    }
                }
            }
        }
    }
    None
}

/// PATH for spawned children: the login-shell PATH plus common user bins and the
/// system defaults, de-duplicated in order. Belt-and-suspenders so `claude` is
/// found regardless of how Peti itself was launched.
fn build_child_path() -> String {
    let mut candidates: Vec<String> = Vec::new();
    if let Some(p) = LOGIN_PATH.get_or_init(resolve_login_path) {
        candidates.extend(p.split(':').map(String::from));
    }
    if let Some(base) = BaseDirs::new() {
        candidates.push(base.home_dir().join(".local/bin").to_string_lossy().into_owned());
    }
    candidates.push("/opt/homebrew/bin".to_string());
    candidates.push("/usr/local/bin".to_string());
    if let Ok(existing) = std::env::var("PATH") {
        candidates.extend(existing.split(':').map(String::from));
    }
    candidates.extend(["/usr/bin", "/bin", "/usr/sbin", "/sbin"].map(String::from));

    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter(|d| !d.is_empty() && seen.insert(d.clone()))
        .collect::<Vec<_>>()
        .join(":")
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Clone, Serialize)]
struct OutputPayload {
    session_id: String,
    data: Vec<u8>,
}

#[derive(Clone, Serialize)]
struct ExitPayload {
    session_id: String,
}

#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<HashMap<SessionId, Session>>,
}

impl PtyManager {
    pub fn spawn(
        &self,
        app: AppHandle,
        session_id: SessionId,
        cwd: String,
        command: String,
        args: Vec<String>,
        cols: u16,
        rows: u16,
    ) -> Result<(), String> {
        let pair = native_pty_system()
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        let mut cmd = CommandBuilder::new(&command);
        cmd.args(&args);
        cmd.cwd(&cwd);
        // Claude's TUI keys off TERM for colour / capability detection.
        cmd.env("TERM", "xterm-256color");
        // Ensure the user's real PATH so `claude` resolves even when Peti was
        // launched from Finder/Dock (minimal PATH).
        cmd.env("PATH", build_child_path());

        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        // Drop the slave handle so the master sees EOF once the child exits.
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

        // Reader thread: stream raw bytes to the frontend, then signal exit.
        let reader_app = app.clone();
        let reader_sid = session_id.clone();
        thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let _ = reader_app.emit(
                            "pane://output",
                            OutputPayload {
                                session_id: reader_sid.clone(),
                                data: buf[..n].to_vec(),
                            },
                        );
                    }
                }
            }
            let _ = reader_app.emit(
                "pane://exit",
                ExitPayload {
                    session_id: reader_sid.clone(),
                },
            );
        });

        let session = Session {
            master: pair.master,
            writer,
            child,
        };
        self.sessions.lock().unwrap().insert(session_id, session);
        Ok(())
    }

    pub fn write(&self, session_id: &str, data: &[u8]) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.get_mut(session_id).ok_or("no such session")?;
        session.writer.write_all(data).map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions.get(session_id).ok_or("no such session")?;
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn kill(&self, session_id: &str) -> Result<(), String> {
        let removed = self.sessions.lock().unwrap().remove(session_id);
        if let Some(mut session) = removed {
            // TODO(phase 1): graceful SIGTERM with a SIGKILL fallback + tree
            // kill. For the spike, a hard kill + reap proves "no orphan".
            let _ = session.child.kill();
            let _ = session.child.wait();
        }
        Ok(())
    }

    /// Kill every session whose id starts with `prefix`. Used on window close
    /// to tear down exactly one Peti's children (SessionId = "<petiId>::<idx>").
    pub fn kill_by_prefix(&self, prefix: &str) {
        let mut sessions = self.sessions.lock().unwrap();
        let keys: Vec<String> = sessions
            .keys()
            .filter(|k| k.starts_with(prefix))
            .cloned()
            .collect();
        for key in keys {
            if let Some(mut session) = sessions.remove(&key) {
                let _ = session.child.kill();
                let _ = session.child.wait();
            }
        }
    }
}
