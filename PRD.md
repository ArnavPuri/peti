# Peti — Product Requirements Document

> **Name:** Peti *(Hindi for “box” — each project gets its own box)* · locked
> **Version:** 0.3 (self-contained pivot) · **Status:** Phase 0 ✅ · Phase 1 in progress
> **License:** MIT · **Distribution:** open source · **Platforms:** macOS + Linux

---

## Changelog

- **0.3 — self-contained pivot (2026-06-24).** A reference screenshot reframed the product. Two
  structural changes, plus a re-sequence:
  - **Each Peti is self-contained.** No in-app workspace switcher and no launcher screen. A Peti
    runs as **its own OS window**; you open one via a **native menu** (or CLI arg). Several Petis
    can be open at once as independent windows. There is no way to hop to another Peti from *inside*
    one — a Peti is a single world.
  - **Panes are free-floating cards, not a tiled grid.** Inside a Peti, each terminal is a movable,
    resizable, translucent **floating window** (title chrome + close, overlap allowed, focus-to-front
    z-order) over a **full-bleed background**. The `react-resizable-panels` grid and the sidebar
    switcher from the first Phase-1 cut are **removed**.
  - **Identity moves forward.** The per-Peti background + translucent cards are the *frame* of the
    shell, not end-stage polish — so they land in Phase 1, not Phase 3.
- **0.2 — build PRD.** Original phased plan (Path A, Tauri 2 PTY puppet).

---

## 0. Locked decisions

| Decision | Choice |
|---|---|
| Name | **Peti** (Hindi for *box*) |
| Platforms (v1) | **macOS + Linux only** — no Windows/ConPTY in scope |
| License | **MIT** |
| Distribution | **Open source**, MIT from commit one; README marks it pre-alpha |
| Approach | **Path A** — puppet the real `claude` CLI via PTY |
| **Entry model** | **One OS window per Peti**, opened from a native menu (or CLI arg). No switcher, no launcher screen, no in-Peti way to open another Peti. |
| **Pane layout** | **Free-floating draggable/resizable cards** over a full-bleed background — *not* a tiled grid. Per-pane geometry persisted. |
| **Identity** | **Forward** — per-Peti background + translucent cards are core to the Phase-1 shell. |
| Stack | **Tauri 2** (Rust, multi-window) · React + TypeScript · xterm.js · `portable-pty` · Zustand · Tailwind/CSS · custom floating canvas |
| Config storage | **Flat files** — TOML for human-authored config, JSON for app-managed state (tasks, pane geometry) |
| Ambient sound/music | **P2** (the "Focus" player in the reference shot is post-v1) |
| Bundle id / config ns | `com.arnavpuri.peti` |

---

## 1. Summary

**Peti** (Hindi for *box*) is a calm, one-click desktop home for the solo developer juggling many
small projects. Each **Peti** is a self-contained window: it bundles a project's repos (2–3 folders),
their Claude Code session(s), a personal task list, and its own visual identity — a recognisable
background with translucent, free-floating terminal cards drifting over it. Opening a project is one
gesture instead of a context-reconstruction ritual. The whole thing runs on the user's existing
`claude` CLI auth (their subscription) — no API keys.

**Core loop (the thing v1 must nail):**

> Open a Peti (its own window) → its 2–3 repos appear as floating terminal cards running Claude, over
> a background I recognise → I see my task note → I click a task or type in the prompt bar → it lands
> in the focused Claude card → I close the window and reopen tomorrow and resume where I was.

## 2. Goals / Non-goals

