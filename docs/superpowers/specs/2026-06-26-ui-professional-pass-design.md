# Peti UI Professional Pass — Design

**Date:** 2026-06-26
**Status:** Approved
**Origin:** P1 in `.peti/PLAN.md` — "Improve the UI to make it look more professional."

## Problem

Peti's color system is already tokenized (`--text-*`, `--surface-*`, `--glass`, `--card`, theme-aware
light+dark). Everything else is ad-hoc:

- **Border-radius** scattered across 4 / 5 / 6 / 7 / 8 / 10 / 11 / 12px for similar surfaces.
- **Font-size** spread across nine values (9→18px) with no scale.
- **Spacing** (gap/padding) has no rhythm — 2/3/4/6/8/12/16/20/24px ad-hoc.
- **Status colors** (`#e5a13a` working, `#5cd6ae` awaiting, `#4a525e` idle) and **priority colors**
  (`#e0533d`/`#d8a23a`/`#5a8f6b`) are hardcoded hex, some inline, not theme-aware.
- **Backdrop blur** varies 14/16/18px with no stated principle.
- **The entire app is monospace** — the single biggest "hacker toy, not a product" signal.

This is a **polish / design-system pass**, not a redesign. Keep Peti's calm, glassy, immersive identity;
make it disciplined and intentional.

## Decisions

- **Typography identity: sans chrome + mono where technical.** Chrome (dock, plan note, buttons, labels,
  editor, settings, prompt-bar chrome) uses the macOS system sans (San Francisco via `-apple-system`).
  Monospace is retained only where it belongs: terminal output, code viewer, git-branch labels, file
  paths. No font bundling — system font, zero bundle cost, instantly native. (User-selected over
  all-mono and all-sans.)
- **Status colors decoupled from `--accent`** so badge semantics stay stable even when the user recolors
  their accent.
- **Incremental, verifiable commits**: tokens first, then typography, then one commit per surface group.
- **No frontend test runner exists** → verification is `bunx tsc -p tsconfig.json --noEmit` +
  `bun run build` + visual check in the installed app.

## Token system

All added to `src/styles.css`. Non-color tokens are theme-independent (defined once); color tokens get
`:root` (dark) + `.theme-light` variants like the existing palette.

| Group | Tokens |
|---|---|
| **Type family** | `--font-ui` = `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` · `--font-mono` = `ui-monospace, SFMono-Regular, Menlo, monospace` (the current stack) |
| **Type scale** | `--fs-xs: 11px` · `--fs-sm: 12px` · `--fs-md: 13px` · `--fs-lg: 15px` · `--fs-xl: 18px` (collapses the 9/10/14 strays; micro-labels use `--fs-xs` uppercase) |
| **Weights** | 400 body · 500 labels / dock chips / section titles · 600 window titles / primary buttons |
| **Radius** | `--r-ctrl: 6px` (buttons, inputs, small badges) · `--r-chip: 8px` (dock chips, label chips) · `--r-surface: 12px` (every floating glass surface: cards, dock, note, prompt bar, popovers, switcher) · pills/dots stay `50%` |
| **Spacing** | 4px rhythm: `--space-1: 4px` · `--space-2: 6px` · `--space-3: 8px` · `--space-4: 12px` · `--space-5: 16px` · `--space-6: 20px` · `--space-7: 24px` |
| **Blur** | `--blur-1: 16px` (cards) · `--blur-2: 18px` (dock / prompt / switcher) · `--blur-3: 20px` (popovers) |
| **Elevation** | `--elev-1: 0 8px 30px var(--shadow)` · `--elev-2: 0 10px 36px var(--shadow)` · `--elev-3: 0 16px 48px var(--shadow)` (paired with the blur tier of the same rank) |
| **Status** | `--status-working: #e5a13a` · `--status-awaiting: #5cd6ae` · `--status-idle: #4a525e` (theme-aware; independent of `--accent`) |
| **Priority** | `--pri-1: #e0533d` · `--pri-2: #d8a23a` · `--pri-3: #5a8f6b` (theme-aware) |
| **Motion** | `--t-fast: 120ms ease` (hover/press) · `--t-med: 200ms ease` (raise/expand) |

## Work, sequenced (one commit each)

1. **Tokens** — add the scale above to `:root` / `.theme-light`. No surface consumes them yet beyond
   the color/status/priority swaps that are pure substitutions of existing hardcoded values. Verify
   build is green and nothing visually regresses.
2. **Typography swap** — `body { font-family: var(--font-ui) }`; explicitly pin `var(--font-mono)` on
   the terminal (already mono, formalize via token), code viewer, git-branch labels (`.pane-card-git`),
   and path inputs. Confirm terminal/xterm font is untouched in behavior.
3. **Cards + title bar** — `.pane-card` radius → `--r-surface`, `--elev-1` + `--blur-1`; title bar
   spacing/typography onto tokens; status dots → status tokens.
4. **Dock + chips** — dock → `--r-surface`/`--elev-2`/`--blur-2`; chips → `--r-chip`; add button and
   close button → uniform 22px icon-button treatment.
5. **Plan note + rows** — note container onto tokens (keep the warm `--note` bg); rows → `--r-ctrl`,
   4px rhythm; priority chips → `--pri-*`; star/send/move/delete buttons → uniform icon-button.
   Preserve the `flex-wrap: wrap` fix on `.note-item`.
6. **Prompt bar + background switcher** — onto `--r-surface`/`--elev-2`/`--blur-2`; popovers →
   `--elev-3`/`--blur-3`; mode toggle + snippet buttons onto tokens.
7. **Editor + settings** — form inputs/selects → `--r-ctrl`, `--fs-md`; buttons → shared treatment;
   h1 → `--fs-xl`/600 sans; field labels → `--fs-xs` sans. CodeViewer chrome (container, tree) → tokens;
   leave the hljs *syntax* theme as a noted follow-up.
8. **Interaction polish** — a single shared icon-button class (22px square, `--hover` on hover,
   `--t-fast`); one accent focus-ring for inputs (`box-shadow: 0 0 0 2px` accent-tint); `--t-fast`
   transitions on all interactive elements; consistent active/pressed states.

## Components & boundaries

This touches one file primarily — `src/styles.css` — plus minimal className/style additions in
components where a mono pin or a shared button class is needed (`Terminal.tsx`, `CodeViewer.tsx`,
`PaneCard`/`FloatingCard`, `Dock.tsx`, `TaskNote.tsx`, `PromptBar.tsx`, `Editor.tsx`, `Settings.tsx`,
`BackgroundSwitcher.tsx`). No new components, no layout/feature changes, no Rust, no IPC.

## Constraints & risks

- **PTY respawn discipline:** purely CSS/className changes — must not alter `Terminal.tsx` effect deps
  (`[sessionId, cwd, command, args]`) or memoization. The xterm font stays mono and behaviorally
  identical.
- **Theme parity:** every new color token needs a `.theme-light` value; verify both themes per surface.
- **Accent customization:** status tokens stay independent of `--accent`; priority too.
- **Visual verification:** no test runner — each commit is type-checked, built, and eyeballed in
  `/Applications/Peti.app` (rebuild + reinstall as needed) in both light and dark.

## Out of scope (YAGNI)

Bundling custom fonts; theming the hljs code-viewer syntax palette; new components; any layout, feature,
or behavior change. Polish only.
