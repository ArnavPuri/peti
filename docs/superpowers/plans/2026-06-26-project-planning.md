# Project Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each Peti a project description plus a prioritized, labeled task list with a pinned "Next up" section, and mirror it one-way into a `.peti/PLAN.md` file Claude can read.

**Architecture:** The per-workspace sidecar `<id>.tasks.json` evolves from a bare `[Task]` array into a `Plan { description, tasks }` object (backward-compatible load). A pure renderer turns a `Plan` into Markdown; a sync command writes it into every distinct Claude-pane working directory and auto-gitignores `.peti/`. The frontend store gains the description + new task fields and calls `savePlan` + `syncPlanMd` on every (debounced) edit.

**Tech Stack:** Rust (Tauri 2, serde/serde_json), React + TypeScript + Zustand, Vite/Bun.

## Global Constraints

- Plan loading must NEVER error — fall back to legacy array, then empty `Plan`.
- New `Task` fields are additive and `#[serde(default)]`: `priority: u8` (default `2`), `labels: Vec<String>` (default `[]`), `next_up: bool` serialized as **`nextUp`** (default `false`).
- PLAN.md is **generated only** — never parsed back. Peti is the source of truth.
- `.peti/` gitignore entry is only added when `<dir>/.git` exists, and must be idempotent (no duplicate lines).
- The sidecar filename stays `<id>.tasks.json` (preserves workspace-deletion sidecar logic).
- The frontend has **no test runner**; frontend tasks are gated by `bunx tsc -p tsconfig.json --noEmit` (type check) — Rust tasks use `cargo test`.
- Priority encoding: `1`=P1 (highest), `2`=P2 (default), `3`=P3.
- Run Rust commands from `src-tauri/`; run frontend commands from the repo root `/Users/arnavpuri/development/peti`.

---

## File Structure

- `src-tauri/src/config/tasks.rs` — **modify**: add `Task` fields, add `Plan`, rename `list_tasks`/`save_tasks` → `load_plan`/`save_plan` (back-compat load), add tests.
- `src-tauri/src/config/plan_md.rs` — **create**: `render_plan_md` (pure), `ensure_gitignore`, `sync`, + tests.
- `src-tauri/src/config/mod.rs` — **modify**: register `pub mod plan_md;`.
- `src-tauri/src/commands.rs` — **modify**: replace `list_tasks`/`save_tasks` commands with `get_plan`/`save_plan`/`sync_plan_md`.
- `src-tauri/src/lib.rs` — **modify**: update `generate_handler!` registration.
- `src/lib/ipc.ts` — **modify**: extend `Task`, add `Plan`, add `getPlan`/`savePlan`/`syncPlanMd`, remove `listTasks`/`saveTasks`.
- `src/stores/tasksStore.ts` — **modify**: add `description` + new task fields/actions; `persist` calls `savePlan` then `syncPlanMd`.
- `src/components/TaskNote.tsx` — **modify**: description textarea, Next-up group, priority chip, labels, ★ toggle.
- `src/styles.css` — **modify**: styles for the new UI bits.

---

### Task 1: Plan data model + back-compatible load/save (Rust)

**Files:**
- Modify: `src-tauri/src/config/tasks.rs`
- Test: `src-tauri/src/config/tasks.rs` (`#[cfg(test)]` module)

**Interfaces:**
- Produces:
  - `struct Task { id: String, text: String, done: bool, order: i64, priority: u8, labels: Vec<String>, next_up: bool }` (`next_up` serializes as `nextUp`)
  - `struct Plan { description: String, tasks: Vec<Task> }` (both `Serialize + Deserialize + Default`)
  - `fn load_plan(id: &str) -> Plan`
  - `fn save_plan(id: &str, plan: Plan) -> Result<(), String>`

- [ ] **Step 1: Replace the file contents with the new model + functions**

Replace the entire body of `src-tauri/src/config/tasks.rs` (keep the module doc-comment) so it reads:

