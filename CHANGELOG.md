# Changelog

All notable changes to Umbra EQ are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/).

## [2.1.0] — 2026-07-06

### Added
- **Per-tab EQ** — the audio engine now builds an independent filter chain for every
  captured tab, so two tabs (e.g. a film tab and a music tab) can hold two different EQ
  curves at the same time. The popup edits whichever tab is currently active.
- **Per-site memory (sticky EQ)** — a tab's shaped curve is remembered under its
  hostname and, while **Remember EQ per site** is on, re-applied automatically the next
  time that site's tab is captured. Manage or forget saved sites in **More → Remembered
  sites**; the popup previews a site's saved curve before you even press EQ This Tab.
- **Domain rules** — a pattern language assigns a preset or a saved curve to sites by
  hostname pattern: `youtube.` (name + any TLD), `.youtube.` (subdomains + any TLD),
  `.youtube.com` (any subdomain, fixed TLD), exact hosts, and multi-pattern rules
  (`film. / kino.`) that group several sites under one preset. First matching rule wins;
  a hand-tweaked site always overrides its rule. Managed in a new **Rules** tab with an
  inline guide and a one-click "rule for this site". Rules sync across the user's
  browsers. Matcher is unit-tested (14 cases); multi-part TLDs (.co.uk) match
  approximately (no public-suffix list).
- **Russian & English UI** — full RU/EN localization with an in-app **Language** switch
  (More → Language), defaulting to the browser language. The Rules guide is written in
  plain, jargon-free language (no "TLD"/"hostname" wording).
- **Reset scope** — **Reset** (EQ view) flattens the current tab and forgets its saved
  curve; each row in **Tabs** has its own **Reset**; **Clear all** (More) flattens every
  live tab and wipes all remembered sites.

### Changed
- Native `<select>` dropdowns replaced with a themed glass dropdown that matches the dark
  UI (the browser-gray popup couldn't be styled).
- The EQ graph and volume fader are read-only until the active tab is captured (dots and
  handle dim) — edits target a live per-tab chain.
- Live-drag no longer triggers a full status broadcast, and per-domain writes are
  debounced (250 ms, flushed on stop), cutting messaging + storage churn during drags.
- Service worker reports the active tab (id + hostname) to the popup; capture now carries
  the tab URL so the engine can key per-domain memory.

## [2.0.0] — 2026-07-06

Major release: the popup is rebuilt as a React + TypeScript app (Vite + CRXJS,
Tailwind + shadcn/ui) with a dark frosted-glass interface, a horizontal-per-bin
"Ears-style" spectrum, a thin vertical volume fader, and a bottom-tab layout. The
audio engine (service worker + offscreen Web Audio) is unchanged. Load the **`dist/`**
folder unpacked.

### Highlights
- Bottom-nav app (EQ / Presets / Tabs / More); glass volume fader with a 0 dB detent;
  high-resolution spectrum (per-bin, 60fps, silence-safe); refined glass theme + 4
  color themes; onboarding page restyled to match.

### Changed
- **Popup migrated to React + TypeScript** (Vite + CRXJS, Tailwind + shadcn/ui). The
  audio engine stays vanilla (service worker + offscreen Web Audio). Pure audio/preset
  math moved to `src/lib` and unit-tested with Vitest; the EQ graph is plain React SVG
  (Snap.svg dropped). Build → `dist/`; package via `build-zip.ps1` → `release/` zip.
  Load the **`dist/`** folder unpacked. Old flat-file vanilla popup + browser test
  harnesses removed on this build.
- **New bottom-nav app UI** — `popup.html`, `popup.css`, and the popup's view wiring
  rewritten from scratch. The single-screen layout is replaced by four full views
  (EQ / Presets / Tabs / More) switched by a bottom tab bar; the old chip-overlays and
  preset drawer are gone. Styled as a **dark frosted-glass** interface: muted,
  low-saturation accents (no neon), a cool near-black ground with soft radial depth,
  and backdrop-blur panels (kept off every EQ-graph ancestor so drag hit-testing still
  works). The four color themes (Eclipse/Nocturne/Aurora/Solar) recolor the graph +
  accent, all muted. The audio engine is untouched and all 53 tests still pass. Views
  toggle by display/opacity only — never transform — so drag keeps working.
- `test/visual-harness.html` updated to the new markup.

### Added
- **Clearer master-volume strip** — a recessed rounded track, a level fill that shows
  deviation from unity (accent above 0 dB, dim below), a chunky grabbable handle, and a
  live signed dB readout (e.g. "+4"). Widened for easier grabbing.
- **More readable EQ graph** — axis labels use the readable text color (were dark-on-dark),
  a dashed 0 dB baseline marks the boost/cut reference, and band dots are larger.
- MIT license; project open-sourced.
- Multi-store packaging guidance for Chrome, Edge, and Opera (single Chromium zip).
- GitHub scaffolding: CI build-on-tag, issue templates, contributing guide.
- `FIREFOX_PORT.md` documenting the planned Firefox content-script engine.

## [1.0.1] — 2026-07-06

Initial public release candidate.

### Added
- 11-band parametric EQ with a draggable combined response curve (freq × gain,
  Shift-drag = Q, double-click = reset a band).
- Bass boost preset and master volume up to +10 dB.
- Named presets with export/import (JSON) and `storage.sync` across the user's browser.
- Live spectrum overlay (visual only).
- Four themes (Eclipse, Nocturne, Aurora, Solar) with a custom themed dropdown.
- Guide and Active-tabs overlays, onboarding page, full-window mode.
- Manifest V3 architecture: service worker + offscreen Web Audio engine, click-free
  parameter glides, boot-restore with a `pendingRestore` guard.
- Prototype-pollution hardening on all preset read/write paths.
