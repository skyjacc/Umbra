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
- **Bass boost** + a one-click preset, plus your own named presets.
- **Master volume** boost when a video is too quiet (up to +10 dB).
- **Live spectrum** overlay (visual only — it never changes the sound).
- **4 themes**: Eclipse (default), Nocturne, Aurora, Solar.
- **100% local & offline** — no account, no ads, no tracking, no network.

## Browser support

| Browser | Status | Notes |
| ------- | ------ | ----- |
| **Chrome** | ✅ Supported | Chrome 116+ (offscreen + tab capture) |
| **Edge** | ✅ Supported | Chromium-based, same package |
| **Opera** | ✅ Supported | Chromium-based, same package |
| **Firefox** | 🛠 Planned | Needs a separate content-script engine — Firefox has no `tabCapture`/`offscreen`. See [`FIREFOX_PORT.md`](FIREFOX_PORT.md). |

> Store links will be added here once the listings are live.

## Install (unpacked, for development)

1. Open `chrome://extensions` (or `edge://extensions`, `opera://extensions`).
2. Enable **Developer mode**.
3. **Load unpacked** → select this folder.

## Usage

1. Play audio in a tab.
2. Click the Umbra EQ icon → **EQ This Tab**.
3. Drag the dots: left/right = frequency, up/down = boost/cut. **Shift-drag** = width (Q).
   **Double-click** a dot resets that band. The strip on the left is master volume.
4. Save/apply presets from **Presets**; **Export/Import** them as JSON.

## Build the store package

```powershell
powershell -ExecutionPolicy Bypass -File build-zip.ps1
# → dist/umbra-eq-<version>.zip  (runtime files only; no tests/docs)
```

The same zip is accepted by the Chrome Web Store, Microsoft Edge Add-ons, and the
Opera add-ons catalog.

## Tech

Manifest V3. The service worker (`background.js`) owns the offscreen document and mints
tab-capture stream ids; the offscreen document (`offscreen.js`) runs the Web Audio graph
(11 biquads, click-free via `setTargetAtTime`); the popup (`popup.js`) draws the SVG
equalizer with Snap.svg and manages presets in `chrome.storage`. Strict CSP
(`script-src 'self'; object-src 'self'`) — everything is inlined/bundled, nothing remote.

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
  see [`fonts/OFL-Inter.txt`](fonts/OFL-Inter.txt) and [`fonts/OFL-GeistMono.txt`](fonts/OFL-GeistMono.txt).
- UI icons: **Tabler Icons** (MIT), inlined as SVG.
- **Snap.svg** (Apache License 2.0).
