<div align="center">

# 📦 Peti

**A calm desktop home for juggling many small projects with Claude Code.**

[![License: MIT](https://img.shields.io/badge/License-MIT-5CD6AE.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20·%20Linux-555.svg)](#platform-support)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB.svg)](https://tauri.app)
[![Status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-e5a13a.svg)](#status)

</div>

> **Pre-alpha — expect breakage.** It's usable day-to-day on macOS, but it's young, unsigned, and
> moving fast. Back up nothing you can't lose.

**Peti** (Hindi for *box*) gives each project its own self-contained window. Inside, its repos run as
free-floating [Claude Code](https://docs.claude.com/en/docs/claude-code) terminals over a background
you recognise — with a task note, a prompt bar, and at-a-glance status so you can tell, across many
projects, which Claude is working and which one needs you.

It drives **your existing `claude` CLI** over a real PTY, so it runs on your own subscription auth —
**no API keys, no separate model config.**

## Screenshots

> _Drop a screenshot or short GIF at `docs/screenshot.png` and it'll render here._
> <!-- ![Peti](docs/screenshot.png) -->

## Features

- 🪟 **One window per Peti** — open a project and you're *inside* it: 2–3 repos as draggable,
  resizable, translucent terminal cards over a full-bleed background. No switcher, no clutter.
- 🤖 **Real Claude Code, your auth** — each card is the actual `claude` CLI in its repo. Insert/Send
  prompt modes, bracketed-paste so multi-line never mis-submits, and `resume` (`--continue`) panes.
- 🟢 **Know who needs you** — per-card status badges (working / awaiting / idle) read from Claude's own
  transcript, a **menubar count** of how many Claudes are waiting across *all* Petis, and a desktop
  **notification + chime** when one finishes.
- 🧰 **A dock for your cards** — a slim rail of every card; click to raise or reopen, and a **＋** to
  spawn a new **Claude**, **shell**, or **code-viewer** card on the fly.
- 📖 **Read-only code viewer** — a card kind that browses a repo and shows files with syntax
  highlighting (not an editor — a calm place to glance at what Claude is touching).
- ✅ **Plan note + prompt bar** — a floating note per Peti with a project **description** and tasks that
  carry a **priority (P1–P3)**, **labels**, and a pinned **Next up**. Peti mirrors the plan one-way into
  `.peti/PLAN.md` inside each Claude pane's repo (auto-gitignored) so Claude can read what to work on
  next. Click ▶ to inject a task into the focused card; the bottom bar sends to it; reusable **prompt
  snippets** included.
- 🎨 **Make it yours** — per-Peti background (bundled wallpapers, gradient presets, or your own image,
  swappable live), accent colour, and **light / dark / system** themes.
- 🌿 **Git at a glance** — current branch + a dirty-dot in each card's title bar.
- 🚀 **Per-Peti launchers** — generate a `<Name>.app` with its own icon, so a project is one click from
  your Dock or Desktop (via the `peti://` URL scheme).
- 🗂 **Fast setup** — scan a folder to turn its repos into cards; import/export a Peti as a TOML.

## Status

| Area | State |
|---|---|
| Core: windows, cards, Claude panes, planning + `PLAN.md` sync, prompt bar, resume | ✅ |
| Identity: backgrounds, wallpapers, themes, in-app editor | ✅ |
| Awareness: status badges, tray count, notifications, dock | ✅ |
| Extras: code viewer, snippets, git status, launchers, scan/import-export | ✅ |
| macOS packaged build (`.app` / `.dmg`) | ✅ |
| Code-signing / notarization, auto-update | ⛔ not yet |
| Linux build (AppImage / `.deb`) | ⚙️ configured, **unverified** (no CI yet) |
| Windows | 🚫 out of scope |

See [`PRD.md`](./PRD.md) for the full architecture and the phased plan.

## Install

There are no published releases yet — **build from source** (below). Once there are:

- Download the `.dmg`, drag **Peti.app** to `/Applications`.
- Builds are **unsigned**, so the first launch: **right-click Peti.app → Open → Open** (once). After
  that it opens normally.
- Launch it once so macOS registers the `peti://` scheme (needed by the per-Peti launchers).

## Build from source

**Prerequisites**

- [Rust](https://rustup.rs/) (stable) + your platform's Tauri system deps —
  [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)
- [Bun](https://bun.sh/)
- The [`claude` CLI](https://docs.claude.com/en/docs/claude-code) on your `PATH`, already logged in
- *(optional)* [ImageMagick](https://imagemagick.org/) — only for generating per-Peti launcher icons

```sh
git clone https://github.com/arnavpuri/peti.git
cd peti
bun install

bun run tauri dev      # run in dev
bun run tauri build    # package: .app + .dmg on macOS, AppImage + .deb on Linux
```

Bundles land in `src-tauri/target/release/bundle/`.

## Using it

Everything is driven from the **File** menu:

- **New Peti…** (`⌘N`) — the editor: name it, pick an accent + background, add panes (a repo folder
  running `claude`, a `shell`, or a read-only `code` viewer; optional `resume`). You can **scan a
  folder** to add its repos in one click, or **import** a Peti TOML.
- **Open Peti ▸** — open any Peti in its own window (several can be open at once).
- **Edit Peti ▸** — change/delete a Peti, **export** it, or **🚀 Create launcher…**.
- **Settings…** (`⌘,`) — default send mode, theme, alerts, and a default `--model` /
  `--permission-mode` for claude panes that don't set their own.

**Inside a Peti:** drag a card by its title bar, resize from the corner. The **dock** (top) lists every
card — click to raise, **＋** to add one. The floating **note** holds the project **description** and
tasks — set a **priority**, add **labels**, and **★ pin** the immediate ones to **Next up**; ▶ injects a
task into the focused card. Peti mirrors the plan to `<repo>/.peti/PLAN.md` (auto-gitignored) so a Claude
pane can read what's next. The **prompt bar** (bottom) sends to the focused card. The **🖼** button
(bottom-left) swaps the background. Positions, plan, layout, and background persist per Peti.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘N` / `⌘,` | New Peti / Settings |
| `⌘W` / `⌘Q` | Close window / Quit |
| `Enter` / `Shift+Enter` | Prompt bar: send / newline |
| `⌘C` / `⌘V` | Card terminal: copy selection / paste |
| `⌘F` / `⌘K` | Card terminal: find / clear |
| `⌘+` `⌘-` `⌘0` | Card terminal: font size |

## Configuration

Workspaces are plain files under your config directory — the editor writes them, but they're
hand-editable too:

- macOS: `~/Library/Application Support/com.arnavpuri.peti/`
- Linux: `~/.config/peti/`

```
<config>/
├─ workspaces/<id>.toml          # human-authored: panes, accent, background
├─ workspaces/<id>.layout.json   # app-managed: card geometry + live background
├─ workspaces/<id>.tasks.json    # app-managed: the plan (description + prioritized tasks)
├─ registry.json                 # pointers to in-repo .peti/workspace.toml files
├─ settings.json                 # theme, send mode, model, alerts
└─ snippets.json                 # reusable prompts
```

Each Claude pane's repo also gets a generated **`<repo>/.peti/PLAN.md`** — a one-way mirror of that
Peti's plan (description + tasks, with a `## Next up` section), rewritten on every edit so a Claude
session can read what's next. `.peti/` is added to the repo's `.gitignore` automatically.

A workspace TOML:

```toml
[workspace]
id         = "chanakya"
name       = "Chanakya AI"
background  = "wallpaper:paduret"   # bundled wallpaper, "preset:dusk", an image path, or omit
accent     = "#5CD6AE"

[[pane]]
label   = "api"
path    = "~/dev/chanakya/api"
type    = "claude"        # "claude" | "shell" | "code"
resume  = true            # spawn with `claude --continue`

[[pane]]
label = "web"
path  = "~/dev/chanakya/web"
type  = "code"            # read-only file viewer
```

## Architecture

Tauri 2 (Rust) backend · React + TypeScript frontend · xterm.js · `portable-pty` · Vite · Bun. One
backend process serves every Peti window; each window loads exactly one workspace. Pane status is
inferred from Claude's `~/.claude/projects/*.jsonl` transcripts — never by scraping the terminal. See
[`PRD.md`](./PRD.md) for the full design.

## Contributing

It's early and the shape is still moving, but issues and PRs are welcome — see
[`CONTRIBUTING.md`](./CONTRIBUTING.md). Good first areas: Linux verification + CI, signing/notarization,
and code-viewer polish.

## License

[MIT](./LICENSE) © 2026 Arnav Puri

Built on the excellent [Tauri](https://tauri.app), [xterm.js](https://xtermjs.org), and
[wezterm's portable-pty](https://github.com/wez/wezterm/tree/main/pty). Peti only ever drives the real
`claude` binary — it is not affiliated with Anthropic.
