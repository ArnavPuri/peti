# Peti Project Planning — Design

**Date:** 2026-06-26
**Status:** Approved (pending implementation plan)

## Summary

Each Peti gains a lightweight **plan**: a project **description** plus a
**prioritized task list** with a pinned **Next up** section. Peti remains the
single source of truth and mirrors the plan **one-way** into a `.peti/PLAN.md`
file inside each Claude pane's working directory, so a Claude session can read
the project description and know what to work on next.

This extends the existing per-Peti task feature (`<id>.tasks.json`, the floating
"tasks" note card, send-task-to-focused-card) rather than replacing it.

## Goals

- Give each Peti a short project description.
- Let tasks carry a **priority** (P1/P2/P3) and free-text **labels**.
- Surface an explicit **Next up** set (pinned tasks) separate from the backlog.
- Make the plan readable by Claude via a synced `.peti/PLAN.md` in the project.
- Keep the repo clean: auto-gitignore `.peti/` when the project is a git repo.

## Non-goals (YAGNI)

- No due dates / scheduling.
- No kanban board or drag-between-priority columns.
- No two-way sync: PLAN.md is **generated**, never parsed back. Peti always wins.
- No multi-user / assignment fields.

## Decisions (from brainstorming)

1. **Claude access mechanism:** a synced `.peti/PLAN.md` written into the Claude
   pane's working directory (chosen over prompt-injection or a send-button).
2. **Task richness:** priority + labels + an explicit Next-up flag.
3. **File location & git:** `.peti/PLAN.md` at the project root, and `.peti/`
   auto-added to the repo's `.gitignore` when a `.git` directory exists.

## Data model

The plan lives in the existing per-workspace sidecar
`<config_root>/workspaces/<id>.tasks.json` (filename unchanged to preserve the
workspace-deletion sidecar logic). Its content evolves from a bare task array
into a `Plan` object:

```jsonc
{
  "description": "One-paragraph what/why for the project",
  "tasks": [
    {
      "id": "uuid",
      "text": "Wire signing env vars",
      "done": false,
      "order": 0,
      "priority": 1,        // 1 = P1, 2 = P2 (default), 3 = P3
      "labels": ["release"],
      "nextUp": true
    }
  ]
}
```

### Backward compatibility

Loading is tolerant of the legacy format:

- If the file parses as a `Plan` object → use it.
- Else if it parses as a legacy `[Task, ...]` array → wrap it as
  `{ description: "", tasks: [...] }`.
- Else (missing/corrupt) → `{ description: "", tasks: [] }` (never errors).

All new `Task` fields use `#[serde(default)]` so older files load cleanly:
`priority` defaults to `2`, `labels` to `[]`, `nextUp` to `false`. The first
save rewrites the file in the new `Plan` shape — no separate migration step.

## Backend (Rust)

### `src-tauri/src/config/tasks.rs`

- Add the three new `Task` fields (all `#[serde(default)]`; `priority` uses a
  `default_priority()` returning `2`).
- Add a `Plan { description: String, tasks: Vec<Task> }` struct
  (`description` `#[serde(default)]`).
- `load_plan(id) -> Plan` — read file, try `Plan` then legacy `Vec<Task>` then
  empty; tasks sorted by `order` as today.
- `save_plan(id, plan) -> Result<(), String>` — `ensure_dirs()`, write
  pretty JSON.

### PLAN.md sync

New module responsibility (e.g. `config/plan_md.rs` or within `commands.rs`):

- `sync_plan_md(id)` IPC command:
  1. Load the workspace and its plan.
  2. Compute the **distinct set of Claude-pane working directories**
     (`pane.path`, tilde-expanded via `expand_tilde`). Panes of type `claude`
     only; deduplicate.
  3. For each directory:
     - Ensure `<dir>/.peti/` exists.
     - Render and write `<dir>/.peti/PLAN.md`.
     - If `<dir>/.git` exists, ensure `.peti/` is present in `<dir>/.gitignore`
       (append a line if missing; create the file if absent). Idempotent.