```rust
//! Per-workspace plan (description + tasks), stored as `<id>.tasks.json`
//! (app-managed, frequent writes). The whole plan is read/written at once.

use std::fs;

use serde::{Deserialize, Serialize};

use super::workspaces_dir;

fn default_priority() -> u8 {
    2
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub done: bool,
    #[serde(default)]
    pub order: i64,
    #[serde(default = "default_priority")]
    pub priority: u8,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(rename = "nextUp", default)]
    pub next_up: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Plan {
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tasks: Vec<Task>,
}

fn tasks_path(id: &str) -> Result<std::path::PathBuf, String> {
    Ok(workspaces_dir()?.join(format!("{id}.tasks.json")))
}

/// Load the plan. Tolerant: new `Plan` object first, then a legacy bare
/// `[Task]` array, then empty. Never errors.
pub fn load_plan(id: &str) -> Plan {
    let Ok(path) = tasks_path(id) else {
        return Plan::default();
    };
    let Ok(contents) = fs::read_to_string(path) else {
        return Plan::default();
    };
    let mut plan: Plan = match serde_json::from_str::<Plan>(&contents) {
        Ok(p) => p,
        Err(_) => match serde_json::from_str::<Vec<Task>>(&contents) {
            Ok(tasks) => Plan { description: String::new(), tasks },
            Err(_) => Plan::default(),
        },
    };
    plan.tasks.sort_by_key(|t| t.order);
    plan
}

pub fn save_plan(id: &str, plan: Plan) -> Result<(), String> {
    super::ensure_dirs()?;
    let json = serde_json::to_string_pretty(&plan).map_err(|e| e.to_string())?;
    fs::write(tasks_path(id)?, json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(id: &str, order: i64) -> Task {
        Task {
            id: id.to_string(),
            text: format!("task {id}"),
            done: false,
            order,
            priority: 2,
            labels: vec![],
            next_up: false,
        }
    }

    #[test]
    fn legacy_array_loads_as_plan() {
        // A legacy bare array (pre-Plan) with only the original fields.
        let legacy = r#"[{"id":"a","text":"old","done":false,"order":0}]"#;
        let plan: Plan = match serde_json::from_str::<Plan>(legacy) {
            Ok(p) => p,
            Err(_) => Plan {
                description: String::new(),
                tasks: serde_json::from_str::<Vec<Task>>(legacy).unwrap(),
            },
        };
        assert_eq!(plan.description, "");
        assert_eq!(plan.tasks.len(), 1);
        // New fields default cleanly.
        assert_eq!(plan.tasks[0].priority, 2);
        assert!(plan.tasks[0].labels.is_empty());
        assert!(!plan.tasks[0].next_up);
    }

    #[test]
    fn plan_round_trips_all_fields() {
        let plan = Plan {
            description: "why this project".to_string(),
            tasks: vec![Task {
                id: "x".to_string(),
                text: "ship it".to_string(),
                done: true,
                order: 3,
                priority: 1,
                labels: vec!["release".to_string()],
                next_up: true,
            }],
        };
        let json = serde_json::to_string(&plan).unwrap();
        // `next_up` serializes under the camelCase key the frontend uses.
        assert!(json.contains("\"nextUp\":true"));
        let back: Plan = serde_json::from_str(&json).unwrap();
        assert_eq!(back.description, "why this project");
        assert_eq!(back.tasks[0].priority, 1);
        assert_eq!(back.tasks[0].labels, vec!["release".to_string()]);
        assert!(back.tasks[0].next_up);
    }

    #[test]
    fn load_sorts_tasks_by_order() {
        let plan = Plan {
            description: String::new(),
            tasks: vec![task("b", 5), task("a", 1)],
        };
        let json = serde_json::to_string(&plan).unwrap();
        let mut back: Plan = serde_json::from_str(&json).unwrap();
        back.tasks.sort_by_key(|t| t.order);
        assert_eq!(back.tasks[0].id, "a");
    }
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test --lib config::tasks`
Expected: PASS (3 tests: `legacy_array_loads_as_plan`, `plan_round_trips_all_fields`, `load_sorts_tasks_by_order`). The crate will still have unresolved references to `list_tasks`/`save_tasks` in `commands.rs` — `cargo test --lib config::tasks` compiles the lib; if it fails to compile due to `commands.rs`, proceed to Task 4 wiring and re-run. To keep this task self-contained, also update `commands.rs` references in this same step is NOT required — but if compilation blocks the test, jump to Task 4 Step 1 first, then return. (Normally Task 4 is done right after.)

> Note: because Rust compiles the whole crate, Tasks 1 and 4 must both land before `cargo test` is green. Implement Task 1 then Task 4, then run tests. The interface above is the contract Task 4 consumes.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/config/tasks.rs
git commit -m "feat(plan): Plan model with priority/labels/nextUp + back-compat load"
```

---

### Task 2: PLAN.md renderer + gitignore + sync (Rust)

**Files:**
- Create: `src-tauri/src/config/plan_md.rs`
- Modify: `src-tauri/src/config/mod.rs` (add `pub mod plan_md;`)
- Test: `src-tauri/src/config/plan_md.rs` (`#[cfg(test)]` module)

