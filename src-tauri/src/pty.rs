//! The heart of Phase 0: one PTY per pane, a reader thread that streams output
//! to the frontend as events, and explicit teardown so no child is orphaned.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use std::thread;

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub type SessionId = String;

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

    pub fn kill_all(&self) {
        let drained: Vec<Session> = self.sessions.lock().unwrap().drain().map(|(_, s)| s).collect();
        for mut session in drained {
            let _ = session.child.kill();
            let _ = session.child.wait();
        }
    }
}
