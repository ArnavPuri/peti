# Contributing to Peti

Thanks for taking a look! Peti is pre-alpha and the design is still moving, so the most useful thing
you can do is **open an issue first** for anything non-trivial — a quick discussion saves rework.

## Getting set up

See the [build-from-source](./README.md#build-from-source) section. In short:

```sh
bun install
bun run tauri dev
```

You'll need Rust (stable), Bun, and the [`claude` CLI](https://docs.claude.com/en/docs/claude-code)
logged in on your `PATH`.

## Project layout

```
src/                 React + TypeScript frontend
  components/        Cards, dock, prompt bar, note, editor, settings, code viewer
  stores/            Zustand stores (workspace, sessions, ui, tasks, settings, snippets)
  lib/               ipc client, send/bracketed-paste, backgrounds, theme
src-tauri/src/       Rust backend
  pty/               PtyManager — one PTY per pane, reader thread → events
  config/            workspace (TOML) + tasks/settings/snippets (JSON) + scan
  status.rs          infers pane state from Claude's *.jsonl transcripts
  window.rs          multi-window + native menu
  launcher.rs        per-Peti .app generation
  git.rs / fsview.rs git status + code-viewer file access
```

The [`PRD.md`](./PRD.md) is the source of truth for *why* things are shaped the way they are
(self-contained windows, floating cards, no terminal-scraping, etc.). Please skim it before larger
changes.

## Before you open a PR

- **Frontend:** `bunx tsc --noEmit` and `bun run build` are clean.
- **Backend:** `cargo build` and `cargo test` pass (run from `src-tauri/`).
- Keep changes focused; match the surrounding style (the codebase favours small, single-purpose files).
- Update `README.md` / `PRD.md` if you change user-facing behaviour or architecture.

## Good first areas

- **Linux:** verify the AppImage/`.deb` build on a real host and add CI.
- **Distribution:** code-signing + notarization + auto-update (Tauri updater).
- **Code viewer:** ignore rules (`node_modules`/`.git`), line numbers, "jump to the file Claude just
  edited."
- **Accessibility & theming:** light-mode polish on the glass cards.

## Reporting bugs

Include your OS, whether you ran the dev build or the packaged app, and the exact steps. Pane-spawn and
status issues are often environment-specific (PATH, shell, `claude` location) — mentioning those helps.

By contributing, you agree your contributions are licensed under the [MIT License](./LICENSE).
