# Peti UI Professional Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Peti look like a polished product by introducing a real design-token system, a sans-chrome/mono-code typography split, and a consistency + interaction-polish sweep across every surface — without changing any layout, feature, or behavior.

**Architecture:** One source-of-truth token block added to `src/styles.css` `:root` / `.theme-light`, then every surface's hardcoded radius / font-size / spacing / shadow / blur / status-color value is swept onto those tokens. Components get minimal className/`var(--font-mono)` additions only where a mono pin or a shared icon-button class is needed. No Rust, no IPC, no new components.

**Tech Stack:** React + TypeScript + Vite + Bun; plain CSS custom properties (no preprocessor, no Tailwind).

## Global Constraints

- **No frontend test runner exists.** Per-task verification is: `bunx tsc -p tsconfig.json --noEmit` (clean) + `bun run build` (clean) + a visual eyeball in **both light and dark** themes. There is no red/green TDD cycle here.
- **PTY respawn discipline:** do NOT touch `Terminal.tsx` effect deps (`[sessionId, cwd, command, args]`), its memoization, or `PaneCard`'s `React.memo`/callback identity. Typography changes to the terminal must be CSS/`fontFamily`-token only and behaviorally identical.
- **Theme parity:** every new *color* token MUST have a `.theme-light` value. Non-color tokens (radius/space/fs/blur/elev/motion) are defined once in `:root` only.
- **Status & priority colors stay independent of `--accent`** so badge meaning is stable when the user recolors accent.
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Scope:** polish only. No bundled fonts, no hljs syntax-theme work, no layout/feature/behavior changes. Preserve the existing `flex-wrap: wrap` fix on `.note-item`.
- **Branch:** all work lands on `feat/ui-professional-pass`.

---

### Task 1: Token foundation

**Files:**
- Modify: `src/styles.css` (the `:root` block and the `.theme-light` block — add tokens; also substitute the existing hardcoded status/priority hex with the new tokens at their definition sites)

**Interfaces:**
- Produces (consumed by every later task): the CSS custom properties below. Later tasks reference these names exactly: `--font-ui`, `--font-mono`, `--fs-xs/sm/md/lg/xl`, `--r-ctrl/chip/surface`, `--space-1..7`, `--blur-1/2/3`, `--elev-1/2/3`, `--t-fast/med`, `--status-working/awaiting/idle`, `--pri-1/2/3`.

- [ ] **Step 1: Add the token block to `:root`**

Add inside the existing `:root { … }` (after the current color vars):

```css
  /* ── Typography ─────────────────────────────── */
  --font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --fs-xs: 11px;
  --fs-sm: 12px;
  --fs-md: 13px;
  --fs-lg: 15px;
  --fs-xl: 18px;

  /* ── Radius ─────────────────────────────────── */
  --r-ctrl: 6px;     /* buttons, inputs, small badges */
  --r-chip: 8px;     /* dock chips, label chips */
  --r-surface: 12px; /* every floating glass surface */

  /* ── Spacing (4px rhythm) ───────────────────── */
  --space-1: 4px;
  --space-2: 6px;
  --space-3: 8px;
  --space-4: 12px;
  --space-5: 16px;
  --space-6: 20px;
  --space-7: 24px;

  /* ── Glass: blur + elevation tiers ──────────── */
  --blur-1: 16px;  /* cards */
  --blur-2: 18px;  /* dock / prompt bar / switcher */
  --blur-3: 20px;  /* popovers */
  --elev-1: 0 8px 30px var(--shadow);
  --elev-2: 0 10px 36px var(--shadow);
  --elev-3: 0 16px 48px var(--shadow);

  /* ── Motion ─────────────────────────────────── */
  --t-fast: 120ms ease;
  --t-med: 200ms ease;

  /* ── Status (independent of --accent) ───────── */
  --status-working: #e5a13a;
  --status-awaiting: #5cd6ae;
  --status-idle: #4a525e;

  /* ── Priority ───────────────────────────────── */
  --pri-1: #e0533d;
  --pri-2: #d8a23a;
  --pri-3: #5a8f6b;
```

- [ ] **Step 2: Add light-theme color variants to `.theme-light`**

Add inside the existing `.theme-light { … }` block (only the *color* tokens — never the non-color ones):

```css
  --status-working: #c2820f;
  --status-awaiting: #1f9e7e;
  --status-idle: #8a94a0;
  --pri-1: #c2433d;
  --pri-2: #b07d1a;
  --pri-3: #3f7a58;
```

