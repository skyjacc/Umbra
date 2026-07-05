# Changelog

All notable changes to Umbra EQ are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

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
