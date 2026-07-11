<p align="center">
  <a href="https://github.com/skyjacc/Umbra/releases/latest"><img src="docs/banner.png" alt="Umbra EQ" width="820"></a>
</p>

<h1 align="center">Umbra EQ</h1>

<p align="center">
  <b>Per-tab parametric EQ + bass boost for Chrome, Edge & Opera</b><br>
  11 bands &middot; one global sound &middot; site rules &middot; 100% local
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/plkncppcgglcjdkmcdeajhbfccbnnoee"><img src="https://img.shields.io/chrome-web-store/v/plkncppcgglcjdkmcdeajhbfccbnnoee?label=Chrome%20Web%20Store&color=8b93c6&logo=googlechrome&logoColor=white" alt="Chrome Web Store"></a>
  <a href="https://chromewebstore.google.com/detail/plkncppcgglcjdkmcdeajhbfccbnnoee"><img src="https://img.shields.io/chrome-web-store/users/plkncppcgglcjdkmcdeajhbfccbnnoee?label=users&color=8b93c6" alt="Chrome Web Store users"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/skyjacc/Umbra?color=8b93c6" alt="MIT license"></a>
  <a href="https://github.com/skyjacc/Umbra/actions/workflows/build.yml"><img src="https://github.com/skyjacc/Umbra/actions/workflows/build.yml/badge.svg" alt="Build status"></a>
  <img src="https://img.shields.io/badge/Manifest-V3-8b93c6" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Chrome-116%2B-8b93c6" alt="Chrome 116+">
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/plkncppcgglcjdkmcdeajhbfccbnnoee"><img src="https://img.shields.io/badge/Add%20to%20Chrome-8b93c6?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Add to Chrome" height="34"></a>
  &nbsp;
  <a href="README.ru.md"><img src="https://img.shields.io/badge/%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-README-4b5178?style=for-the-badge" alt="Русский README" height="34"></a>
</p>

<p align="center">
  <img src="docs/screenshot-eq.png" alt="The Umbra EQ equalizer" width="410">
  &nbsp;
  <img src="docs/screenshot-rules.png" alt="Umbra EQ site rules" width="410">
</p>

## Why Umbra EQ

Thin bass on laptop speakers, one video mixed too quiet, another too harsh — and most EQ extensions go silent on the streaming sites you actually use. Umbra fixes the sound of the tab you're listening to, live, and keeps it 100% on your computer. Set one sound for every tab, or give specific sites their own with rules.

## Install

**[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/plkncppcgglcjdkmcdeajhbfccbnnoee)** — one click, auto-updating.

On Edge or Opera, or to run your own build, load it unpacked (about a minute):

