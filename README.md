<p align="center">
  <a href="https://github.com/skyjacc/Umbra/releases/latest"><img src="docs/banner.png" alt="Umbra EQ" width="820"></a>
</p>

<h1 align="center">Umbra EQ</h1>

<p align="center">
  <b>Per-tab parametric EQ + bass boost for Chrome, Edge & Opera</b><br>
  11 bands &middot; one global sound &middot; site rules &middot; 100% local
</p>

<p align="center">
  <a href="https://github.com/skyjacc/Umbra/releases/latest"><img src="https://img.shields.io/github/v/release/skyjacc/Umbra?label=release&color=8b93c6" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/skyjacc/Umbra?color=8b93c6" alt="MIT license"></a>
  <a href="https://github.com/skyjacc/Umbra/actions/workflows/build.yml"><img src="https://github.com/skyjacc/Umbra/actions/workflows/build.yml/badge.svg" alt="Build status"></a>
  <a href="https://github.com/skyjacc/Umbra/stargazers"><img src="https://img.shields.io/github/stars/skyjacc/Umbra?color=8b93c6" alt="GitHub stars"></a>
  <a href="https://github.com/skyjacc/Umbra/commits"><img src="https://img.shields.io/github/last-commit/skyjacc/Umbra?color=8b93c6" alt="Last commit"></a>
  <img src="https://img.shields.io/badge/Manifest-V3-8b93c6" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Chrome-116%2B-8b93c6" alt="Chrome 116+">
</p>

<p align="center">
  <a href="https://github.com/skyjacc/Umbra/releases/latest"><img src="https://img.shields.io/badge/Download-Latest%20Release-8b93c6?style=for-the-badge&logo=github&logoColor=white" alt="Download latest release" height="34"></a>
  &nbsp;
  <a href="README.ru.md"><img src="https://img.shields.io/badge/%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-README-4b5178?style=for-the-badge" alt="Русский README" height="34"></a>
</p>

<p align="center">
  A free and open-source tab equalizer for Chrome, Edge, and Opera.<br>
  Boost the bass, fix harsh audio, or make a quiet video louder — and hear the change while you drag.
</p>

<!--
  DEMO GIF PENDING RECORDING.
  Record ~10-15s of the popup on a tab that is playing audio: drag the response curve across a few
  bands, apply the Bass Boost preset, then add a site rule. Optimize to < 5 MB (ScreenToGif / ShareX),
  save as docs/demo.gif, and uncomment the line below. Until then the two static screenshots are the fallback.
-->
<!-- <p align="center"><img src="docs/demo.gif" alt="Dragging the Umbra EQ response curve live" width="740"></p> -->

<p align="center">
  <img src="docs/screenshot-eq.png" alt="The Umbra EQ equalizer" width="410">
  &nbsp;
  <img src="docs/screenshot-rules.png" alt="Umbra EQ site rules" width="410">
</p>

## Contents

