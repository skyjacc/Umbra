<p align="center">
  <a href="https://github.com/skyjacc/Umbra/releases/latest"><img src="docs/banner.png" alt="Umbra EQ — per-tab equalizer, bass boost and volume booster for Chrome, Edge and Opera" width="820"></a>
</p>

<h1 align="center">Umbra EQ</h1>

<p align="center">
  <b>Per-tab parametric equalizer, bass boost & volume booster for Chrome, Edge & Opera</b><br>
  11 bands &middot; one global sound &middot; site rules &middot; local audio
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/plkncppcgglcjdkmcdeajhbfccbnnoee?utm_source=github&amp;utm_medium=referral&amp;utm_campaign=release_2_5_0"><img src="https://img.shields.io/chrome-web-store/v/plkncppcgglcjdkmcdeajhbfccbnnoee?label=Chrome%20Web%20Store&color=8b93c6&logo=googlechrome&logoColor=white" alt="Chrome Web Store"></a>
  <a href="https://chromewebstore.google.com/detail/plkncppcgglcjdkmcdeajhbfccbnnoee?utm_source=github&amp;utm_medium=referral&amp;utm_campaign=release_2_5_0"><img src="https://img.shields.io/chrome-web-store/users/plkncppcgglcjdkmcdeajhbfccbnnoee?label=users&color=8b93c6" alt="Chrome Web Store users"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/skyjacc/Umbra?color=8b93c6" alt="MIT license"></a>
  <a href="https://github.com/skyjacc/Umbra/actions/workflows/build.yml"><img src="https://github.com/skyjacc/Umbra/actions/workflows/build.yml/badge.svg" alt="Build status"></a>
  <img src="https://img.shields.io/badge/Manifest-V3-8b93c6" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Chrome-116%2B-8b93c6" alt="Chrome 116+">
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/plkncppcgglcjdkmcdeajhbfccbnnoee?utm_source=github&amp;utm_medium=referral&amp;utm_campaign=release_2_5_0"><img src="https://img.shields.io/badge/Add%20to%20Chrome-8b93c6?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Add to Chrome" height="34"></a>
  &nbsp;
  <a href="README.ru.md"><img src="https://img.shields.io/badge/%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-README-4b5178?style=for-the-badge" alt="Русский README" height="34"></a>
</p>

<p align="center">
  <img src="docs/screenshot-eq.png" alt="Umbra EQ — the 11-band parametric equalizer curve with live spectrum and bass boost on a browser tab" width="410">
  &nbsp;
  <img src="docs/screenshot-rules.png" alt="Umbra EQ per-site rules — give each site its own equalizer sound by address pattern" width="410">
</p>

## Why Umbra EQ

Thin bass on laptop speakers, one video mixed too quiet, another too harsh — Umbra lets you adjust the sound of a captured browser tab while it plays. Audio is processed on your computer. Set one sound for captured tabs, or give specific sites their own with rules.

## What it does

- **11-band parametric EQ** — drag the curve to boost or cut any frequency, live. Or type the
  numbers: enter frequency and gain for each band, and width (Q) for peaking bands.
- **Per-site profiles** — keep your everyday sound everywhere, then give individual sites their
  own. A music tab can have one curve and a video tab another while the global profile stays untouched.
  Rules match by address pattern, first match wins, and each tab keeps its own filter chain.
- **Save for this site** — turn the sound you are hearing into a rule for the site you are on,
  without changing how everything else sounds.
- **Reset** — put the sound back to what it was when you opened Umbra. Not one step back; all the
  way back.
- **Bypass** — hear the tab unshaped while the curve stays editable, then switch back to compare.
  Nothing is saved until you leave Bypass.
- **Presets you can build on** — Bass Boost / Vocal / Movie / Warm, plus your own. Nudge a band and
  the header keeps saying *Based on Vocal*, so a tweaked preset never becomes an anonymous curve.
- **Auto Gain** *(off by default)* — estimates level compensation from the EQ settings without
  changing your saved volume. It does not measure the track’s loudness or automatically normalize different videos.
- **Output peak meter** — shows the combined stereo output of all captured tabs after the limiter.
  The spectrum still shows the selected tab.
- **Browser-tab audio capture** — processes the audio Chrome makes available from a tab.
  Protected media and browser-internal pages may not support capture.
- **Bass boost, volume past 100%, output limiter** — master volume spans −50 to +20 dB. A shared
  5 ms lookahead limiter limits output sample peaks to −1 dBFS; it is not a true-peak limiter
  and cannot repair distortion already present in a recording.
