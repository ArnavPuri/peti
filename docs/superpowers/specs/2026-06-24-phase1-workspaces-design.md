# Phase 1 — Workspaces · Design

> Spec for PRD Phase 1. Status: approved to build (2026-06-24).
> Builds on the Phase 0 terminal spike (commit `b92b75a`).

## Goal

Define workspaces in config, open one in a click into a multi-pane resizable layout, switch
between them, and persist layout. Each pane runs `claude` (or a shell) in its own directory.

**Acceptance (from PRD §5 Phase 1):**
- A 2-folder and a 3-folder workspace both open correctly, each pane running `claude` in its dir.
- Clicking a workspace brings up its panes in <5s.
- Pane sizes persist across an app restart.

## Locked decisions (2026-06-24)

1. **In-repo discovery → registry of pointers.** Global registry holds workspace TOMLs *and*
   pointer entries to in-repo `.peti/workspace.toml` paths the user has added. One list path covers
   both.
2. **Layout persistence → separate app-managed JSON.** Human TOML is never machine-written; live
   pane sizes live in `<id>.layout.json`, mirroring the tasks-JSON pattern.
3. **Workspace switch → teardown + respawn.** Switching kills the previous workspace's panes and
   spawns the new ones. (Phase 2 swaps respawn for `claude --continue`.)

## Config layout

Resolved via the `directories` crate:
- Linux: `~/.config/peti/`
- macOS: `~/Library/Application Support/com.arnavpuri.peti/`

```
<config>/
├─ workspaces/<id>.toml          # human-authored, never machine-written
├─ workspaces/<id>.layout.json   # app-managed live pane sizes: { "sizes": [..] }
└─ registry.json                 # [{ "id": "..", "path": "/abs/.peti/workspace.toml" }]
```

**Listing** = enumerate `workspaces/*.toml` (global) + load each pointer in `registry.json`
(in-repo). Both deserialize into the same `Workspace`. Duplicate ids: global wins, pointer is
skipped with a logged warning.

**Layout resolution** (read order): live `<id>.layout.json` → authored `[layout].sizes` in the
TOML → equal split (`1/n` each). Only the JSON is ever written.

## Data model

TOML shape (per PRD §4.1): `[workspace]` table, `[[pane]]` array, optional `[layout]`.

```rust
struct Workspace {
    id: String,
    name: String,
    background: Option<String>,   // unused until Phase 3
    accent: Option<String>,
    panes: Vec<PaneDef>,
}

struct PaneDef {
    label: String,
    path: String,                 // may start with ~ ; expanded at spawn
    pane_type: PaneType,          // serde rename "type": "claude" | "shell"
    command: Option<String>,      // default "claude" for claude panes; shell for shell panes
}
```

`~` expansion happens in Rust when resolving a pane's `cwd`/command for spawn. Raw strings stay in
the struct.

## Rust backend (`src-tauri/src/config/`)

- `mod.rs` — config-dir resolution (`directories`), `~` expansion helper, `ensure_dirs`.
- `workspace.rs` — `Workspace`/`PaneDef`/`PaneType` structs and serde; `WorkspaceFile` wrapper for
  the TOML tables; functions:
  - `list_workspaces() -> Vec<WorkspaceSummary>` (id, name, accent, background, pane_count)
  - `get_workspace(id) -> Workspace + resolved sizes`
  - `save_layout(id, sizes: Vec<f64>)` → writes `<id>.layout.json`
  - `add_workspace_pointer(path)` → appends a `{id, path}` entry to `registry.json`

New Tauri commands (registered in `lib.rs`): `list_workspaces`, `get_workspace`, `save_layout`,
`add_workspace_pointer`. (`save_workspace` / `delete_workspace` remain deferred to the Phase 3
in-app editor; Phase 1 opens hand-authored TOML.)

PTY commands from Phase 0 are unchanged.

## Frontend

- `stores/workspacesStore.ts` (Zustand) — `summaries`, `activeId`, `activeWorkspace`, `loadList()`,
  `open(id)`.
- `stores/sessionsStore.ts` — `paneId → { sessionId, status }` for UI (status best-effort:
  `spawning | running | exited`).
- **`components/Terminal.tsx`** — generalized to take `sessionId` / `cwd` / `command` / `args`
  props instead of the hardcoded `"spike"` id. Keyed by `sessionId` so React mounts/unmounts one
  per pane.
- `components/Switcher.tsx` — sidebar listing workspaces, accent dot, click → `open(id)`.
- `components/PaneGrid.tsx` — `react-resizable-panels` (horizontal), one `Terminal` per `[[pane]]`,
  initial sizes from resolved layout, `onLayout` → debounced `save_layout`.
- `App.tsx` — Switcher + PaneGrid (replaces the single hardcoded spike Terminal).

**Session ids:** `"<workspaceId>::<paneIndex>"` — stable per pane, reused on switch-back after the
prior PTY is killed.

**Switch = unmount-driven teardown:** changing `activeId` re-renders `PaneGrid` with the new
workspace's panes; old Terminals unmount and their existing effect-cleanup kills each PTY; new ones
spawn. No separate teardown code path. The Phase 0 window-destroyed handler still kills all on quit.

## New dependencies

- Rust: `directories`, `toml`
- Frontend: `zustand`, `react-resizable-panels`

## Out of scope (later phases)

- Background rendering / translucent panes, in-app create/edit form (Phase 3).
- Tasks, prompt bar, send-to-Claude, `--continue` resume (Phase 2).
- Parking panes alive across switches (deliberately not Phase 1).

## Risks

- **react-resizable-panels ↔ xterm fit:** panel resize must trigger the Terminal's `ResizeObserver`
  → `fit` → `resize_pane`. Verify the observer fires on panel drags, not just window resize.
- **Spawn latency for 3 panes:** must stay <5s. Spawns are independent; fire them on mount in
  parallel (one Terminal each), not sequentially.
- **Tilde / missing paths:** a pane whose `path` doesn't exist should surface an error in that pane,
  not crash the workspace open.
