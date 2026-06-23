# Peti — Product Requirements Document

> **Name:** Peti *(Hindi for “box” — each workspace is a project's box)* · locked
> **Version:** 0.2 (build PRD) · **Status:** approved to build, pending Phase 0 gate
> **License:** MIT · **Distribution:** open source · **Platforms:** macOS + Linux

---

## 0. Locked decisions

| Decision | Choice |
|---|---|
| Name | **Peti** (Hindi for *box*) |
| Platforms (v1) | **macOS + Linux only** — no Windows/ConPTY in scope |
| License | **MIT** |
| Distribution | **Open source** (repo MIT from commit one; README marks it pre-alpha so there's no early polish burden) |
| Approach | **Path A** — puppet the real `claude` CLI via PTY |
| Stack | **Tauri 2** (Rust) · React + TypeScript · xterm.js · `portable-pty` · Zustand · Tailwind |
| Config storage | **Flat files** — TOML for human-authored config, JSON for app-managed task state |
| Ambient sound/music | **P2** (not v1) |

---

## 1. Summary

**Peti** (Hindi for *box*) is a calm, one-click desktop home for the solo developer juggling many small
projects. Each **workspace — a peti** — bundles its repos (2–3 folders), its Claude Code session(s), a
personal task list, and its own visual identity. Switching projects is one click instead of a
context-reconstruction ritual. The whole thing runs on the user's existing `claude` CLI auth (their
subscription) — no API keys.

**Core loop (the thing v1 must nail):**

> Open the app → see my workspaces → click one → its 2–3 repos open as terminal panes running Claude,
> over a background I recognise → I see my task list → I click a task or type in the prompt bar → it
> lands in Claude → I close the app and reopen tomorrow and resume where I was.

## 2. Goals / Non-goals

**Goals (v1):** one-click into any project (<5s to live panes); personal task list per project with
one-click task→prompt; instant visual recognition of which workspace you're in; runs on the user's
subscription auth; a flawless embedded terminal driving real Claude Code.

**Non-goals:** not an IDE (no in-app editor); not a multi-agent orchestrator; not cloud/hosted/
multi-user; no API-key model management; no terminal-scraping for state.

---

## 3. Architecture & technical design

### 3.1 Shape

```
┌──────────────────────────────── Tauri window ────────────────────────────────┐
│  React + TS frontend                                                          │
│   ├─ Workspace switcher (Zustand: workspacesStore)                            │
│   ├─ Pane grid  (react-resizable-panels)                                      │
│   │    └─ Terminal pane  →  xterm.js + fit/webgl addons                       │
│   ├─ Task panel (tasksStore)                                                  │
│   └─ Prompt bar (send-to-Claude)                                              │
│            │  invoke()                       ▲  emit()                         │
│            ▼  (Tauri IPC commands)           │  (Tauri events)                 │
│  Rust backend (src-tauri)                                                      │
│   ├─ PtyManager  — HashMap<SessionId, PtyHandle>                              │
│   │    openpty() → spawn `claude` → reader thread streams stdout → events     │
│   ├─ commands/   — list/save/spawn/write/resize/kill                          │
│   ├─ config/     — load/save workspaces (TOML) + tasks (JSON)                 │
│   └─ status/     — (P1) tail ~/.claude/projects/<path>/*.jsonl                │
└────────────────────────────────────┬──────────────────────────────────────────┘
                                      ▼
                          child process: real `claude` CLI
                          (uses the user's own subscription auth)
```

### 3.2 PTY model (the heart)

- One PTY per pane, created with `portable-pty`'s `native_pty_system().openpty(size)`.
- Spawn the pane's command (`claude`, or `claude --continue`, or a plain shell) in the pane's `cwd`.
- A dedicated reader thread reads the PTY master and emits `pane://output { session_id, data }`.
- Frontend writes user keystrokes back via `write_pane(session_id, bytes)`.
- Window/pane resize → `resize_pane(session_id, cols, rows)` → `pty.resize()` (drives SIGWINCH so
  Claude's TUI reflows).
- On pane close / app quit: kill the child (SIGTERM → SIGKILL fallback), join the reader thread, drop
  the handle. **Orphan cleanup is a correctness requirement, not a nicety.**

### 3.3 Send-to-Claude

Wrap the payload in bracketed paste so multi-line text doesn't trigger early submits:
`ESC[200~` + text + `ESC[201~`. Two modes (a setting):
- **Insert** — paste only; you review and press Enter yourself.
- **Send** — paste then append `\r` to submit.

Same path serves both the prompt bar and task injection.

### 3.4 IPC surface (initial)

**Commands (frontend → Rust):** `list_workspaces`, `get_workspace`, `save_workspace`,
`delete_workspace`, `spawn_pane`, `write_pane`, `resize_pane`, `kill_pane`, `list_tasks`, `save_task`,
`delete_task`, `reorder_tasks`.
**Events (Rust → frontend):** `pane://output`, `pane://exit`, *(P1)* `session://status`.

### 3.5 Frontend state (Zustand)

`workspacesStore` (definitions + active id) · `sessionsStore` (session_id ↔ pane, status) ·
`tasksStore` (per-workspace tasks) · `uiStore` (layout, focus, settings).

### 3.6 Repo structure

```
peti/
├─ src/                  # React + TS
│  ├─ components/        # Switcher, PaneGrid, Terminal, TaskPanel, PromptBar
│  ├─ stores/            # zustand stores
│  ├─ lib/               # ipc client, xterm setup, bracketed-paste helper
│  └─ styles/
├─ src-tauri/
│  ├─ src/
│  │  ├─ main.rs
│  │  ├─ pty/            # PtyManager, Session
│  │  ├─ commands/       # tauri command handlers
│  │  ├─ config/         # workspace (toml) + task (json) persistence
│  │  └─ status/         # (P1) jsonl tailer
│  ├─ Cargo.toml
│  └─ tauri.conf.json
├─ LICENSE               # MIT
└─ README.md
```

---

## 4. Data model

### 4.1 Workspace (TOML, human-authored)

A workspace can live in the global registry **or** as a `.peti/workspace.toml` inside a project root
(shareable / version-controllable with the repo).

```toml
# ~/.config/peti/workspaces/chanakya.toml   (Linux)
# ~/Library/Application Support/<bundle>/workspaces/chanakya.toml  (macOS)

[workspace]
id         = "chanakya"
name       = "Chanakya AI"
background  = "backgrounds/dusk-river.jpg"   # relative to config dir, or absolute
accent     = "#5CD6AE"

[[pane]]
label   = "dashboard"
path    = "~/dev/chanakya/dashboard"
type    = "claude"        # "claude" | "shell"
command = "claude"        # or "claude --continue"

[[pane]]
label = "api"
path  = "~/dev/chanakya/api"
type  = "claude"

[[pane]]
label = "karyakarta"
path  = "~/dev/chanakya/karyakarta-app"
type  = "claude"

[layout]
sizes = [0.34, 0.33, 0.33]   # persisted pane ratios
```

### 4.2 Tasks (JSON, app-managed — frequent writes)

```jsonc
// ~/.config/peti/workspaces/chanakya.tasks.json
[
  { "id": "t1", "text": "Wire Karyakarta auth to the dashboard session", "done": false, "order": 0 },
  { "id": "t2", "text": "Fix RAG citation overflow", "done": true,  "order": 1 }
]
```

TOML for config (stable, comment-friendly), JSON for tasks (mutates often, no comment round-trip pain).

---

## 5. Phase-by-phase development

Each phase ships independently and has a hard exit gate. Estimates assume your ~4 hrs/day solo cadence.

### Phase 0 — Terminal spike *(de-risk everything)*
**Goal:** prove a PTY ↔ xterm round-trip running the real `claude` binary. This is the whole technical
risk; nothing else is worth building until it's green.

Tasks:
- [ ] Scaffold Tauri 2 app (React + TS template, Bun or pnpm).
- [ ] Add `portable-pty`; build `PtyManager` (open, spawn, read-thread→event, write, resize, kill).
- [ ] Minimal React: one xterm.js terminal + `fit` addon, wired to the events/commands.
- [ ] Hardcode a `cwd` and launch `claude` in it.

Acceptance:
- [ ] `claude` launches inside the embedded terminal and is fully interactive.
- [ ] Typed input reaches Claude; output renders with correct colours / TUI.
- [ ] Resizing the window reflows Claude's UI (SIGWINCH works).
- [ ] **Shift+Tab cycles permission modes.**
- [ ] Ctrl+C, arrow keys, and paste behave.
- [ ] No dropped input under fast typing.
- [ ] Closing the pane kills the child cleanly — **no orphan process**.

**Gate:** all green, or stop and reconsider the approach (node-pty/Electron fallback) before sinking
more time. **Effort:** ~1 focused weekend.

### Phase 1 — Workspaces
**Goal:** define workspaces in config, open one in a click, multi-pane resizable layout, switcher,
persist layout. *(Catalog: A1–A4, B1–B3.)*

Tasks:
- [ ] Workspace TOML schema + serde load/save; config-dir resolution (XDG on Linux, App Support on macOS).
- [ ] Support both global registry and in-repo `.peti/workspace.toml`.
- [ ] `workspacesStore` + sidebar switcher UI.
- [ ] On "open workspace" → spawn one pane per `[[pane]]` in the right `cwd`.
- [ ] `react-resizable-panels` layout; persist `sizes` back to the workspace file.
- [ ] Sensible teardown/park when switching workspaces.

Acceptance:
- [ ] A 2-folder and a 3-folder workspace both open correctly, each pane running `claude` in its dir.
- [ ] Clicking a workspace brings up its panes in <5s.
- [ ] Pane sizes persist across an app restart.

**Gate:** open a real project's repos in one click. **Effort:** ~1 week.

### Phase 2 — Core loop *(tasks + send-to-Claude)*
**Goal:** personal task list per workspace, prompt bar, task→prompt injection, session resume.
*(Catalog: C1–C2, D1–D2, B4.)*

Tasks:
- [ ] Task JSON store + CRUD + reorder; `tasksStore`; task panel UI.
- [ ] Prompt bar component with target-pane selection (defaults to focused pane).
- [ ] Bracketed-paste send helper + Insert/Send modes (setting).
- [ ] Click-task-to-inject reuses the send path.
- [ ] Resume: spawn with `claude --continue` when the workspace/pane opts in.

Acceptance:
- [ ] Add / complete / reorder tasks persist across restart.
- [ ] Clicking a task injects its text into the chosen pane (and submits in Send mode).
- [ ] Prompt bar reliably reaches the right pane; multi-line prompts don't mis-submit.
- [ ] Reopening a workspace resumes the prior Claude sessions.

**Gate:** the full §1 core loop works end to end. **Effort:** ~1 week.

### Phase 3 — Identity → **v1**
**Goal:** per-workspace visual identity, in-app workspace editing, packaged builds, OSS hygiene.
*(Catalog: F1, A1 editor, H1, plus README/LICENSE.)*

Tasks:
- [ ] Render per-workspace background; translucent xterm theme floating over it.
- [ ] Workspace create/edit form (so you're not hand-editing TOML).
- [ ] App settings (default model, permission mode, send mode).
- [ ] Bundle macOS (.dmg/.app) and Linux (AppImage + .deb).
- [ ] `LICENSE` (MIT), `README` with build/run instructions, pre-alpha notice.

Acceptance:
- [ ] Each workspace shows its background with translucent panes; you can tell projects apart at a glance.
- [ ] You can create/edit a workspace entirely in-app.
- [ ] Fresh-clone build succeeds on both macOS and Linux.
- [ ] You're using it daily for real projects.

**Gate:** v1 done — daily use. **Effort:** ~1–1.5 weeks.

### Phase 4+ — Fast-follow (P1) → public release
JSONL status + desktop notifications + switcher badges · `TODO.md` sync · prompt templates/snippets ·
plain shell panes · terminal search/copy/clear/font · git branch + dirty status per pane · theme
presets + light/dark · completion chime · workspace templates + auto-detect · export/import configs ·
`WORKSPACE.md` manifest generator. Then polish the README/screenshots and announce the release.

---

## 6. Feature → phase traceability

| Phase | Catalog items |
|---|---|
| 0 | terminal spike (proves B1) |
| 1 | A1, A2, A3, A4, B1, B2, B3 |
| 2 | C1, C2, D1, D2, B4 |
| 3 (**v1**) | F1, A1 (editor), H1, + MIT/README |
| 4+ (P1) | A5–A8, B5–B7, C3–C5, D3, E1–E4, F2–F3, G1, H2, H4–H5 |
| Deferred (P2) | A9, B8–B11, C6–C7, D4–D5, E5–E6, F4–F5, G2, H3, I1–I4 |
| Cut | C8 (time tracking), I5 (scheduled prompts) |

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| PTY↔xterm fidelity (resize, alt-screen, Shift+Tab) | Phase 0 isolates it first; study opcode's process module; node-pty/Electron is the fallback if `portable-pty` fights us |
| Bracketed-paste mis-submits | Default to **Insert** mode; auto-Send is opt-in |
| Orphan processes | Explicit kill + reader-thread join on close/quit; verify in Phase 0 acceptance |
| Subscription auth breaks if Anthropic changes CLI behaviour | We only ever invoke the real `claude` binary; no SDK/API path in v1 |
| Scope creep from the P1 wishlist | Phases are gated; nothing P1 starts until v1 is in daily use |

---

## 8. Definition of done — v1

- The Phase 0 make-or-break terminal criteria all pass.
- The §1 core loop works end to end for a real 3-repo project.
- Project switch feels instant (<5s); the app never re-asks where repos are.
- Builds run on macOS and Linux from a clean clone.
- MIT `LICENSE` + a `README` a stranger can follow.

---

## 9. Open items (resolve before Phase 0 commits)

1. **Availability check for "Peti".** Name is chosen, but I couldn't verify these here — confirm the
   GitHub org/repo, npm name, crates.io name, a domain, and a quick trademark glance are clear before
   you bake `peti` into the bundle id and config paths. (Note: "peti" is a common word, so expect some
   namespace squatting — a scoped/qualified handle like `peti-app` or `getpeti` may be the fallback.)
2. **Public repo from day 1 vs at v1.** Working assumption: public + MIT from the first commit, with a
   clear "pre-alpha, expect breakage" README so there's no premature-polish pressure. Override if you'd
   rather build private through v1.

Everything else from the brief's §07 is now locked (§0 above).

---

*End of PRD. Next action on go-ahead: scaffold the Tauri 2 project and build the Phase 0 terminal spike.*