- Failures to write any single directory should not abort the others; return
  `Result<(), String>` summarizing, but prefer best-effort so one bad path does
  not block the rest. (Log/collect errors; surface a non-fatal message.)

### `src-tauri/src/lib.rs` + `commands.rs`

- Replace the `list_tasks` / `save_tasks` IPC pair with `get_plan` / `save_plan`.
- Add `sync_plan_md`.
- Update the `generate_handler!` registration accordingly.

## PLAN.md format (generated)

```markdown
# <Peti name>

<description>

## Next up
- [ ] (P1) Wire signing env vars  #release

## Tasks
- [ ] (P1) Linux CI  #infra
- [ ] (P2) Name availability check
- [x] World-ready README
```

Rendering rules:

- Title = the workspace/Peti name.
- Description paragraph (omit the blank block if empty).
- **Next up** section lists tasks with `nextUp == true && !done`, sorted by
  priority then order. Omit the section if empty.
- **Tasks** section lists the remaining tasks: unfinished first sorted by
  priority then order, then done tasks (`- [x]`) at the bottom.
- Each line: `- [ ] (P{priority}) {text}` followed by `  #{label}` for each
  label.

## Frontend

### `src/stores/tasksStore.ts`

- Add `description: string` to state and the new `Task` fields to the type.
- New actions: `setDescription(text)`, `setPriority(id, p)`,
  `toggleNextUp(id)`, `addLabel(id, label)`, `removeLabel(id, label)`.
- `load(id)` calls `getPlan(id)` and sets `{ description, tasks }`.
- The debounced module-level `persist()` calls `savePlan(workspaceId, plan)`
  **and then** `syncPlanMd(workspaceId)` (same 350 ms debounce).

### `src/components/TaskNote.tsx`

- A **description** textarea at the top of the card (autosaves via
  `setDescription`).
- A pinned **Next up** group (tasks with `nextUp`), rendered above the main
  list.
- The main list sorted by priority (P1→P3) then order. Each row gains:
  - a small **P1/P2/P3** priority chip/selector,
  - **label** chips with add/remove,
  - a **★ Next up** toggle,
  - alongside the existing done checkbox, inline text edit, ↑/↓ reorder,
    ▶ send-to-focused-card, and × delete controls.

### `src/lib/ipc.ts`

- Update the `Task` interface with `priority`, `labels`, `nextUp`.
- Add a `Plan` interface, `getPlan(id)`, `savePlan(id, plan)`, `syncPlanMd(id)`
  invoke wrappers; remove the old `listTasks` / `saveTasks` wrappers.

## Data flow

1. User edits description / tasks in `TaskNote.tsx`.
2. Store updates immediately (optimistic UI), schedules debounced `persist()`.
3. `persist()` → `savePlan` writes `<id>.tasks.json` → `syncPlanMd` writes
   `.peti/PLAN.md` into each distinct Claude-pane directory and ensures the
   gitignore entry.
4. A Claude session reads `.peti/PLAN.md` (naturally, or when told "check the
   plan") to see the description and Next-up items.

## Error handling

- Plan load never throws — falls back to empty/legacy as described.
- `sync_plan_md` is best-effort per directory; a single unwritable path must not
  block the others or the save. Errors are collected and surfaced non-fatally.
- `.gitignore` editing only triggers when `<dir>/.git` exists, and is idempotent
  (no duplicate `.peti/` lines).

## Testing

- Rust unit tests in `config/tasks.rs`:
  - legacy array file loads into a `Plan` with empty description and defaulted
    task fields;
  - round-trip `save_plan` → `load_plan` preserves all fields;
  - PLAN.md rendering: Next-up grouping, priority ordering, done-at-bottom,
    label suffixes, empty-section omission.
- `.gitignore` idempotency: running the ensure step twice yields a single
  `.peti/` entry.
```