- **Live spectrum, band guide, full-window editor.**
- **Keyboard and screen-reader friendly**, RU/EN, four themes and a custom accent colour. No
  Umbra account or analytics. Saved presets and rules can use Chrome Sync.

> The original interface is retained with targeted fixes: [current design and screenshots](docs/DESIGN.md).

## How to use

1. Play audio in a tab, click the Umbra EQ icon, press **EQ This Tab**.
2. Drag a dot on the curve: left/right is frequency, up/down is boost or cut. The fader on the left
   controls master volume.
3. Prefer the keyboard? Focus a dot and use the arrows — **Shift** for a bigger step, **Alt** for a
   finer one. Or Tab into the row under the graph and type the frequency, gain and Q directly.
4. Press **Save for {site}** to keep this sound for the site you are on, **⟲** to put it back, or
   **Bypass** to hear the tab untouched for a moment.

The in-app **Guide** (More tab) walks through all of it, in Russian or English.

<!-- SCREENSHOT WANTED — docs/screenshot-precision.png
     The band row under the graph with a value being typed: "Band 5 · 437 Hz · -19.7 dB · Q 0.71",
     and the header reading "Based on Vocal". Shows the tool is precise, not just pretty.
     Add the file, then uncomment:
<p align="center"><img src="docs/screenshot-precision.png" alt="Typing a band's frequency, gain and Q, with the header reading Based on Vocal" width="410"></p>
-->

<!-- SCREENSHOT WANTED — docs/screenshot-bypass.png
     Bypass on: the solid 0 dB line, the dimmed curve still editable, the red "EQ bypassed" badge,
     and the ⟲ Reset button in the action row.
     Add the file, then uncomment:
<p align="center"><img src="docs/screenshot-bypass.png" alt="Bypass on — the tab plays unshaped while the curve stays editable" width="410"></p>
-->

## Install

**[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/plkncppcgglcjdkmcdeajhbfccbnnoee?utm_source=github&utm_medium=referral&utm_campaign=release_2_5_0)** — one click, auto-updating.

On Edge or Opera, or to run your own build, load it unpacked (about a minute):

