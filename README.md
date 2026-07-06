# Umbra EQ — Equalizer & Bass Boost

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen.svg)](manifest.json)
[![Chrome](https://img.shields.io/badge/Chrome-supported-success)](#install)
[![Edge](https://img.shields.io/badge/Edge-supported-success)](#install)
[![Opera](https://img.shields.io/badge/Opera-supported-success)](#install)

A live **11-band parametric equalizer and bass boost** for any browser tab. Shape the
sound of music, video, streams and calls in real time — right from the toolbar.
100% local, no account, no ads, no tracking. Your audio never leaves your device.

> A free, open-source, privacy-first alternative to closed-source tab equalizers.

## Features

- **11-band parametric EQ** — drag the response curve to boost or cut any frequency, live.
- **Per-tab EQ** — every captured tab gets its own equalizer, so a film tab and a music tab can sound different at the same time.
- **Sticky per-site sound** — a tab's curve is remembered by site (hostname) and re-applied automatically next time.
- **Site rules** — assign a preset or a saved curve to sites by address pattern, e.g. one rule for every `film.*` mirror.
- **Presets** — save, apply, export/import as a file, or share by a self-contained offline code.
- **Bass boost** + **master volume** up to +10 dB for quiet videos.
- **Live spectrum** overlay (visual only — it never changes the sound).
- **Русский & English** interface, plus **4 themes and a custom accent color**.
- **100% local & offline** — no account, no ads, no tracking, no network. Your audio never leaves your device.

## Browser support

| Browser | Status | Notes |
| ------- | ------ | ----- |
| **Chrome** | ✅ Supported | Chrome 116+ (offscreen + tab capture) |
| **Edge** | ✅ Supported | Chromium-based, same package |
| **Opera** | ✅ Supported | Chromium-based, same package |
| **Firefox** | 🛠 Planned | Needs a separate content-script engine — Firefox has no `tabCapture`/`offscreen`. See [`FIREFOX_PORT.md`](FIREFOX_PORT.md). |

> Store links will be added here once the listings are live.

## Develop & build

The popup is a React + TypeScript app bundled with Vite + [CRXJS](https://crxjs.dev);
the audio engine (service worker + offscreen Web Audio) stays vanilla.

```bash
npm install
npm run build      # → dist/  (the loadable/CSP-clean MV3 extension)
npm run dev        # HMR dev build
npm test           # Vitest unit tests for the audio/preset logic
```

**Load unpacked:** `chrome://extensions` (or `edge://`, `opera://`) → enable
**Developer mode** → **Load unpacked** → select the **`dist/`** folder (not the repo
root). Requires Chrome 116+.

## Usage

1. Play audio in a tab.
2. Click the Umbra EQ icon → **EQ This Tab**.
3. Drag the dots: left/right = frequency, up/down = boost/cut. **Shift-drag** = width (Q).
   **Double-click** a dot resets that band. The strip on the left is master volume.
4. Save/apply presets from **Presets** (Export/Import as a file, or Copy/Paste a share code).
5. In **Rules**, keep **Remember EQ per site** on so a site's sound sticks, and add
   pattern rules (e.g. `youtube.`, `film. kino.`) to auto-apply a preset per site.
6. Each captured tab keeps its own EQ — manage or reset them under **Tabs**.

## Build the store package

```bash
npm run build
powershell -ExecutionPolicy Bypass -File build-zip.ps1
# → release/umbra-eq-<version>.zip  (a zip of dist/, ~0.6 MB)
```

The same zip is accepted by the Chrome Web Store, Microsoft Edge Add-ons, and the
Opera add-ons catalog.

## Tech

Manifest V3, built with **Vite + CRXJS**. The **popup** is a **React + TypeScript**
app (Tailwind + shadcn/ui) that renders the equalizer as plain React SVG and manages
presets in `chrome.storage`. The **audio engine stays vanilla**: the service worker
(`src/background.js`) owns the offscreen document and mints tab-capture stream ids; the
offscreen document (`public/offscreen.js`) runs the Web Audio graph (11 biquads,
click-free via `setTargetAtTime`). Pure audio/preset math lives in `src/lib` and is
unit-tested with Vitest. Strict CSP (`script-src 'self'; object-src 'self'`) — the
production bundle has no remote code and no `eval`.

See [`PROJECT.md`](PROJECT.md) for the full architecture reference and
[`CONTRIBUTING.md`](CONTRIBUTING.md) to hack on it.

## Privacy

All audio processing and all settings stay on your device. The extension makes no
network requests and contains no analytics. See [`PRIVACY.md`](PRIVACY.md).

## Contributing & support

Issues and pull requests are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).
Questions or bug reports: <https://github.com/skyjacc/umbra-eq/issues>.

## Credits & licenses

- Application code: **MIT** — see [`LICENSE`](LICENSE).
- Fonts: **Inter** and **Geist Mono**, SIL Open Font License 1.1 —
  see [`public/fonts/OFL-Inter.txt`](public/fonts/OFL-Inter.txt) and [`public/fonts/OFL-GeistMono.txt`](public/fonts/OFL-GeistMono.txt).
- UI: **React**, **Tailwind CSS**, **shadcn/ui** (MIT), **lucide-react** icons (ISC).