**Goals (v1):** open any project into its own window in one gesture (<5s to live cards); instant
visual recognition (each Peti's background/identity); free-floating, draggable terminal cards that
feel like a calm desk, not an IDE; personal task list per Peti with one-click task→prompt; runs on
the user's subscription auth; a flawless embedded terminal driving real Claude Code; geometry/state
that survives a restart.

**Non-goals:** not an IDE (no in-app editor); not a multi-agent orchestrator (the "Hermes agent" in
the reference shot is out of scope); not cloud/hosted/multi-user; no API-key model management; no
terminal-scraping for state; **no in-app workspace switcher / launcher** (deliberately — a Peti is
self-contained).

---

## 3. Architecture & technical design

### 3.1 Shape

```
                       native app menu  ── "Peti ▸ Open ▸ <list of Petis>"
                              │  open_peti(id)  →  WebviewWindowBuilder
                              ▼
┌──────────────── Tauri window  (one per Peti, url: index.html?peti=<id>) ─────────────┐
│  React + TS frontend — reads ?peti=<id>, loads exactly ONE workspace                  │
│   ├─ Background layer  (full-bleed image / accent gradient)                           │
│   ├─ FloatingCanvas                                                                   │
│   │    └─ FloatingPane × N  (draggable + resizable + z-order)                         │
│   │          ├─ title chrome + close                                                 │
│   │          └─ Terminal pane → xterm.js + fit addon                                  │
│   ├─ Task note  (P2 of this pivot: tasksStore)                                        │
│   └─ Prompt bar (send-to-Claude)                                                      │
│            │  invoke()                       ▲  emit()                                 │
│            ▼  (Tauri IPC commands)           │  (Tauri events)                        │
│  Rust backend (src-tauri) — app-global, serves all Peti windows                       │
│   ├─ PtyManager  — HashMap<SessionId, PtyHandle>  (SessionId = "<petiId>::<idx>")     │
│   │    openpty() → spawn `claude` → reader thread streams stdout → events             │
│   ├─ window/    — open_peti, focus-if-exists, native menu build                       │
│   ├─ commands/  — spawn/write/resize/kill · list/get/save_layout · open_peti          │
│   └─ config/    — load workspaces (TOML) + tasks (JSON) + geometry (JSON)             │
└────────────────────────────────────┬──────────────────────────────────────────────────┘
                                      ▼
                          child process: real `claude` CLI
                          (uses the user's own subscription auth)
```

One backend process serves every Peti window. Windows are labelled `peti:<id>`; each frontend reads
its `?peti=<id>` query param and loads just that workspace — there is no cross-Peti state in the UI.

### 3.2 PTY model (the heart)

- One PTY per pane, created with `portable-pty`'s `native_pty_system().openpty(size)`.
- Spawn the pane's command (`claude`, `claude --continue`, or a shell) in the pane's `cwd`
  (`~` expanded backend-side).
- A dedicated reader thread reads the PTY master and emits `pane://output { session_id, data }`
  (raw bytes, so no UTF-8/escape sequence is split mid-chunk); EOF emits `pane://exit`.
- Frontend writes user keystrokes back via `write_pane(session_id, bytes)`.
- Pane/card resize → `resize_pane(session_id, cols, rows)` → `pty.resize()` (drives SIGWINCH so
  Claude's TUI reflows).
- **Window-scoped teardown.** `SessionId` is `"<petiId>::<paneIndex>"`. On a Peti window's
  `Destroyed`/`CloseRequested`, the backend kills only **that Peti's** sessions (kill-by-prefix),
  not every window's. Closing a single card kills just its child. **Orphan cleanup is a correctness
  requirement, not a nicety.**

### 3.3 Send-to-Claude

Wrap the payload in bracketed paste so multi-line text doesn't trigger early submits:
`ESC[200~` + text + `ESC[201~`. Two modes (a setting):
- **Insert** — paste only; you review and press Enter yourself.
- **Send** — paste then append `\r` to submit.

Same path serves both the prompt bar and task injection; the prompt bar targets the **focused**
floating card (or a chosen one).

### 3.4 IPC surface

**Commands (frontend → Rust):**
- Window/menu: `open_peti(id)` *(focus if its window already exists, else build it)*,
  `list_workspaces` *(also feeds the native menu)*.
- Config: `get_workspace(id)`, `save_layout(id, panes)` *(per-pane geometry)*,
  `add_workspace_pointer(path)`.
- PTY: `spawn_pane`, `write_pane`, `resize_pane`, `kill_pane`.
- Tasks *(Phase 2)*: `list_tasks`, `save_task`, `delete_task`, `reorder_tasks`.

**Events (Rust → frontend):** `pane://output`, `pane://exit`, *(P1)* `session://status`.

### 3.5 Frontend state (Zustand)

Each window hosts **one** Peti, so stores are window-scoped (no global switcher):
`workspaceStore` (the single loaded workspace + its panes) · `sessionsStore` (session_id ↔ card,
status) · `tasksStore` (this Peti's tasks) · `uiStore` (focused card, z-order, settings).

### 3.6 Repo structure

```
peti/
├─ src/                  # React + TS
│  ├─ components/        # Background, FloatingCanvas, FloatingPane, Terminal, TaskNote, PromptBar
│  ├─ stores/            # zustand stores (window-scoped)
│  ├─ lib/               # ipc client, xterm setup, bracketed-paste helper, command resolver
│  └─ styles/
├─ src-tauri/
│  ├─ src/
│  │  ├─ main.rs / lib.rs
│  │  ├─ pty/            # PtyManager, Session, kill-by-prefix
│  │  ├─ window/         # open_peti, focus-if-exists, native menu
│  │  ├─ commands/       # tauri command handlers
│  │  ├─ config/         # workspace (toml) + task (json) + geometry (json)
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
(registered as a pointer in `registry.json`, shareable with the repo).

```toml
# ~/.config/peti/workspaces/chanakya.toml                              (Linux)
# ~/Library/Application Support/com.arnavpuri.peti/workspaces/chanakya.toml   (macOS)

[workspace]
id         = "chanakya"
name       = "Chanakya AI"
background = "backgrounds/dusk-river.jpg"   # relative to config dir, or absolute; full-bleed
accent     = "#5CD6AE"

[[pane]]
label   = "dashboard"
path    = "~/dev/chanakya/dashboard"
type    = "claude"        # "claude" | "shell"
command = "claude"        # or "claude --continue"
# optional authored starting geometry (fractions of the canvas); else auto-cascade
# rect  = { x = 0.04, y = 0.06, w = 0.44, h = 0.5 }

[[pane]]
label = "api"
path  = "~/dev/chanakya/api"
type  = "claude"

[[pane]]
label = "karyakarta"
path  = "~/dev/chanakya/karyakarta-app"
type  = "claude"
```

The TOML is **never machine-written**. Live card geometry is app-managed (see 4.3).

### 4.2 Tasks (JSON, app-managed — frequent writes)

```jsonc
// ~/.config/peti/workspaces/chanakya.tasks.json
[
  { "id": "t1", "text": "Wire Karyakarta auth to the dashboard session", "done": false, "order": 0 },
  { "id": "t2", "text": "Fix RAG citation overflow", "done": true,  "order": 1 }
]
```

### 4.3 Pane geometry (JSON, app-managed)

Live floating-card positions, written as you drag/resize. Resolution order: this JSON → authored
`rect` in the TOML → auto-cascade.

```jsonc
// ~/.config/peti/workspaces/chanakya.layout.json
// fractions of the canvas (0–1); z is stacking order
{ "panes": [
  { "x": 0.04, "y": 0.06, "w": 0.44, "h": 0.50, "z": 1 },
  { "x": 0.50, "y": 0.06, "w": 0.44, "h": 0.50, "z": 2 },
  { "x": 0.27, "y": 0.40, "w": 0.44, "h": 0.50, "z": 3 }
] }
```

TOML for config (stable, comment-friendly); JSON for things that mutate often (tasks, geometry).

---

## 5. Phase-by-phase development

Each phase ships independently with a hard exit gate. Estimates assume a ~4 hrs/day solo cadence.

### Phase 0 — Terminal spike ✅ *(done)*
PTY ↔ xterm round-trip running the real `claude` binary: launches interactive, input/colour/TUI
correct, resize reflows (SIGWINCH), Shift+Tab cycles permission modes, Ctrl+C/arrows/paste behave,
no dropped input, clean kill with no orphan. **Gate passed.**

### Phase 1 — Self-contained Peti shell  *(the pivot — absorbs old Phase 1 + the identity frame)*
**Goal:** open a project into its **own window** as a recognisable, self-contained world of
free-floating Claude cards over a background.

Tasks:
- [x] Workspace TOML schema + serde load; config-dir resolution (XDG / App Support); global registry
  + in-repo `.peti` pointers. *(done in the first Phase-1 cut)*
- [ ] **Multi-window:** `open_peti(id)` via `WebviewWindowBuilder` (url `index.html?peti=<id>`,
  label `peti:<id>`); focus-if-exists; native **menu** listing Petis; open default/first on launch.
- [ ] **Remove** the sidebar switcher + `react-resizable-panels` grid.
- [ ] **Background layer:** full-bleed per-Peti background (image or accent gradient).
- [ ] **FloatingCanvas + FloatingPane:** draggable, resizable, translucent cards with title chrome +
  close + focus-to-front z-order; one `Terminal` each.
- [ ] **Per-pane geometry persistence** (`<id>.layout.json`); resolve live → authored `rect` →
  auto-cascade.
- [ ] **Window-scoped PTY teardown** (kill-by-prefix on window close).

Acceptance:
- [ ] A 2-folder and a 3-folder Peti each open in their own window, each card running `claude` in its
  dir, over the Peti's background; <5s to live cards.
- [ ] Cards drag, resize, and stack (focus brings to front); the terminal reflows on card resize.
- [ ] Card positions/sizes persist across an app restart.
- [ ] Closing a Peti window kills only that Peti's children — no orphans; other Peti windows unaffected.

**Gate:** open two real projects as two self-contained windows that look and feel distinct.
**Effort:** ~1–1.5 weeks.

### Phase 2 — Core loop *(tasks + send-to-Claude)*
**Goal:** the personal task note, prompt bar, task→prompt injection, and session resume — inside the
floating shell.

Tasks:
- [ ] Task JSON store + CRUD + reorder; `tasksStore`; **task note** UI (sticky-note styling).
- [ ] Prompt bar pinned to the canvas; targets the focused card (or a chosen one).
- [ ] Bracketed-paste send helper + Insert/Send modes (setting).
- [ ] Click-task-to-inject reuses the send path.
- [ ] Resume: spawn with `claude --continue` when the Peti/pane opts in.

Acceptance:
- [ ] Add / complete / reorder tasks persist across restart.
- [ ] Clicking a task injects its text into the chosen card (and submits in Send mode).
- [ ] Prompt bar reliably reaches the right card; multi-line prompts don't mis-submit.
- [ ] Reopening a Peti resumes the prior Claude sessions.

**Gate:** the full §1 core loop works end to end. **Effort:** ~1 week.

### Phase 3 — Authoring & ship → **v1**
**Goal:** create/edit Petis in-app (so you're not hand-editing TOML), settings, packaged builds, OSS
hygiene.

Tasks:
- [ ] Peti create/edit form (name, repos, background picker, accent) writing the TOML.
- [ ] App settings (default model, permission mode, send mode).
- [ ] Bundle macOS (.dmg/.app) and Linux (AppImage + .deb).
- [ ] `LICENSE` (MIT) ✅, `README` ✅ — keep current; add screenshots + build notes.

Acceptance:
- [ ] You can create/edit a Peti entirely in-app.
- [ ] Fresh-clone build succeeds on both macOS and Linux.
- [ ] You're using it daily for real projects.

**Gate:** v1 done — daily use. **Effort:** ~1–1.5 weeks.

### Phase 4+ — Fast-follow (P1/P2) → public release
JSONL status + desktop notifications · `TODO.md` sync · prompt templates/snippets · plain shell
cards · terminal search/copy/clear/font · git branch + dirty status per card · theme/background
presets + light/dark · completion chime · **ambient music player (the "Focus" window — P2)** ·
Peti templates + auto-detect · export/import configs. Then polish README/screenshots and announce.

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| PTY↔xterm fidelity (resize, alt-screen, Shift+Tab) | De-risked in Phase 0 ✅; raw-byte output path keeps sequences intact |
| Floating-card resize not reflowing the terminal | Card resize must drive the Terminal's `ResizeObserver` → `fit` → `resize_pane`; verify on drag, not just window resize |
| Multi-window PTY ownership / orphans | `SessionId = "<petiId>::<idx>"`; kill-by-prefix on window close; one app-global `PtyManager`; verify with `pgrep` |
| Bracketed-paste mis-submits | Default to **Insert** mode; auto-Send is opt-in |
| Subscription auth breaks if Anthropic changes the CLI | We only ever invoke the real `claude` binary; no SDK/API path in v1 |
| Scope creep (music player, agent panel from the shot) | Music is P2; the agent panel is an explicit non-goal; phases stay gated |

---

## 7. Definition of done — v1

- Phase 0 terminal criteria all pass. ✅
- The §1 core loop works end to end for a real 3-repo Peti.
- Opening a project into its own window feels instant (<5s); the app never re-asks where repos are.
- Each Peti is visually distinct at a glance; cards float, drag, resize, and persist.
- Builds run on macOS and Linux from a clean clone.
- MIT `LICENSE` + a `README` a stranger can follow.

---

## 8. Open items

1. **Name availability (§ unchanged).** Confirm GitHub org/repo, npm, crates.io, a domain, and a quick
   trademark glance for `peti` before leaning on it publicly. Bundle id is already `com.arnavpuri.peti`
   (cheap to change now, costly later). Fallbacks: `peti-app` / `getpeti`.
2. **Bootstrap with zero Petis.** Until the Phase-3 in-app editor exists, Petis are hand-authored
   TOML. On launch with none, show a minimal "add a Peti" window rather than a blank menu.
3. **Default Peti on launch.** Open the most-recently-used Peti (persist last), or the first
   alphabetically if none recorded.

---

*End of PRD. Current work: Phase 1 — reshape the shell to one-window-per-Peti with a floating canvas
over a background, then layer the Phase 2 core loop on top.*
