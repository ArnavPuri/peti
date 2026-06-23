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
| **0** | Terminal spike — prove a PTY ↔ xterm round-trip running real `claude` | **in progress** |
| 1 | Workspaces (config, multi-pane layout, switcher) | not started |
| 2 | Core loop (tasks + send-to-Claude + resume) | not started |
| 3 | Identity → v1 (backgrounds, in-app editor, packaged builds) | not started |

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

This opens the Peti window with a single embedded terminal running `claude` in a hardcoded directory.
The spike's working directory is the `SPIKE_CWD` constant near the top of
[`src/App.tsx`](./src/App.tsx) — point it at any repo to test.

## Build

```sh
bun run tauri build
```

Produces a `.app`/`.dmg` on macOS and an AppImage/`.deb` on Linux. (Windows is out of scope for v1.)

## License

[MIT](./LICENSE) © 2026 Arnav Puri
