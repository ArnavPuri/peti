# Peti — project guide for Claude

Peti is a Tauri 2 (Rust) + React + TypeScript + Vite + Bun desktop app: a calm home for juggling many
small projects with Claude Code. One OS window per Peti; free-floating, draggable terminal/code cards
over a full-bleed background. macOS-first, Linux configured-but-unverified, Windows out of scope.

## Commands

```sh
bun install
bun run tauri dev            # run in dev (terminal-launched: inherits your PATH — see gotcha below)
bun run tauri build          # package: .app + .dmg (macOS), AppImage + .deb (Linux)
bunx tsc -p tsconfig.json --noEmit   # frontend type-check (there is NO frontend test runner)
bun run build                # vite production build
cd src-tauri && cargo test --lib     # Rust unit tests
cd src-tauri && cargo build          # compile the whole crate (it's one crate — must compile as a whole)
```

Bundles land in `src-tauri/target/release/bundle/`. To test a packaged change quickly:
`cp -R src-tauri/target/release/bundle/macos/Peti.app /Applications/ && xattr -dr com.apple.quarantine /Applications/Peti.app`.

## Architecture (the load-bearing decisions)

- **One window per Peti.** Opened from the native **File** menu or a `peti://open/<id>` launcher. Window
  label `peti:<id>`; the frontend (`src/App.tsx`) is a URL router on `?peti` / `?edit` / `?settings`.
  No in-app switcher. Editor/Settings windows keep title bars; Peti windows are borderless + maximized.
- **One PTY per pane** (`src-tauri/src/pty.rs`, portable-pty); reader thread emits `pane://output` /
  `pane://exit` as raw bytes. Per-window teardown by sessionId prefix `<id>::`.
- **Status is inferred from Claude's transcripts, never the terminal** (`src-tauri/src/status.rs`):
  `~/.claude/projects/<encoded-cwd>/<newest>.jsonl`, where the cwd encoding replaces every char not in
  `[A-Za-z0-9-]` with `-`. Last assistant `stop_reason` end_turn/stop_sequence/max_tokens → *awaiting*;
  tool_use / user line → *working*. A 1s poll emits `session://status` + a tray count of awaiting Petis.
- **Planning → PLAN.md sync.** A Peti's plan (`<config>/workspaces/<id>.tasks.json` = `{ description,
  tasks[] }`, each task with `priority`/`labels`/`next_up`) is mirrored one-way into
  `<claude-pane-cwd>/.peti/PLAN.md` by `src-tauri/src/config/plan_md.rs` (`get_plan`/`save_plan`/
  `sync_plan_md` IPC). Generated only — never parsed back; `.peti/` is auto-gitignored when the dir is a
  git repo. The `tasks.json` loader is back-compatible (legacy bare `[Task]` array → `Plan`).
- **Config** lives at `~/Library/Application Support/com.arnavpuri.peti/` (macOS) / `~/.config/peti/`
  (Linux): TOML for human-authored workspaces, JSON for layout/tasks/settings/snippets/registry.

## Gotchas (these have bitten us — don't relearn them)

- **GUI minimal-PATH:** a Finder/Dock-launched `.app` inherits only `/usr/bin:/bin:/usr/sbin:/sbin` — NOT
  your shell PATH. Anything Peti shells out to (PTY children AND `Command::new`, e.g. `claude` at
  `~/.local/bin`, `magick` at `/opt/homebrew/bin`) must assume that. Fix lives in `pty.rs`
  `build_child_path()` (captures the login-shell PATH) + a process-wide `set_var("PATH", …)` at startup.
  `tauri dev` hides this because the terminal passes PATH through.
- **PTY respawn storm:** `Terminal.tsx`'s effect deps are `[sessionId, cwd, command, args]`. If any is a
  fresh reference per render, every parent re-render kills + respawns all PTYs. Keep argv memoized,
  `PaneCard` is `React.memo` with sessionId-keyed stable callbacks, and store ephemeral cards' identity
  separately from their geometry.
- **Capabilities:** `getCurrentWindow().close()` needs `core:window:allow-close` — `core:default` omits it.

## Conventions

- Commit per feature; verify (`tsc` / `cargo test`) before committing. End commit messages with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Design docs / plans live under `docs/superpowers/specs/` and `docs/superpowers/plans/`.