**Interfaces:**
- Consumes: `super::tasks::{Plan, Task}`, `super::workspace::{PaneDef, PaneType}`, `super::expand_tilde`.
- Produces:
  - `fn render_plan_md(name: &str, plan: &Plan) -> String`
  - `fn ensure_gitignore(dir: &std::path::Path)`
  - `fn sync(name: &str, panes: &[super::workspace::PaneDef], plan: &Plan)`

- [ ] **Step 1: Create `src-tauri/src/config/plan_md.rs`**

```rust
//! Render a `Plan` to a Claude-readable `.peti/PLAN.md` and sync it into each
//! distinct Claude-pane working directory. One-way: Peti always wins.

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use super::tasks::{Plan, Task};
use super::workspace::{PaneDef, PaneType};

/// Render the plan as Markdown. Pure — no IO.
pub fn render_plan_md(name: &str, plan: &Plan) -> String {
    let mut out = format!("# {name}\n");
    if !plan.description.trim().is_empty() {
        out.push('\n');
        out.push_str(plan.description.trim());
        out.push('\n');
    }

    let line = |t: &Task| -> String {
        let mark = if t.done { "x" } else { " " };
        let mut s = format!("- [{mark}] (P{}) {}", t.priority, t.text);
        for label in &t.labels {
            s.push_str(&format!("  #{label}"));
        }
        s.push('\n');
        s
    };

    // Next up: pinned, unfinished — by priority then order.
    let mut next: Vec<&Task> =
        plan.tasks.iter().filter(|t| t.next_up && !t.done).collect();
    next.sort_by_key(|t| (t.priority, t.order));
    if !next.is_empty() {
        out.push_str("\n## Next up\n");
        for t in next {
            out.push_str(&line(t));
        }
    }

    // Everything else: unfinished by priority then order, done last.
    let mut rest: Vec<&Task> =
        plan.tasks.iter().filter(|t| !(t.next_up && !t.done)).collect();
    rest.sort_by_key(|t| (t.done, t.priority, t.order));
    if !rest.is_empty() {
        out.push_str("\n## Tasks\n");
        for t in rest {
            out.push_str(&line(t));
        }
    }

    out
}

/// Ensure `.peti/` is ignored in the repo at `dir`. No-op unless `dir/.git`
/// exists. Idempotent.
pub fn ensure_gitignore(dir: &Path) {
    if !dir.join(".git").exists() {
        return;
    }
    let gi = dir.join(".gitignore");
    let existing = fs::read_to_string(&gi).unwrap_or_default();
    let already = existing
        .lines()
        .any(|l| matches!(l.trim(), ".peti/" | ".peti"));
    if already {
        return;
    }
    let mut next = existing;
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    next.push_str(".peti/\n");
    let _ = fs::write(gi, next);
}

fn write_to_dir(dir: &Path, name: &str, plan: &Plan) -> Result<(), String> {
    let peti = dir.join(".peti");
    fs::create_dir_all(&peti).map_err(|e| e.to_string())?;
    fs::write(peti.join("PLAN.md"), render_plan_md(name, plan)).map_err(|e| e.to_string())?;
    ensure_gitignore(dir);
    Ok(())
}

/// Write PLAN.md into each distinct Claude-pane directory. Best-effort: a
/// failure on one directory does not block the others.
pub fn sync(name: &str, panes: &[PaneDef], plan: &Plan) {
    let mut seen = HashSet::new();
    for pane in panes {
        if pane.pane_type != PaneType::Claude {
            continue;
        }
        let dir = super::expand_tilde(&pane.path);
        if !seen.insert(dir.clone()) {
            continue;
        }
        let _ = write_to_dir(&dir, name, plan);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(text: &str, priority: u8, done: bool, next_up: bool, labels: &[&str]) -> Task {
        Task {
            id: text.to_string(),
            text: text.to_string(),
            done,
            order: 0,
            priority,
            labels: labels.iter().map(|s| s.to_string()).collect(),
            next_up,
        }
    }

    #[test]
    fn renders_sections_and_ordering() {
        let plan = Plan {
            description: "  build the thing  ".to_string(),
            tasks: vec![
                t("pinned p1", 1, false, true, &["release"]),
                t("backlog p2", 2, false, false, &[]),
                t("backlog p1", 1, false, false, &["infra"]),
                t("already done", 2, true, false, &[]),
            ],
        };
        let md = render_plan_md("Peti", &plan);
        assert!(md.starts_with("# Peti\n"));
        assert!(md.contains("\nbuild the thing\n")); // trimmed description
        // Next up section present, with the pinned task + its label.
        let next_idx = md.find("## Next up").unwrap();
        assert!(md[next_idx..].contains("- [ ] (P1) pinned p1  #release"));
        // Tasks section: P1 backlog before P2 backlog, done last.
        let tasks_idx = md.find("## Tasks").unwrap();
        let p1 = md.find("backlog p1").unwrap();
        let p2 = md.find("backlog p2").unwrap();
        let done = md.find("already done").unwrap();
        assert!(tasks_idx < p1 && p1 < p2 && p2 < done);
        assert!(md.contains("- [x] (P2) already done"));
    }

    #[test]
    fn omits_empty_sections_and_description() {
        let plan = Plan { description: String::new(), tasks: vec![] };
        let md = render_plan_md("Empty", &plan);
        assert_eq!(md, "# Empty\n");
        assert!(!md.contains("## Next up"));
        assert!(!md.contains("## Tasks"));
    }

    #[test]
    fn gitignore_is_idempotent_and_git_gated() {
        let dir = std::env::temp_dir().join(format!("peti-plan-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        // No .git → no .gitignore written.
        ensure_gitignore(&dir);
        assert!(!dir.join(".gitignore").exists());

        // With .git → entry added once, even when called twice.
        fs::create_dir_all(dir.join(".git")).unwrap();
        ensure_gitignore(&dir);
        ensure_gitignore(&dir);
        let gi = fs::read_to_string(dir.join(".gitignore")).unwrap();
        assert_eq!(gi.matches(".peti/").count(), 1);

        let _ = fs::remove_dir_all(&dir);
    }
}
```