- [ ] **Step 3: Substitute existing hardcoded status/priority hex with the tokens**

Find every existing hardcoded occurrence and replace with the token (search the file for these literals):
- `#e5a13a` (working dot, e.g. `.pane-card-dot.status-working`) → `var(--status-working)`
- `#5cd6ae` / `#5cd6aeaa` used for the **awaiting status dot/glow** (e.g. `.pane-card-dot.status-awaiting`, its glow shadow) → `var(--status-awaiting)` (for the glow, use `var(--status-awaiting)` and keep an alpha via a separate rgba if needed — if the original was `#5cd6aeaa`, replace the shadow color with `color-mix(in srgb, var(--status-awaiting) 67%, transparent)`).
- `#4a525e` (idle dot) → `var(--status-idle)`
- `#e0533d` / `#d8a23a` / `#5a8f6b` (priority chips `.note-pri[data-pri="1|2|3"]`) → `var(--pri-1|2|3)`

Do NOT touch `#5cd6ae` where it is the **accent fallback** in `Editor.tsx`/`BackgroundSwitcher.tsx` — that is accent, not status. This step is CSS-only.

- [ ] **Step 4: Verify build is green and nothing regressed**

```bash
bunx tsc -p tsconfig.json --noEmit
bun run build
```
Expected: both succeed with no errors. Visual: app looks **identical** to before (this task only defines tokens + substitutes equal-valued hex — zero intended visual change in dark theme; light-theme status/priority colors shift slightly to the new variants).

- [ ] **Step 5: Commit**

```bash
git add src/styles.css
git commit -m "feat(ui): add design-token foundation (type scale, radius, spacing, elevation, status/priority colors)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Typography swap (sans chrome, mono where technical)

**Files:**
- Modify: `src/styles.css` (`body` font-family; pin mono on technical selectors)
- Modify: `src/components/Terminal.tsx` (formalize the xterm `fontFamily` to the mono stack — value-identical, no effect-dep change)
- Modify: `src/components/CodeViewer.tsx` only if its code/tree font is set inline rather than via CSS (otherwise CSS-only)

**Interfaces:**
- Consumes: `--font-ui`, `--font-mono` from Task 1.
- Produces: a codebase where chrome is sans and only terminal/code/branches/paths are mono.

- [ ] **Step 1: Switch the body to sans**

In `src/styles.css`, change the `body` rule's `font-family` from the monospace stack to:

```css
  font-family: var(--font-ui);
```

- [ ] **Step 2: Pin mono on the technical selectors**

Set `font-family: var(--font-mono);` explicitly on these (they currently inherit mono from body and must keep it):
- the code-viewer code + tree: `.cv-pre code`, `.cv-pre`, `.cv-tree`, `.cv-row`
- git branch label in card title: `.pane-card-git`
- any path input field in the editor (e.g. `.path-input input`, the pane path field) — pin mono so file paths stay monospaced
- the terminal mount, if it has a CSS font-family rule

- [ ] **Step 3: Confirm the terminal font is unchanged in behavior**

In `src/components/Terminal.tsx`, if `fontFamily` is passed to xterm, set it to the same mono stack string (or a `--font-mono`-equivalent literal). Do NOT add/remove anything from the effect deps array `[sessionId, cwd, command, args]`. The font value must be identical to today's.

- [ ] **Step 4: Verify**

```bash
bunx tsc -p tsconfig.json --noEmit
bun run build
```
Visual check (both themes): dock labels, plan-note text, editor/settings labels, buttons are now **sans**; terminal output, code viewer, git branches, and file paths are still **mono**. Terminal panes did not respawn / reflow abnormally.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css src/components/Terminal.tsx src/components/CodeViewer.tsx
git commit -m "feat(ui): sans-serif chrome, monospace only for terminal/code/branches/paths

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Shared icon-button + input-focus primitives

**Files:**
- Modify: `src/styles.css` (add two reusable rules near the top of the component section)

**Interfaces:**
- Consumes: `--r-ctrl`, `--hover`, `--t-fast`, `--accent`, `--fs-md` from Tasks 1 / existing palette.
- Produces: `.icon-btn` (22px square icon button) and a shared `:focus-visible` input ring used by Tasks 4–8. Later tasks add `.icon-btn` to existing buttons rather than re-styling each.

- [ ] **Step 1: Add the shared primitives**

```css
/* Shared 22px square icon button — apply alongside existing button classes. */
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: var(--r-ctrl);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background var(--t-fast), color var(--t-fast);
}
.icon-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.icon-btn:active {
  background: var(--hover-soft);
}