1. Download the latest `umbra-eq-<version>.zip` from [Releases](https://github.com/skyjacc/Umbra/releases/latest) and unzip it (or build from source below).
2. Open `chrome://extensions` (or `edge://`, `opera://`) and turn on **Developer mode**.
3. **Load unpacked** → pick the extracted folder containing `manifest.json`. If you built from source, select `dist/`. Chrome 116+.

> [!NOTE]
> Icon does nothing? Select the folder containing **`manifest.json`**: the extracted release folder, or **`dist/`** after a source build, on Chrome 116+ — the audio engine needs the offscreen-document API.

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

The popup is React + TypeScript, bundled with Vite and [CRXJS](https://crxjs.dev). The audio engine (service worker + offscreen Web Audio document) stays vanilla. Use Node 24 LTS; no API keys, env vars, or services to set up.

```bash
npm ci
npm run build      # → dist/  (loadable, CSP-clean MV3 extension)
npm run dev        # HMR dev build
npm test           # Vitest unit and DOM tests
npm run typecheck  # tsc, also in CI
```

Then load the **`dist`** folder unpacked (see [Install](#install)). For the store zip:

```bash
npm run build
powershell -ExecutionPolicy Bypass -File build-zip.ps1
# → release/umbra-eq-<version>.zip
```

This zip contains the Chromium build. Each store has its own submission and review requirements.

> Dev loop: `npm run build` → **Reload** on the extension card → Ctrl+R the popup.
> After `vite dev`, delete `node_modules/.vite` and `dist` before a real build, or `dist/` stays a dev-mode stub.

</details>

## How it works

Manifest V3. The **popup** (React + TypeScript) is the source of truth: it resolves each tab (rule → global profile → flat) and pushes the bands to the engine. The **engine is vanilla** — the service worker owns the offscreen document and mints tab-capture ids; the offscreen document holds 11 biquad filters per tab with smoothly changing parameters, then mixes the tabs through one AudioWorklet output limiter. The service worker resolves saved settings when a capture starts without the popup. Pure audio/preset/rule math lives in `src/lib` (unit-tested); strict CSP, no remote code, no `eval`.

Working on Umbra? [`CONTRIBUTING.md`](CONTRIBUTING.md) is the place to start — setup, the dev loop, and what the tests expect. [`PROJECT.md`](PROJECT.md) is the architecture reference and [`DEPLOY.md`](DEPLOY.md) the release checklist.

Ready-to-paste English and Russian store text is maintained in [`docs/store/README.md`](docs/store/README.md).

## How Umbra EQ compares

Umbra combines three practical features:

- **Parametric control.** Move the frequency and gain of each of the 11 biquad filters, and adjust the width (Q) of peaking bands.
- **Per-tab settings.** A `tabCapture`-based audio engine gives each captured tab its own filter chain, so a music tab and a video tab can sound different at once. Capture availability depends on the browser and the media source.
- **Local audio and open source.** No Umbra account, ads, analytics or direct network calls; MIT-licensed and auditable. Saved presets and rules can use Chrome Sync; audio is processed locally.

## FAQ

**Can I use it as a YouTube or Spotify equalizer?** Umbra processes browser-tab audio when Chrome allows capture. Compatibility can vary by player, browser version and protected content, so support is not guaranteed for every site or stream. Play audio in a normal web tab and select **EQ This Tab** to check your source.

**Is it a bass booster and volume booster too?** Yes. The low bands act as a one-click bass boost; the master control is a volume booster that pushes a tab past 100%, with an output limiter to reduce output peaks.

**What is a parametric equalizer?** A parametric EQ lets you choose a band's frequency and gain, and adjust the width of peaking filters — so you can target the part of the sound you want to boost or cut. Umbra's shelf filters do not use Q.

**Is it really free, with no ads or tracking?** Yes. Umbra EQ is free, MIT-licensed, processes audio locally, and makes no network calls of its own — no ads, no accounts, no analytics.

**Why does Chrome say the tab is being shared?** Umbra reads the tab's audio through Chrome's tab-capture API — the same mechanism screen sharing uses, so Chrome shows its sharing indicator. **Audio only**: the stream is requested without video. Umbra does not capture video frames or screenshots, or read the page's DOM text or HTML. Chrome's `tabCapture` permission covers audio and video together — holding it is not the same as using it for video. The indicator is enforced by the browser and can't be switched off by an extension, which is the point — you always know when a tab is being captured. It disappears when you press Stop.

**Fullscreen stopped working while the equalizer is on. Why?** Chrome can restrict fullscreen while tab capture is active. Behavior depends on the browser and player. Try entering fullscreen before enabling Umbra, or stop capture and re-enter fullscreen. A shortcut at `chrome://extensions/shortcuts` lets you toggle Umbra without opening the popup.

**Which browsers does it support?** Chrome 116+, Microsoft Edge, and Opera (the same package). A Firefox port is planned.

**Is it open source?** Yes — the full source is in this repository under the MIT license.

## Privacy

Audio stays on your device: Umbra never records or uploads it and has no analytics or server. The global EQ and UI settings stay local. Saved presets and site rules use `chrome.storage.sync`; if browser sync is enabled, Chrome synchronizes those settings through your Google account. Details in [`PRIVACY.md`](PRIVACY.md).

## Stack

| Layer | Technology |
| ----- | ---------- |
| Shell | Manifest V3 — service worker + offscreen document |
| Audio | Web Audio API — 11 biquad filters per tab + output limiter |
| Popup | React 18, TypeScript |
| Build | Vite + CRXJS |
| UI | Tailwind CSS, shadcn/ui, lucide icons |
| Tests | Vitest unit/DOM suites + Chromium audio and UI checks |
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

## Support Umbra

Umbra EQ is free, and free is not a trial — every feature is in the extension and always will be.
If it earns a coffee:

<p align="center">
  <a href="https://ko-fi.com/oblako"><img src="https://img.shields.io/badge/Support%20on%20Ko--fi-A8FF3E?style=for-the-badge&logo=ko-fi&logoColor=black" alt="Support Umbra EQ on Ko-fi" height="34"></a>
  &nbsp;
  <a href="https://github.com/sponsors/skyjacc"><img src="https://img.shields.io/badge/GitHub%20Sponsors-8b93c6?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Sponsor on GitHub" height="34"></a>
</p>

## Contributing

Issues and pull requests welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Credits and licenses

- Application code: **MIT** ([`LICENSE`](LICENSE)).
- Fonts: **Inter** and **Geist Mono** under the SIL Open Font License 1.1.
- UI: **React**, **Tailwind CSS**, **shadcn/ui** (MIT), **lucide-react** (ISC). Full list: [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

Umbra EQ is an independent audio tool, not affiliated with or endorsed by Netflix, Spotify, YouTube, Google, or any site it processes audio on. All trademarks belong to their owners.