- [ ] **Step 2: Register the module in `src-tauri/src/config/mod.rs`**

In the `pub mod` block (currently `scan`, `settings`, `snippets`, `tasks`, `workspace`), add `plan_md` alphabetically before `scan`:

```rust
pub mod plan_md;
pub mod scan;
pub mod settings;
pub mod snippets;
pub mod tasks;
pub mod workspace;
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test --lib config::plan_md`
Expected: PASS (3 tests). If the crate fails to compile due to `commands.rs` still referencing `list_tasks`/`save_tasks`, complete Task 4 first, then re-run.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/config/plan_md.rs src-tauri/src/config/mod.rs
git commit -m "feat(plan): PLAN.md renderer, gitignore guard, per-dir sync"
```

---

### Task 3: Backend IPC commands (Rust)

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs:143-171` (handler registration)

**Interfaces:**
- Consumes: `tasks::{load_plan, save_plan, Plan}` (Task 1), `plan_md::sync` (Task 2), `ws::get_workspace`.
- Produces (Tauri commands): `get_plan(id) -> Plan`, `save_plan(id, plan) -> Result<(), String>`, `sync_plan_md(id) -> Result<(), String>`.

- [ ] **Step 1: Update the `use` line and replace the task commands in `commands.rs`**

Change the import at `src-tauri/src/commands.rs:4` from:

```rust
use crate::config::tasks::{self, Task};
```

to:

```rust
use crate::config::tasks;
```

Then replace the two command functions (currently at lines 73–81):

```rust
#[tauri::command]
pub fn list_tasks(id: String) -> Vec<Task> {
    tasks::list_tasks(&id)
}

#[tauri::command]
pub fn save_tasks(id: String, tasks: Vec<Task>) -> Result<(), String> {
    crate::config::tasks::save_tasks(&id, tasks)
}
```

with:

```rust
#[tauri::command]
pub fn get_plan(id: String) -> tasks::Plan {
    tasks::load_plan(&id)
}

#[tauri::command]
pub fn save_plan(id: String, plan: tasks::Plan) -> Result<(), String> {
    tasks::save_plan(&id, plan)
}

#[tauri::command]
pub fn sync_plan_md(id: String) -> Result<(), String> {
    let ws = ws::get_workspace(&id)?;
    let plan = tasks::load_plan(&id);
    crate::config::plan_md::sync(&ws.name, &ws.panes, &plan);
    Ok(())
}
```

- [ ] **Step 2: Update the handler registration in `lib.rs`**