/* Shared focus ring for text inputs / textareas / selects. */
.input-base:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
}
```

- [ ] **Step 2: Verify**

```bash
bunx tsc -p tsconfig.json --noEmit
bun run build
```
Visual: focus an input anywhere — it shows an accent ring. No layout shift. (`.icon-btn` is not yet applied to anything; defining it is harmless.)

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat(ui): shared icon-button + accent input focus-ring primitives

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Cards + title bar onto tokens

**Files:**
- Modify: `src/styles.css` (`.pane-card`, `.pane-card.gesturing`, `.pane-card-title`, `.pane-card-label`, `.pane-card-git`, `.pane-card-close`, `.pane-card-dot` and status variants)

**Interfaces:**
- Consumes: `--r-surface`, `--elev-1`, `--blur-1`, `--fs-sm/xs`, `--space-*`, `--t-fast`, status tokens, `.icon-btn`.

- [ ] **Step 1: Card frame onto tokens**

- `.pane-card`: `border-radius: var(--r-surface);` · `box-shadow: var(--elev-1);` · `backdrop-filter: blur(var(--blur-1));`
- `.pane-card.gesturing`: keep the existing blur-drop behavior but its resting shadow → `var(--elev-2)` (slightly raised while dragging).

- [ ] **Step 2: Title bar typography + spacing**

- `.pane-card-title`: `gap: var(--space-3);` · horizontal padding → `0 var(--space-4);`
- `.pane-card-label`: `font-size: var(--fs-sm);` `font-weight: 500;` (sans, inherits `--font-ui`)
- `.pane-card-git`: `font-size: var(--fs-xs);` (stays `var(--font-mono)` from Task 2)

- [ ] **Step 3: Status dots → status tokens + close button**

- `.pane-card-dot.status-working` → `background: var(--status-working);`
- `.pane-card-dot.status-awaiting` → `background: var(--status-awaiting);` and its glow shadow → `0 0 6px color-mix(in srgb, var(--status-awaiting) 67%, transparent)`
- `.pane-card-dot.status-idle` → `background: var(--status-idle);`
- `.pane-card-close`: add `icon-btn` class in `FloatingCard.tsx`/`PaneCard` markup (or align its CSS to the `.icon-btn` spec: 22px square, `--r-ctrl`, hover `--hover`).

- [ ] **Step 4: Verify (both themes)**

```bash
bunx tsc -p tsconfig.json --noEmit
bun run build
```
Visual: cards have a consistent 12px radius + softer elevation; title label is sans 500; status dots unchanged in color (dark) and correct in light; close button has uniform hover.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css src/components/FloatingCard.tsx src/components/PaneCard.tsx
git commit -m "feat(ui): cards + title bar onto radius/elevation/typography tokens

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Dock + chips onto tokens

**Files:**
- Modify: `src/styles.css` (`.dock`, `.dock-chip`, `.dock-raise`, `.dock-close`, `.dock-add`, `.dock-add-pop` and its buttons)
- Modify: `src/components/Dock.tsx` (add `icon-btn` to the close + add buttons)

**Interfaces:**
- Consumes: `--r-surface/chip`, `--elev-2/3`, `--blur-2/3`, `--fs-sm`, `--space-*`, `.icon-btn`.

- [ ] **Step 1: Dock container + chips**

- `.dock`: `border-radius: var(--r-surface);` · `box-shadow: var(--elev-2);` · `backdrop-filter: blur(var(--blur-2));` · `gap`/`padding` → `var(--space-1/2)`
- `.dock-chip`: `border-radius: var(--r-chip);` · label `font-size: var(--fs-sm);` `font-weight: 500;` · `gap: var(--space-2);`

- [ ] **Step 2: Dock buttons + popover**

- `.dock-close`, `.dock-add`: apply `.icon-btn` (22px square — fixes the current asymmetric 18×22). Add the class in `Dock.tsx`.
- `.dock-add-pop`: `border-radius: var(--r-surface);` · `box-shadow: var(--elev-3);` · `backdrop-filter: blur(var(--blur-3));`
- `.dock-add-pop` buttons: `border-radius: var(--r-ctrl);` · `font-size: var(--fs-sm);`

- [ ] **Step 3: Verify (both themes)**

```bash
bunx tsc -p tsconfig.json --noEmit
bun run build
```
Visual: dock radius matches cards; chips uniform; add/close buttons are equal 22px squares with consistent hover; the add popover sits at the top elevation tier.

- [ ] **Step 4: Commit**

```bash
git add src/styles.css src/components/Dock.tsx
git commit -m "feat(ui): dock + chips + add-popover onto tokens; uniform icon buttons

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Plan note + rows onto tokens

