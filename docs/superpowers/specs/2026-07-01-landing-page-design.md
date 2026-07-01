# Peti landing page — design spec

**Date:** 2026-07-01
**Status:** approved, shipping

## Goal

A single static landing page for Peti, deployed free on GitHub Pages at
`https://arnavpuri.github.io/peti/`. Primary CTA is **View on GitHub** (star + build from
source) — honest pre-alpha framing, since there are no published releases yet.

## Approach

- Hand-written static site in `/site` (`index.html`, `styles.css`, `favicon.png`, `.nojekyll`).
  No build step, no framework.
- Published by a GitHub Actions workflow (`.github/workflows/pages.yml`):
  `configure-pages` → `upload-pages-artifact` (path `site/`) → `deploy-pages`, on push to `main`.
- All asset paths **relative** so the page works under the `/peti/` project subpath.

## Visual identity

Matches the app's tokens: mint accent `#5cd6ae`, deep blue-black bg `#0a0d12`, status amber
`#e5a13a` (working) and mint (awaiting). Dark-first with a `prefers-color-scheme: light`
variant mapped to the app's light theme (`#1f9e7e` accent, white surfaces).

Editorial, calm aesthetic — **not** generic-AI-dark: a characterful serif display (Fraunces)
paired with a refined grotesque body (Hanken Grotesk), asymmetric left-aligned hero, mint used
sparingly as a sharp accent. Mono is used **only** inside the product mockup and the terminal
code block (authentic to the app, not decorative).

## Sections

1. **Nav** — `📦 Peti` wordmark, anchor links (Features · Status · Build), "★ Star on GitHub".
2. **Hero** — tagline, subtitle, `pre-alpha` badge, CTAs (View on GitHub / Build from source),
   and a hand-built **CSS mockup** of a borderless Peti window: dock rail + `＋`, two translucent
   floating terminal cards (mono content, amber "working" and mint "awaiting" status dots), and a
   prompt bar — over a gradient "wallpaper". Pure HTML/CSS, no screenshot.
3. **"Your auth, no API keys"** strip — the one differentiator: drives your existing `claude` CLI
   over a real PTY.
4. **Features** — 6 items distilled from the README, laid out as a numbered editorial list
   (01–06), not identical icon-cards.
5. **Status** — the honest pre-alpha table (core ✅, signing ⛔, Linux ⚙️, Windows 🚫).
6. **Build from source** — the `git clone … && bun install && bun run tauri dev` block styled as
   a terminal, with a copy button.
7. **Footer** — MIT © 2026 Arnav Puri, "built on Tauri · xterm.js · portable-pty", "not
   affiliated with Anthropic".

## Motion

One orchestrated page-load: staggered reveal of hero elements; a subtle idle float on the mockup
cards. `transform`/`opacity` only. Respects `prefers-reduced-motion`.

## Out of scope (YAGNI)

No waitlist form, no JS framework, no download links (no releases yet), no analytics.

## One-time setup

Repo **Settings → Pages → Source: GitHub Actions** (set via `gh api` during ship).
