# Changelog

All notable changes to Umbra EQ are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

### Added
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