**Files:**
- Modify: `src/styles.css` (`.note-*` selectors)
- Modify: `src/components/TaskNote.tsx` (add `icon-btn` to the row action buttons)

**Interfaces:**
- Consumes: `--r-ctrl`, `--fs-sm/xs`, `--space-*`, `--pri-1/2/3`, `.icon-btn`.

- [ ] **Step 1: Note container + sections**

- `.note-desc`: `border-radius: var(--r-ctrl);` · `font-size: var(--fs-sm);`
- `.note-section-title`: `font-size: var(--fs-xs);` keep uppercase + letter-spacing; `font-weight: 500;`
- `.note-list`, `.note-item`, `.note-add`: spacing/gap → `var(--space-1/2)`. **Keep `flex-wrap: wrap` on `.note-item`.**

- [ ] **Step 2: Rows, priority chips, labels, action buttons**

- `.note-item`: `border-radius: var(--r-ctrl);`
- `.note-text`: `font-size: var(--fs-sm);`
- `.note-pri[data-pri="1|2|3"]`: backgrounds already → `var(--pri-1|2|3)` from Task 1; set `border-radius: var(--r-ctrl);` `font-weight: 600;`
- `.note-label`, `.note-label-add`: `border-radius: var(--r-chip);` · `font-size: var(--fs-xs);` (label text may stay mono if it reads better as `#tag` — keep current family)
- `.note-actions button` (★ pin, ▶ send, ↑ ↓ move, × delete): apply `.icon-btn` in `TaskNote.tsx`.

- [ ] **Step 3: Verify (both themes)**

```bash
bunx tsc -p tsconfig.json --noEmit
bun run build
```
Visual: task text fully visible (wrap intact); priority chips themed; action buttons uniform 22px with consistent hover; description box matches control radius.

- [ ] **Step 4: Commit**

```bash
git add src/styles.css src/components/TaskNote.tsx
git commit -m "feat(ui): plan note + task rows onto tokens; uniform row action buttons

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Prompt bar + background switcher onto tokens

**Files:**
- Modify: `src/styles.css` (`.promptbar*`, `.snips-*`, `.bgswitch-*`)
- Modify: `src/components/PromptBar.tsx`, `src/components/BackgroundSwitcher.tsx` (add `icon-btn` where applicable)

**Interfaces:**
- Consumes: `--r-surface/ctrl`, `--elev-2/3`, `--blur-2/3`, `--fs-sm/md`, `--space-*`, `.icon-btn`.

- [ ] **Step 1: Prompt bar**

- `.promptbar`: `border-radius: var(--r-surface);` · `box-shadow: var(--elev-2);` · `backdrop-filter: blur(var(--blur-2));` · `gap: var(--space-3);`
- `.promptbar-input`: `font-size: var(--fs-md);`
- `.promptbar-mode`: `border-radius: var(--r-ctrl);` · `font-size: var(--fs-sm);`
- `.snips-pop` / `.promptbar-snips`: `border-radius: var(--r-surface);` · `box-shadow: var(--elev-3);` · `backdrop-filter: blur(var(--blur-3));`; inner `.snips-use/.snips-del/.snips-save` → `var(--r-ctrl)`, `var(--fs-sm)`.

- [ ] **Step 2: Background switcher**

- `.bgswitch-btn`: `border-radius: var(--r-surface);` · `box-shadow: var(--elev-2);` · `backdrop-filter: blur(var(--blur-2));` (apply `.icon-btn` only if it visually fits the 🖼 button; otherwise just token the radius/elevation)
- `.bgswitch-pop`: `border-radius: var(--r-surface);` · `box-shadow: var(--elev-3);` · `backdrop-filter: blur(var(--blur-3));`
- `.bgswitch-section`: `font-size: var(--fs-xs);` keep uppercase
- `.bgswitch-swatch`, `.bgswitch-image`: `border-radius: var(--r-chip);` · grid `gap: var(--space-2);`

- [ ] **Step 3: Verify (both themes)**

```bash
bunx tsc -p tsconfig.json --noEmit
bun run build
```
Visual: prompt bar + switcher share the surface radius and the dock's elevation tier; their popovers use the top tier; mode toggle + snippet controls consistent.

- [ ] **Step 4: Commit**

```bash
git add src/styles.css src/components/PromptBar.tsx src/components/BackgroundSwitcher.tsx
git commit -m "feat(ui): prompt bar + background switcher onto tokens

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Editor + settings + code-viewer chrome; final polish sweep