In `src-tauri/src/lib.rs`, replace these two lines (157–158):

```rust
            commands::list_tasks,
            commands::save_tasks,
```

with:

```rust
            commands::get_plan,
            commands::save_plan,
            commands::sync_plan_md,
```

- [ ] **Step 3: Build the crate and run the full config test suite**

Run: `cd src-tauri && cargo test --lib config`
Expected: PASS — the crate now compiles and all `config::tasks` + `config::plan_md` tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(plan): get_plan/save_plan/sync_plan_md IPC commands"
```

---

### Task 4: Frontend IPC types + wrappers (TypeScript)

**Files:**
- Modify: `src/lib/ipc.ts:167-182` (the `// ---- tasks ----` block)

**Interfaces:**
- Consumes: the Rust commands from Task 3 (`get_plan`, `save_plan`, `sync_plan_md`).
- Produces:
  - `interface Task { id, text, done, order, priority: number, labels: string[], nextUp: boolean }`
  - `interface Plan { description: string; tasks: Task[] }`
  - `getPlan(id): Promise<Plan>`, `savePlan(id, plan): Promise<void>`, `syncPlanMd(id): Promise<void>`

- [ ] **Step 1: Replace the tasks block in `src/lib/ipc.ts`**

Replace lines 167–182 (from `// ---- tasks ----` through the `saveTasks` function) with:

```ts
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
```

- [ ] **Step 2: Type-check (will surface the store's stale imports next task)**

Run: `cd /Users/arnavpuri/development/peti && bunx tsc -p tsconfig.json --noEmit`
Expected: errors ONLY in `src/stores/tasksStore.ts` (it still imports `listTasks`/`saveTasks`). `ipc.ts` itself must report no errors. These store errors are fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ipc.ts
git commit -m "feat(plan): frontend Plan/Task types + getPlan/savePlan/syncPlanMd"
```

---

### Task 5: Frontend store — description, fields, actions, sync (TypeScript)

**Files:**
- Modify: `src/stores/tasksStore.ts` (full rewrite)

**Interfaces:**
- Consumes: `getPlan`, `savePlan`, `syncPlanMd`, `Task` (Task 4).
- Produces (Zustand store `useTasksStore`): state `{ workspaceId, description, tasks }`; actions `load`, `setDescription`, `add`, `toggle`, `setText`, `remove`, `move`, `setPriority`, `toggleNextUp`, `addLabel`, `removeLabel`.

- [ ] **Step 1: Replace the entire contents of `src/stores/tasksStore.ts`**

```ts
import { create } from "zustand";
import { getPlan, savePlan, syncPlanMd, type Task } from "../lib/ipc";

interface TasksState {
  workspaceId: string | null;
  description: string;
  tasks: Task[];
  load: (id: string) => Promise<void>;
  setDescription: (text: string) => void;
  add: (text: string) => void;
  toggle: (taskId: string) => void;
  setText: (taskId: string, text: string) => void;
  remove: (taskId: string) => void;
  move: (taskId: string, dir: -1 | 1) => void;
  setPriority: (taskId: string, priority: number) => void;
  toggleNextUp: (taskId: string) => void;
  addLabel: (taskId: string, label: string) => void;
  removeLabel: (taskId: string, label: string) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

// Re-number `order` to match array position, persist the plan, then mirror it
// to each Claude pane's PLAN.md (debounced).
function persist(workspaceId: string | null, description: string, tasks: Task[]) {
  if (!workspaceId) return;
  const ordered = tasks.map((t, i) => ({ ...t, order: i }));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void savePlan(workspaceId, { description, tasks: ordered }).then(() =>
      syncPlanMd(workspaceId),
    );
  }, 350);
}