1. Download the latest `umbra-eq-<version>.zip` from [Releases](https://github.com/skyjacc/Umbra/releases/latest) and unzip it (or build from source below).
2. Open `chrome://extensions` (or `edge://`, `opera://`) and turn on **Developer mode**.
3. **Load unpacked** → pick the unzipped `dist` folder. Chrome 116+.

> [!NOTE]
> Icon does nothing? Make sure you picked the **`dist`** folder (build output), not the repo root, on Chrome 116+ — the audio engine needs the offscreen-document API.

## Features

- **11-band parametric EQ** — drag the curve to boost or cut any frequency, live.
- **One global sound + site rules** — one EQ everywhere, or per-site overrides by address pattern (first match wins). Each tab keeps its own chain.
- **Works on Netflix, Spotify** and other sites where EQ extensions go silent.
- **Bass boost, volume past 100%, output limiter** — big boosts stay clean, no clipping.
- **Presets** — Bass Boost / Vocal / Movie / Warm + your own; export as a file or share code.
- **Live spectrum, band guide, full-window editor.**
- **Keyboard + screen-reader friendly**, RU/EN, four themes. No account, no network, no analytics.

## How to use

1. Play audio in a tab, click the Umbra EQ icon, press **EQ This Tab**.
2. Drag a dot (or arrow keys): left/right = frequency, up/down = boost/cut, Shift = width/Q, double-click resets. Left strip is master volume.
3. Add a **rule** like `youtube.` for a per-site sound; stop a tab under **Tabs**, or open **Full window** for a bigger graph.

The in-app **Guide** (More tab) walks through all of it, RU or EN.

## Browser support

| Browser | Status | Notes |
| ------- | ------ | ----- |
| **Chrome** | Supported | Chrome 116+ (offscreen document + tab capture) |
| **Edge** | Supported | Chromium, same package |
| **Opera** | Supported | Chromium, same package |
| **Firefox** | Planned | Needs a separate content-script engine (no `tabCapture`/`offscreen`). See [`FIREFOX_PORT.md`](FIREFOX_PORT.md). |

## Build from source

<details>
<summary><b>For developers</b></summary>

The popup is React + TypeScript, bundled with Vite and [CRXJS](https://crxjs.dev). The audio engine (service worker + offscreen Web Audio document) stays vanilla.

```bash
npm install
npm run build      # → dist/  (loadable, CSP-clean MV3 extension)
npm run dev        # HMR dev build
npm test           # 64 Vitest unit tests
npm run typecheck  # tsc, also in CI
```

Then load the **`dist`** folder unpacked (see [Install](#install)). For the store zip:

```bash
npm run build
powershell -ExecutionPolicy Bypass -File build-zip.ps1
# → release/umbra-eq-<version>.zip
```

The same zip is accepted by the Chrome Web Store, Edge Add-ons, and Opera.

> Dev loop: `npm run build` → **Reload** on the extension card → Ctrl+R the popup.
> After `vite dev`, delete `node_modules/.vite` and `dist` before a real build, or `dist/` stays a dev-mode stub.

</details>

## How it works

Manifest V3. The **popup** (React + TypeScript) is the source of truth: it resolves each tab (rule → global profile → flat) and pushes the bands to the engine. The **engine is vanilla** — the service worker owns the offscreen document and mints tab-capture ids; the offscreen document holds 11 biquad filters per tab behind a brick-wall limiter, glided click-free. Pure audio/preset/rule math lives in `src/lib` (unit-tested); strict CSP, no remote code, no `eval`.

See [`PROJECT.md`](PROJECT.md) for the architecture, [`CONTRIBUTING.md`](CONTRIBUTING.md) to contribute.

## Privacy

100% local — no network requests, no analytics; audio is never recorded or sent; settings and presets stay in your browser. Details in [`PRIVACY.md`](PRIVACY.md).

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

## Stars

If Umbra fixed your sound, a star helps other people find it.

<p align="center">
  <a href="https://github.com/skyjacc/Umbra/stargazers"><img src="https://img.shields.io/github/stars/skyjacc/Umbra?style=for-the-badge&label=Star&color=8b93c6&logo=github&logoColor=white" alt="GitHub stars"></a>
  &nbsp;
  <a href="https://github.com/skyjacc/Umbra/releases"><img src="https://img.shields.io/github/downloads/skyjacc/Umbra/total?style=for-the-badge&label=Downloads&color=4b5178&logo=github&logoColor=white" alt="Release downloads"></a>
</p>

<a href="https://www.star-history.com/?repos=skyjacc%2FUmbra&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=skyjacc/Umbra&type=date&theme=dark&legend=top-left&sealed_token=5nsh_UHuzblZshtMf4C7j-zWnbA-LWyY6-LLQIzwh1MXehy-MxC_4vmIVqEk8ndH6zdj1JQ-kukR9mEB_843GXROAtzjeqD8ixp7dm939x0g3KxKxIeYps8NhWb8CWkyKJ1fnLStM4FTiU52ng2gk-dTKEzBCNWqRQtuvRDUpWtioYV4eFKxRwXAVMTM" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=skyjacc/Umbra&type=date&legend=top-left&sealed_token=5nsh_UHuzblZshtMf4C7j-zWnbA-LWyY6-LLQIzwh1MXehy-MxC_4vmIVqEk8ndH6zdj1JQ-kukR9mEB_843GXROAtzjeqD8ixp7dm939x0g3KxKxIeYps8NhWb8CWkyKJ1fnLStM4FTiU52ng2gk-dTKEzBCNWqRQtuvRDUpWtioYV4eFKxRwXAVMTM" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=skyjacc/Umbra&type=date&legend=top-left&sealed_token=5nsh_UHuzblZshtMf4C7j-zWnbA-LWyY6-LLQIzwh1MXehy-MxC_4vmIVqEk8ndH6zdj1JQ-kukR9mEB_843GXROAtzjeqD8ixp7dm939x0g3KxKxIeYps8NhWb8CWkyKJ1fnLStM4FTiU52ng2gk-dTKEzBCNWqRQtuvRDUpWtioYV4eFKxRwXAVMTM" />
 </picture>
</a>

## Feedback

| | |
| --- | --- |
| Suggest a feature | [Start a discussion](https://github.com/skyjacc/Umbra/discussions) |
| Something broke? | [File an issue](https://github.com/skyjacc/Umbra/issues/new) |
| Like it? | [Star the repo](https://github.com/skyjacc/Umbra/stargazers) |

## Contributing

Issues and pull requests welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Credits and licenses

- Application code: **MIT** ([`LICENSE`](LICENSE)).
- Fonts: **Inter** and **Geist Mono** under the SIL Open Font License 1.1.
- UI: **React**, **Tailwind CSS**, **shadcn/ui** (MIT), **lucide-react** (ISC). Full list: [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

Umbra EQ is an independent audio tool, not affiliated with or endorsed by Netflix, Spotify, YouTube, Google, or any site it processes audio on. All trademarks belong to their owners.