- [Why Umbra EQ](#why-umbra-eq)
- [Install](#install)
- [Features](#features)
- [How to use](#how-to-use)
- [Browser support](#browser-support)
- [Build from source](#build-from-source)
- [How it works](#how-it-works)
- [Privacy](#privacy)
- [Stack](#stack)
- [Star history](#star-history)
- [Feedback](#feedback)
- [Contributing](#contributing)
- [Credits and licenses](#credits-and-licenses)

## Why Umbra EQ

Browser audio is take-it-or-leave-it. The bass is thin on your laptop speakers, one video is mixed way too quiet, another has harsh, fatiguing highs — and most EQ extensions either ignore streaming sites or go completely silent on them. Umbra EQ fixes the sound of the tab you are actually listening to, live.

### One sound, every tab
Set your EQ once and it applies to every tab you turn it on for. No per-site fiddling — the global profile is the default everywhere, and you just edit what you hear.

### Site rules when you want them
Need one video site brighter and everything else left alone? Add a hostname rule and it overrides the global sound for matching tabs — first match wins — while the rest of the web keeps your global profile.

### Works where others go quiet
Not just YouTube. Umbra runs on Netflix, Spotify, and other streaming sites where audio-EQ extensions often produce no sound at all.

### Private by design
100% local. No account, no sign-in, zero network calls, zero analytics. Your audio is never recorded or sent anywhere, and the production bundle ships a strict CSP (`script-src 'self'; object-src 'self'`) — no remote code, no `eval`.

### Clean, click-free audio
A brick-wall output limiter catches EQ boosts before they clip, and every gain change rides `setTargetAtTime`, so moving a band never pops or crackles.

## Install

The Chrome Web Store listing is on the way. Until then it installs in about a minute:

1. Grab the latest `umbra-eq-<version>.zip` from [Releases](https://github.com/skyjacc/Umbra/releases/latest) and unzip it, or build from source (see below).
2. Open `chrome://extensions` (or `edge://extensions`, `opera://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder (the `dist` folder if you built it). Chrome 116 or newer.

> [!NOTE]
> If the icon does nothing after loading, make sure you selected the **`dist`** folder (the build output), not the repo root, and that you are on Chrome 116+. Umbra's audio engine needs the offscreen-document API, which older builds lack.

## Features

- **11-band equalizer.** Drag the response curve to boost or cut any frequency while the audio plays.
- **One sound on every tab.** Set the EQ once and it plays on every tab you turn it on for — you just edit what you hear.
- **Site rules.** Override the global sound on chosen sites by address pattern, for example one rule that covers a video site and all of its mirrors (first match wins).
- **Per-tab chains.** Each captured tab still gets its own filter chain, so a film tab and a music tab can sound different at the same time.
- **Works on Netflix and Spotify**, and other streaming sites where audio EQ extensions often go silent.
- **Bass boost and volume.** One-click bass boost, plus a master volume that goes past 100% for quiet videos.
- **Output limiter.** A brick-wall limiter catches heavy boosts before they clip, so aggressive presets stay clean.
- **Presets.** Built-in Bass Boost, Vocal, Movie, and Warm, plus your own — move them as a file or share your presets and rules with a copy-paste code.
- **Live spectrum.** A visual analyzer behind the curve that shows what you are hearing. It never changes the sound.
- **Band guide + full-window editor.** An on-screen guide to what each band does, and a full-window view for shaping the global sound on a bigger graph.
- **Keyboard & screen-reader friendly.** The master fader and every band are focusable sliders — drive them with the arrow keys, no mouse required.
- **Русский and English**, four themes, and a custom accent color.
- **Runs on your computer.** No account, no network, no analytics. Your audio is never recorded or sent anywhere.

## How to use

1. Play audio in a tab.
2. Click the Umbra EQ icon, then **EQ This Tab**.
3. Drag a dot: left and right is frequency, up and down is boost or cut. Shift-drag changes the width, double-click resets a band. The strip on the left is master volume.
4. Your EQ plays on every tab. To give a site a different sound, add a rule in the **Rules** tab like `youtube.` or `film. kino.` — it overrides the global sound there.
5. Each captured tab keeps its own EQ; stop any of them under **Tabs**. Open **Full window** (More) to edit the global sound on a bigger graph.

Prefer the keyboard? Focus the volume fader or a band dot and use the arrow keys — Shift+arrow changes the width/Q, Enter resets a band.

The in-app **Guide** (More tab) explains all of this, in Russian or English.

## Browser support

| Browser | Status | Notes |
| ------- | ------ | ----- |
| **Chrome** | Supported | Chrome 116+ (offscreen document + tab capture) |
| **Edge** | Supported | Chromium, same package |
| **Opera** | Supported | Chromium, same package |
| **Firefox** | Planned | Needs a separate content-script engine (Firefox has no `tabCapture`/`offscreen`). See [`FIREFOX_PORT.md`](FIREFOX_PORT.md). |

## Build from source

<details>
<summary><b>For developers</b></summary>

The popup is a React and TypeScript app bundled with Vite and [CRXJS](https://crxjs.dev). The audio engine (service worker plus an offscreen Web Audio document) stays vanilla.

```bash
npm install
npm run build      # → dist/  (the loadable, CSP-clean MV3 extension)
npm run dev        # HMR dev build
npm test           # 64 Vitest unit tests for the audio, preset, rule + invariant logic
npm run typecheck  # tsc, also runs in CI
```

Then load the **`dist`** folder unpacked (see [Install](#install)).

To build the uploadable store zip:

```bash
npm run build
powershell -ExecutionPolicy Bypass -File build-zip.ps1
# → release/umbra-eq-<version>.zip
```

The same zip is accepted by the Chrome Web Store, Microsoft Edge Add-ons, and Opera.

> Dev loop: `npm run build` → **Reload** on the extension card → Ctrl+R the popup or full-window page.
> After a `vite dev` run, delete `node_modules/.vite` and `dist` before a real build, or `dist/` stays a dev-mode stub.

</details>

## How it works

Manifest V3. The **popup** is React and TypeScript (Tailwind and shadcn/ui) and draws the equalizer as plain SVG. The **popup is the source of truth**: it resolves each tab (rule → global profile → flat) and pushes the bands to the engine. The **audio engine is vanilla**: the service worker (`src/background.js`) owns the offscreen document and mints tab-capture stream ids, and the offscreen document (`public/offscreen.js`) is a dumb per-tab applier — it builds and holds a chain of 11 biquad filters per captured tab (glided click-free with `setTargetAtTime`) behind a brick-wall output limiter. Settings, presets, and rules live in `chrome.storage`, owned by the popup. Pure audio, preset, and rule math sits in `src/lib` and is unit-tested with Vitest. The content security policy is strict (`script-src 'self'; object-src 'self'`), so the production bundle has no remote code and no `eval`.

See [`PROJECT.md`](PROJECT.md) for the full architecture reference and [`CONTRIBUTING.md`](CONTRIBUTING.md) to work on it.

## Privacy

Everything runs on your computer. Umbra makes no network requests, has no analytics, and never records or sends your audio. Settings and presets stay in your browser. Full details in [`PRIVACY.md`](PRIVACY.md).

## Stack

| Layer | Technology |
| ----- | ---------- |
| Shell | Manifest V3 — service worker + offscreen document |
| Audio | Web Audio API — 11 biquad filters per tab + brick-wall limiter |
| Popup | React 18, TypeScript |
| Build | Vite + CRXJS |
| UI | Tailwind CSS, shadcn/ui, lucide icons |
| Tests | Vitest (64) |
| CI/CD | GitHub Actions — builds the `dist/` zip on push, PR & `v*` tags |

## Star history

If Umbra fixed your sound, a star helps other people find it.

<p align="center">
  <a href="https://github.com/skyjacc/Umbra/stargazers"><img src="https://img.shields.io/github/stars/skyjacc/Umbra?style=for-the-badge&label=Star&color=8b93c6&logo=github&logoColor=white" alt="GitHub stars"></a>
  &nbsp;
  <a href="https://github.com/skyjacc/Umbra/releases"><img src="https://img.shields.io/github/downloads/skyjacc/Umbra/total?style=for-the-badge&label=Downloads&color=4b5178&logo=github&logoColor=white" alt="Release downloads"></a>
</p>

<p align="center">
  <a href="https://star-history.com/#skyjacc/Umbra&Date"><b>See the growth chart on star-history.com &rarr;</b></a>
</p>

## Feedback

| | |
| --- | --- |
| Suggest a feature | [Start a discussion](https://github.com/skyjacc/Umbra/discussions) |
| Something broke? | [File an issue](https://github.com/skyjacc/Umbra/issues/new) |
| Like it? | [Star the repo](https://github.com/skyjacc/Umbra/stargazers) — it really helps |

## Contributing

Issues and pull requests are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md), or open an issue at <https://github.com/skyjacc/Umbra/issues>.

## Credits and licenses

- Application code: **MIT**, see [`LICENSE`](LICENSE).
- Fonts: **Inter** and **Geist Mono** under the SIL Open Font License 1.1 ([`public/fonts/OFL-Inter.txt`](public/fonts/OFL-Inter.txt), [`public/fonts/OFL-GeistMono.txt`](public/fonts/OFL-GeistMono.txt)).
- UI: **React**, **Tailwind CSS**, **shadcn/ui** (MIT), **lucide-react** icons (ISC).
- Full third-party attributions: [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

Umbra EQ is an independent audio tool. It is not affiliated with, endorsed by, or connected to Netflix, Spotify, YouTube, Google, or any site it processes audio on. All trademarks belong to their respective owners.

<p align="center">
  <code>chrome equalizer</code> &middot; <code>browser eq</code> &middot; <code>bass boost chrome</code> &middot; <code>parametric equalizer extension</code> &middot; <code>per-tab equalizer</code> &middot; <code>netflix equalizer</code> &middot; <code>spotify equalizer</code> &middot; <code>manifest v3 equalizer</code> &middot; <code>эквалайзер для браузера</code> &middot; <code>усиление баса</code>
</p>

<p align="center">
  <a href="https://github.com/skyjacc/Umbra/releases/latest"><img src="https://img.shields.io/badge/Download%20Umbra%20EQ-8b93c6?style=for-the-badge&logo=github&logoColor=white" alt="Download Umbra EQ" height="46"></a>
</p>