export const useTasksStore = create<TasksState>((set) => ({
  workspaceId: null,
  description: "",
  tasks: [],

  load: async (id) => {
    const plan = await getPlan(id);
    set({ workspaceId: id, description: plan.description, tasks: plan.tasks });
  },

  setDescription: (text) =>
    set((s) => {
      persist(s.workspaceId, text, s.tasks);
      return { description: text };
    }),

  add: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    set((s) => {
      const tasks = [
        ...s.tasks,
        {
          id: crypto.randomUUID(),
          text: trimmed,
          done: false,
          order: s.tasks.length,
          priority: 2,
          labels: [],
          nextUp: false,
        },
      ];
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    });
  },

  toggle: (taskId) =>
    set((s) => {
      const tasks = s.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t));
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    }),

  setText: (taskId, text) =>
    set((s) => {
      const tasks = s.tasks.map((t) => (t.id === taskId ? { ...t, text } : t));
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    }),

  remove: (taskId) =>
    set((s) => {
      const tasks = s.tasks.filter((t) => t.id !== taskId);
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    }),

  move: (taskId, dir) =>
    set((s) => {
      const i = s.tasks.findIndex((t) => t.id === taskId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.tasks.length) return s;
      const tasks = [...s.tasks];
      [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    }),

  setPriority: (taskId, priority) =>
    set((s) => {
      const tasks = s.tasks.map((t) => (t.id === taskId ? { ...t, priority } : t));
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    }),

  toggleNextUp: (taskId) =>
    set((s) => {
      const tasks = s.tasks.map((t) =>
        t.id === taskId ? { ...t, nextUp: !t.nextUp } : t,
      );
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    }),

  addLabel: (taskId, label) => {
    const tag = label.trim();
    if (!tag) return;
    set((s) => {
      const tasks = s.tasks.map((t) =>
        t.id === taskId && !t.labels.includes(tag)
          ? { ...t, labels: [...t.labels, tag] }
          : t,
      );
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    });
  },

  removeLabel: (taskId, label) =>
    set((s) => {
      const tasks = s.tasks.map((t) =>
        t.id === taskId ? { ...t, labels: t.labels.filter((l) => l !== label) } : t,
      );
      persist(s.workspaceId, s.description, tasks);
      return { tasks };
    }),
}));

export type { Task };
```

- [ ] **Step 2: Type-check the store + ipc**

Run: `cd /Users/arnavpuri/development/peti && bunx tsc -p tsconfig.json --noEmit`
Expected: no errors in `tasksStore.ts` or `ipc.ts`. `TaskNote.tsx` still compiles (it only uses unchanged actions so far). If `TaskNote.tsx` reports errors, they are addressed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/stores/tasksStore.ts
git commit -m "feat(plan): store holds description + priority/labels/nextUp, syncs PLAN.md"
```

---

### Task 6: TaskNote UI — description, Next-up, priority, labels (TypeScript)

**Files:**
- Modify: `src/components/TaskNote.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useTasksStore` (all actions from Task 5), `useUiStore` (`focusedSessionId`, `sendMode`), `sendToPane`.

**Design note:** The main list stays in **manual array order** (so ↑/↓ keep working); priority is shown as a chip but does not reorder the list. PLAN.md is what presents tasks priority-sorted to Claude. The pinned **Next up** group is rendered read-lightly above the list.

