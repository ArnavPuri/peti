# Peti

> **Pre-alpha — expect breakage.** This is a work-in-progress and not yet usable for daily work.

**Peti** (Hindi for *box*) is a calm, one-click desktop home for the solo developer juggling many
small projects. Each **workspace — a peti** — bundles its repos, its Claude Code session(s), a personal
task list, and its own visual identity. It drives your existing `claude` CLI over a real PTY, so it runs
on your own subscription auth — no API keys.

See [`PRD.md`](./PRD.md) for the full product spec and phased plan.

## Status

| Phase | What | State |
|---|---|---|
| **0** | Terminal spike — PTY ↔ xterm round-trip running real `claude` | **done** |
| **1** | Self-contained Peti shell — one window per Peti, free-floating Claude cards over a background | **done** |
| **2** | Core loop — task note + prompt bar + send-to-Claude + resume | **done** |
| **3** | Authoring & ship → v1 — in-app editor, settings, packaged builds | **in progress** |

Each **Peti** opens as its own window (chosen from a native menu) — no in-app switcher, no launcher.
Inside, its repos run as draggable, resizable, translucent terminal cards over a recognisable
background, with a floating task note and a prompt bar. See [`PRD.md`](./PRD.md) for the full
architecture and phased plan.

## Stack

Tauri 2 (Rust) · React + TypeScript · xterm.js · `portable-pty` · Vite · Bun.

## Prerequisites

- [Rust](https://rustup.rs/) (stable) + the platform's Tauri system deps — see
  [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)
- [Bun](https://bun.sh/)
- The [`claude` CLI](https://docs.claude.com/en/docs/claude-code) on your `PATH`, already logged in

## Develop

```sh
bun install
bun run tauri dev
```

On first launch Peti opens your first Peti window (or a "create one" prompt if you have none).

## Using it

Everything is driven from the native **Peti** menu:

- **New Peti…** — opens the editor: name it, pick an accent + background image, add panes (each a repo
  folder running `claude` or a shell, with optional `resume`). Save drops you straight into the new
  Peti's window.
- **Open ▸** — open any Peti in its own window. Multiple Petis can be open at once; each is fully
  self-contained (no switcher).
- **Edit ▸** — change a Peti or delete it.
- **Settings…** — default send mode, and a default `--model` / `--permission-mode` applied to claude
  panes that don't set their own.

Inside a Peti: drag cards by their title bar, resize from the corner; the floating note holds your
tasks (click ▶ to inject one into the focused card); the bottom bar sends prompts to the focused card
(Enter sends, Shift+Enter for a newline; toggle Insert/Send). Positions, tasks, and layout persist.

Workspaces live as TOML under your config dir (`~/Library/Application Support/com.arnavpuri.peti/`
on macOS, `~/.config/peti/` on Linux); the editor writes them for you, but they're hand-editable too.

## Build

```sh
bun run tauri build
```

On macOS this produces `Peti.app` and a `.dmg` under `src-tauri/target/release/bundle/`. On Linux it
produces an AppImage and `.deb` (build on a Linux host — there's no cross-compile). Windows is out of
scope for v1. Builds are unsigned (pre-alpha).

## License

[MIT](./LICENSE) © 2026 Arnav Puri
