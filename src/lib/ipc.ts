import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// Raw PTY bytes arrive as a JSON number array; we hand them to xterm as a
// Uint8Array so partial UTF-8 / escape sequences are never split on a char
// boundary.
export interface OutputPayload {
  session_id: string;
  data: number[];
}

export interface ExitPayload {
  session_id: string;
}

export function spawnPane(opts: {
  sessionId: string;
  cwd: string;
  command: string;
  args: string[];
  cols: number;
  rows: number;
}): Promise<void> {
  return invoke("spawn_pane", {
    sessionId: opts.sessionId,
    cwd: opts.cwd,
    command: opts.command,
    args: opts.args,
    cols: opts.cols,
    rows: opts.rows,
  });
}

export function writePane(sessionId: string, data: Uint8Array): Promise<void> {
  return invoke("write_pane", { sessionId, data: Array.from(data) });
}

export function resizePane(sessionId: string, cols: number, rows: number): Promise<void> {
  return invoke("resize_pane", { sessionId, cols, rows });
}

export function killPane(sessionId: string): Promise<void> {
  return invoke("kill_pane", { sessionId });
}

export function onPaneOutput(cb: (p: OutputPayload) => void): Promise<UnlistenFn> {
  return listen<OutputPayload>("pane://output", (e) => cb(e.payload));
}

export function onPaneExit(cb: (p: ExitPayload) => void): Promise<UnlistenFn> {
  return listen<ExitPayload>("pane://exit", (e) => cb(e.payload));
}

// ---- workspaces -----------------------------------------------------------

export type PaneType = "claude" | "shell";

export interface PaneDef {
  label: string;
  path: string;
  type: PaneType;
  command: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  background: string | null;
  accent: string | null;
  panes: PaneDef[];
  sizes: number[]; // fractions, one per pane
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  accent: string | null;
  background: string | null;
  pane_count: number;
}

export function listWorkspaces(): Promise<WorkspaceSummary[]> {
  return invoke("list_workspaces");
}

export function getWorkspace(id: string): Promise<Workspace> {
  return invoke("get_workspace", { id });
}

export function saveLayout(id: string, sizes: number[]): Promise<void> {
  return invoke("save_layout", { id, sizes });
}

export function addWorkspacePointer(path: string): Promise<void> {
  return invoke("add_workspace_pointer", { path });
}