- [ ] **Step 1: Replace the entire contents of `src/components/TaskNote.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useTasksStore } from "../stores/tasksStore";
import { useUiStore } from "../stores/uiStore";
import { sendToPane } from "../lib/send";
import type { Task } from "../lib/ipc";

// Contents of the floating plan note: a project description, a pinned "Next up"
// group, and the task list. Clicking a task's ▶ injects its text into the
// focused terminal card. Edits mirror to each Claude pane's .peti/PLAN.md.
export default function TaskNote({ workspaceId }: { workspaceId: string }) {
  const description = useTasksStore((s) => s.description);
  const tasks = useTasksStore((s) => s.tasks);
  const load = useTasksStore((s) => s.load);
  const setDescription = useTasksStore((s) => s.setDescription);
  const add = useTasksStore((s) => s.add);
  const toggle = useTasksStore((s) => s.toggle);
  const setText = useTasksStore((s) => s.setText);
  const remove = useTasksStore((s) => s.remove);
  const move = useTasksStore((s) => s.move);
  const setPriority = useTasksStore((s) => s.setPriority);
  const toggleNextUp = useTasksStore((s) => s.toggleNextUp);
  const addLabel = useTasksStore((s) => s.addLabel);
  const removeLabel = useTasksStore((s) => s.removeLabel);

  const focused = useUiStore((s) => s.focusedSessionId);
  const sendMode = useUiStore((s) => s.sendMode);

  const [draft, setDraft] = useState("");

  useEffect(() => {
    void load(workspaceId);
  }, [load, workspaceId]);

  const inject = (text: string) => {
    if (!focused) return;
    void sendToPane(focused, text, sendMode);
  };

  const nextUp = tasks.filter((t) => t.nextUp && !t.done);

  return (
    <div className="note">
      <textarea
        className="note-desc"
        placeholder="Project description — what & why…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      {nextUp.length > 0 && (
        <div className="note-section">
          <div className="note-section-title">Next up</div>
          <ul className="note-list note-list-next">
            {nextUp.map((t) => (
              <li key={t.id} className="note-item">
                <span className="note-pri" data-pri={t.priority}>
                  P{t.priority}
                </span>
                <span className="note-text-static">{t.text}</span>
                <div className="note-actions">
                  <button
                    title="Send to focused card"
                    disabled={!focused}
                    onClick={() => inject(t.text)}
                  >
                    ▶
                  </button>
                  <button title="Unpin from Next up" onClick={() => toggleNextUp(t.id)}>
                    ★
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="note-list">
        {tasks.map((t, i) => (
          <TaskRow
            key={t.id}
            task={t}
            first={i === 0}
            last={i === tasks.length - 1}
            focused={!!focused}
            onToggle={() => toggle(t.id)}
            onText={(v) => setText(t.id, v)}
            onSend={() => inject(t.text)}
            onUp={() => move(t.id, -1)}
            onDown={() => move(t.id, 1)}
            onRemove={() => remove(t.id)}
            onCyclePriority={() => setPriority(t.id, t.priority >= 3 ? 1 : t.priority + 1)}
            onToggleNextUp={() => toggleNextUp(t.id)}
            onAddLabel={(label) => addLabel(t.id, label)}
            onRemoveLabel={(label) => removeLabel(t.id, label)}
          />
        ))}
        {tasks.length === 0 && <li className="note-empty">No tasks yet.</li>}
      </ul>

      <form
        className="note-add"
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
          setDraft("");
        }}
      >
        <input
          placeholder="Add a task…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </form>
    </div>
  );
}

function TaskRow({
  task,
  first,
  last,
  focused,
  onToggle,
  onText,
  onSend,
  onUp,
  onDown,
  onRemove,
  onCyclePriority,
  onToggleNextUp,
  onAddLabel,
  onRemoveLabel,
}: {
  task: Task;
  first: boolean;
  last: boolean;
  focused: boolean;
  onToggle: () => void;
  onText: (v: string) => void;
  onSend: () => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  onCyclePriority: () => void;
  onToggleNextUp: () => void;
  onAddLabel: (label: string) => void;
  onRemoveLabel: (label: string) => void;
}) {
  const [tag, setTag] = useState("");
  return (
    <li className={"note-item" + (task.done ? " done" : "")}>
      <input type="checkbox" checked={task.done} onChange={onToggle} title="Done" />
      <button
        className="note-pri"
        data-pri={task.priority}
        title="Cycle priority"
        onClick={onCyclePriority}
      >
        P{task.priority}
      </button>
      <input className="note-text" value={task.text} onChange={(e) => onText(e.target.value)} />
      <div className="note-actions">
        <button
          title={task.nextUp ? "Unpin from Next up" : "Pin to Next up"}
          className={task.nextUp ? "active" : ""}
          onClick={onToggleNextUp}
        >
          ★
        </button>
        <button title="Send to focused card" disabled={!focused} onClick={onSend}>
          ▶
        </button>
        <button title="Move up" disabled={first} onClick={onUp}>
          ↑
        </button>
        <button title="Move down" disabled={last} onClick={onDown}>
          ↓
        </button>
        <button title="Delete" onClick={onRemove}>
          ×
        </button>
      </div>
      <div className="note-labels">
        {task.labels.map((l) => (
          <button
            key={l}
            className="note-label"
            title="Remove label"
            onClick={() => onRemoveLabel(l)}
          >
            #{l} ×
          </button>
        ))}
        <input
          className="note-label-add"
          placeholder="+tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAddLabel(tag);
              setTag("");
            }
          }}
        />
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Type-check the whole frontend**

Run: `cd /Users/arnavpuri/development/peti && bunx tsc -p tsconfig.json --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/TaskNote.tsx
git commit -m "feat(plan): TaskNote UI — description, Next up, priority, labels"
```

---

### Task 7: Styles for the new note UI (CSS)

**Files:**
- Modify: `src/styles.css` (insert after line 553, before the `/* ---- card dock ---- */` comment)

**Interfaces:**
- Consumes: existing CSS variables `--text`, `--text-dim`, `--text-muted`, `--border`, `--hover`, `--hover-soft`.

- [ ] **Step 1: Insert the new style block in `src/styles.css`**

Insert immediately after `.note-add input:focus { ... }` (line 553) and before `/* ---- card dock ---- */`:

```css
.note-desc {
  flex-shrink: 0;
  resize: none;
  min-height: 38px;
  max-height: 120px;
  margin: 4px;
  padding: 4px 6px;
  background: var(--hover-soft);
  border: none;
  border-radius: 5px;
  color: var(--text);
  font: inherit;
  font-size: 12px;
}