**Files:**
- Modify: `src/styles.css` (`.editor*`, `.field*`, `.panes*`, `.pane-row`, `.pane-del`, `.path-input`, `.scan-*`, `.btn-primary`, `.cv-*` chrome, `.empty-*`, `.term-find*`)
- Modify: `src/components/Editor.tsx`, `src/components/Settings.tsx` (apply shared button class where helpful)

**Interfaces:**
- Consumes: every token + `.icon-btn` + the input focus-ring.

- [ ] **Step 1: Editor + settings forms**

- `.editor h1`: `font-size: var(--fs-xl);` `font-weight: 600;` (sans)
- `.field > span` / field labels: `font-size: var(--fs-xs);` (sans)
- `.editor input, .editor select, .path-input input`: `border-radius: var(--r-ctrl);` · `font-size: var(--fs-md);` · padding → `var(--space-2) var(--space-3);` (consistent density). Paths keep `--font-mono` (Task 2).
- `.editor-actions button`, `.editor-toolbar button`, `.btn-primary`, `.pane-del`, `.scan-head button`: `border-radius: var(--r-ctrl);` · `font-size: var(--fs-sm);` · `transition: ... var(--t-fast);`. `.btn-primary` stays `font-weight: 600;` with accent background.

- [ ] **Step 2: Code-viewer chrome + remaining surfaces**

- `.cv-tree`, `.cv-row`, `.cv-pre`: outer container `border-radius: var(--r-surface);`; font-sizes → `var(--fs-sm)`; keep `--font-mono`. Leave hljs syntax colors untouched (noted follow-up).
- `.empty-new`, `.term-find` + its buttons, `.snips-empty`: radii → `var(--r-ctrl)`, font-sizes → scale, gaps → rhythm.
- Sweep any remaining stray `border-radius`/`font-size` literals found by the grep in Step 3 onto the nearest token.

- [ ] **Step 3: Anti-regression grep + transitions**

Run a grep to catch stragglers and fix each to the nearest token:

```bash
grep -nE 'border-radius:[[:space:]]*[0-9]' src/styles.css
grep -nE 'font-size:[[:space:]]*(9|10|14|15|16|17)px' src/styles.css
```
Expected after fixes: only intentional exceptions remain (e.g. `50%` pills, the 18/16px that map to tokens). Add `transition: ... var(--t-fast)` to any interactive control still missing a hover transition.

- [ ] **Step 4: Verify (both themes, full app)**

```bash
bunx tsc -p tsconfig.json --noEmit
bun run build
```
Visual sweep of **every** surface in light AND dark: editor, settings, code viewer, scan panel, find bar, empty state. Consistent radii, type scale, spacing, hover/focus. Nothing monospace in chrome; nothing sans in terminal/code/paths/branches.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css src/components/Editor.tsx src/components/Settings.tsx
git commit -m "feat(ui): editor/settings/code-viewer chrome onto tokens; final polish sweep

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** Token system → Task 1. Typography swap → Task 2. Shared primitives (icon button, focus ring) → Task 3. Per-surface sweep: cards/title → 4, dock → 5, note → 6, prompt bar/switcher → 7, editor/settings/code-viewer + polish → 8. Status/priority decoupling → Task 1. Elevation/blur tiers → applied 4–7. Interaction polish → Task 3 (primitives) + applied throughout + Task 8 grep. All spec sections map to a task. ✔

**Placeholder scan:** No TBD/TODO; every step names exact selectors, token values, and commands. The sweeps enumerate concrete selectors from the audit rather than "handle the rest." ✔

**Type/name consistency:** Token names are introduced once in Task 1 and referenced verbatim thereafter (`--r-surface`, `--elev-1`, `--status-awaiting`, `.icon-btn`, etc.). The `color-mix` awaiting-glow formula is identical in Task 1 Step 3 and Task 4 Step 3. ✔

**Verification model:** Every task gates on `bunx tsc` + `bun run build` + a stated visual check in both themes — consistent with the "no test runner" global constraint. ✔
