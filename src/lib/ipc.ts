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
  watchStatus: boolean;
}): Promise<void> {
  return invoke("spawn_pane", {
    sessionId: opts.sessionId,
    cwd: opts.cwd,
    command: opts.command,
    args: opts.args,
    cols: opts.cols,
    rows: opts.rows,
    watchStatus: opts.watchStatus,
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

// ---- session activity status (from Claude's transcript) -------------------

export type SessionState = "working" | "awaiting" | "idle";

export interface StatusPayload {
  session_id: string;
  state: SessionState;
}

export function onSessionStatus(cb: (p: StatusPayload) => void): Promise<UnlistenFn> {
  return listen<StatusPayload>("session://status", (e) => cb(e.payload));
}

// ---- git status (per pane) ------------------------------------------------

export interface GitInfo {
  branch: string;
  dirty: boolean;
}

export function gitStatus(cwd: string): Promise<GitInfo | null> {
  return invoke("git_status", { cwd });
}

// ---- code viewer (read-only file browser) ---------------------------------

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface FileContents {
  content: string;
  truncated: boolean;
  binary: boolean;
}

export function listDir(path: string): Promise<FsEntry[]> {
  return invoke("list_dir", { path });
}

export function readFile(path: string): Promise<FileContents> {
  return invoke("read_file", { path });
}

// ---- workspaces -----------------------------------------------------------

export type PaneType = "claude" | "shell" | "code";

export interface PaneDef {
  label: string;
  path: string;
  type: PaneType;
  command: string | null;
  resume: boolean;
}

// Floating-card geometry: fractions of the canvas (0–1); z is stacking order.
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

export interface Workspace {
  id: string;
  name: string;
  background: string | null; // absolute path, resolved backend-side
  accent: string | null;
  panes: PaneDef[];
  rects: Rect[]; // aligned with panes by index
  note: Rect; // geometry of the floating task note
}

export function getWorkspace(id: string): Promise<Workspace> {
  return invoke("get_workspace", { id });
}

export function saveLayout(id: string, panes: Rect[]): Promise<void> {
  return invoke("save_layout", { id, panes });
}

export function saveNoteRect(id: string, note: Rect): Promise<void> {
  return invoke("save_note_rect", { id, note });
}

// spec: "" (accent gradient) | "preset:<id>" | image path
export function saveBackground(id: string, spec: string): Promise<void> {
  return invoke("save_background", { id, spec });
}

export function openPeti(id: string): Promise<void> {
  return invoke("open_peti", { id });
}

export function openEditor(target: string): Promise<void> {
  return invoke("open_editor", { target });
}

// Generates a <Name>.app launcher for the Peti in destDir; returns its path.
export function createLauncher(id: string, destDir: string): Promise<string> {
  return invoke("create_launcher", { id, destDir });
}

export function addWorkspacePointer(path: string): Promise<void> {
  return invoke("add_workspace_pointer", { path });
}

// ---- plan (description + tasks) -------------------------------------------

export interface Task {
  id: string;
  text: string;
  done: boolean;
  order: number;
  priority: number; // 1 = P1 (highest), 2 = P2 (default), 3 = P3
  labels: string[];
  nextUp: boolean;
}

export interface Plan {
  description: string;
  tasks: Task[];
}

export function getPlan(id: string): Promise<Plan> {
  return invoke("get_plan", { id });
}

export function savePlan(id: string, plan: Plan): Promise<void> {
  return invoke("save_plan", { id, plan });
}

// Mirror the plan into each Claude pane's `.peti/PLAN.md`.
export function syncPlanMd(id: string): Promise<void> {
  return invoke("sync_plan_md", { id });
}

// ---- editor (create / edit / delete) --------------------------------------

export interface PaneInput {
  label: string;
  path: string;
  type: PaneType;
  command: string | null;
  resume: boolean;
}

export interface WorkspaceInput {
  id: string;
  name: string;
  accent: string | null;
  background: string | null;
  panes: PaneInput[];
}

// Returns the sanitized id the workspace was saved under.
export function saveWorkspace(workspace: WorkspaceInput): Promise<string> {
  return invoke("save_workspace", { workspace });
}

export function deleteWorkspace(id: string): Promise<void> {
  return invoke("delete_workspace", { id });
}

export interface RepoEntry {
  path: string;
  name: string;
  git: boolean;
}

export function scanRepos(parent: string): Promise<RepoEntry[]> {
  return invoke("scan_repos", { parent });
}

export function exportWorkspace(id: string, dest: string): Promise<void> {
  return invoke("export_workspace", { id, dest });
}

export function importWorkspace(src: string): Promise<string> {
  return invoke("import_workspace", { src });
}

// ---- settings -------------------------------------------------------------

export interface AppSettings {
  send_mode: "insert" | "send";
  default_model: string;
  permission_mode: string;
  alerts: boolean;
  theme: "system" | "dark" | "light";
}

export function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

export function saveSettings(settings: AppSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

// ---- prompt snippets (app-global) -----------------------------------------

export interface Snippet {
  id: string;
  title: string;
  text: string;
}

export function listSnippets(): Promise<Snippet[]> {
  return invoke("list_snippets");
}

export function saveSnippets(snippets: Snippet[]): Promise<void> {
  return invoke("save_snippets", { snippets });
}