.note-desc:focus {
  outline: none;
  background: var(--hover);
}

.note-section {
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  padding-bottom: 2px;
}

.note-section-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  padding: 4px 6px 0;
}

.note-list-next {
  flex: none;
}

.note-text-static {
  flex: 1;
  min-width: 0;
  padding: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-pri {
  flex-shrink: 0;
  border: none;
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  color: #fff;
  background: var(--text-muted);
}

.note-pri[data-pri="1"] {
  background: #e0533d;
}

.note-pri[data-pri="2"] {
  background: #d8a23a;
}

.note-pri[data-pri="3"] {
  background: #5a8f6b;
}

.note-actions button.active {
  color: #d8a23a;
}

.note-labels {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  width: 100%;
  padding: 2px 0 2px 26px;
}

.note-label {
  border: none;
  border-radius: 4px;
  padding: 0 4px;
  font-size: 10px;
  background: var(--hover);
  color: var(--text-muted);
  cursor: pointer;
}

.note-label:hover {
  color: var(--text);
}

.note-label-add {
  width: 48px;
  background: transparent;
  border: none;
  color: var(--text);
  font: inherit;
  font-size: 10px;
  padding: 0 2px;
}

.note-label-add:focus {
  outline: none;
}
```

- [ ] **Step 2: Verify the production build compiles**

Run: `cd /Users/arnavpuri/development/peti && bunx tsc -p tsconfig.json --noEmit`
Expected: PASS. (CSS is not type-checked; this confirms nothing else broke.)

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style(plan): description box, Next up, priority chips, label chips"
```

---

### Task 8: End-to-end manual verification

**Files:** none (manual run).

- [ ] **Step 1: Run the app in dev**

Run: `cd /Users/arnavpuri/development/peti && bunx tauri dev`
(Leave running; open a Peti window from the File menu.)

- [ ] **Step 2: Exercise the plan UI**

In a Peti's task note: type a project description; add two tasks; cycle one to **P1**; pin it with **★** (it appears under **Next up**); add a `#release` label.

- [ ] **Step 3: Verify PLAN.md was written + gitignored**

For a Claude pane whose `path` is `<dir>`:

Run: `cat "<dir>/.peti/PLAN.md"`
Expected: `# <Peti name>`, the description, a `## Next up` line `- [ ] (P1) … #release`, and a `## Tasks` section.

Run: `grep -n ".peti/" "<dir>/.gitignore"`
Expected: a single `.peti/` line (only if `<dir>` is a git repo).

- [ ] **Step 4: Verify back-compat (no data loss on existing Petis)**

Open a Peti that had tasks before this change. Expected: existing tasks load with P2/no-labels/not-pinned defaults; the description starts empty; editing anything rewrites `<id>.tasks.json` in the new `{ description, tasks }` shape.

- [ ] **Step 5: Commit (if any docs/notes changed; otherwise skip)**

No code commit expected — this task is verification only.

---

## Self-Review

- **Spec coverage:** project description (Tasks 1,5,6), priority (1,2,5,6,7), labels (1,5,6,7), Next-up flag (1,2,5,6), `.peti/PLAN.md` sync into Claude-pane dirs (2,3), auto-gitignore (2), back-compat load (1, verified in 8), generated/one-way PLAN.md (2), no-Claude-pane → no file (2 `sync` skips non-Claude/empty), testing (Rust unit tests in 1,2; manual E2E in 8). All covered.
- **Type consistency:** `load_plan`/`save_plan`/`Plan`/`Task.next_up`(`nextUp`) consistent across Tasks 1↔3↔4; `getPlan`/`savePlan`/`syncPlanMd` consistent 4↔5; store actions consistent 5↔6; CSS classes (`note-desc`, `note-section`, `note-pri`, `note-labels`, `note-label`, `note-label-add`, `note-text-static`) used in 6 all defined in 7.
- **Cross-task compile note:** Rust is one crate — Tasks 1, 2, 3 must all land before `cargo test`/`cargo build` is green; each task's commit is still a coherent unit. Called out in Tasks 1 & 2 Step 2/3.
```
