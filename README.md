<p align="center">
  <img src="docs/banner.png" alt="Umbra EQ" width="820">
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8b93c6" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/Manifest-V3-8b93c6" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Chrome-116%2B-8b93c6" alt="Chrome 116+">
  <a href="https://github.com/skyjacc/Umbra/releases"><img src="https://img.shields.io/github/v/tag/skyjacc/Umbra?label=release&color=8b93c6" alt="Latest release"></a>
</p>

<p align="center">
  A free and open-source tab equalizer for Chrome, Edge, and Opera.<br>
  Boost the bass, fix harsh audio, or make a quiet video louder. Every tab keeps its own sound.
</p>

<p align="center">
  <img src="docs/screenshot-eq.png" alt="The Umbra EQ equalizer" width="410">
  &nbsp;
  <img src="docs/screenshot-rules.png" alt="Umbra EQ site rules" width="410">
</p>

## Install

The Chrome Web Store listing is on the way. Until then it installs in about a minute:

1. Grab the latest `umbra-eq-<version>.zip` from [Releases](https://github.com/skyjacc/Umbra/releases) and unzip it, or build from source (see below).
2. Open `chrome://extensions` (or `edge://extensions`, `opera://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder (the `dist` folder if you built it). Chrome 116 or newer.

## Features

- **11-band equalizer.** Drag the response curve to boost or cut any frequency while the audio plays.
- **Per-tab sound.** Every captured tab gets its own equalizer, so a film tab and a music tab can sound different at the same time.
- **Remembers each site.** A tab's curve is saved by site and comes back automatically the next time you open it.
- **Site rules.** Point a preset or a saved curve at sites by address pattern, for example one rule that covers a video site and all of its mirrors.
- **Presets.** Save your own, move them as a file, or share your presets and rules with a copy-paste code.
- **Bass boost and volume.** One-click bass boost, plus a master volume that goes past 100% for quiet videos.
- **Live spectrum.** A visual analyzer behind the curve that shows what you are hearing. It never changes the sound.
- **Русский and English**, four themes, and a custom accent color.
- **Runs on your computer.** No account, no network, no analytics. Your audio is never recorded or sent anywhere.

## How to use

1. Play audio in a tab.
2. Click the Umbra EQ icon, then **EQ This Tab**.
3. Drag a dot: left and right is frequency, up and down is boost or cut. Shift-drag changes the width, double-click resets a band. The strip on the left is master volume.
4. Keep **Remember EQ per site** on (Rules tab) so a site's sound sticks, and add pattern rules like `youtube.` or `film. kino.` to apply a preset per site automatically.
5. Each captured tab keeps its own EQ. Manage or reset them under **Tabs**.

The in-app **Guide** (More tab) explains all of this, in Russian or English.

## Browser support

| Browser | Status | Notes |
| ------- | ------ | ----- |
| **Chrome** | Supported | Chrome 116+ (offscreen document + tab capture) |
| **Edge** | Supported | Chromium, same package |
| **Opera** | Supported | Chromium, same package |
| **Firefox** | Planned | Needs a separate content-script engine (Firefox has no `tabCapture`/`offscreen`). See [`FIREFOX_PORT.md`](FIREFOX_PORT.md). |

## Build from source

The popup is a React and TypeScript app bundled with Vite and [CRXJS](https://crxjs.dev).
The audio engine (service worker plus an offscreen Web Audio document) stays vanilla.

```bash
npm install
npm run build      # → dist/  (the loadable, CSP-clean MV3 extension)
npm run dev        # HMR dev build
npm test           # Vitest unit tests for the audio, preset, and rule logic
```

Then load the **`dist`** folder unpacked (see Install above).

To build the uploadable store zip:

```bash
npm run build
powershell -ExecutionPolicy Bypass -File build-zip.ps1
# → release/umbra-eq-<version>.zip
```

The same zip is accepted by the Chrome Web Store, Microsoft Edge Add-ons, and Opera.

## How it works

Manifest V3. The **popup** is React and TypeScript (Tailwind and shadcn/ui) and draws the
equalizer as plain SVG. The **audio engine is vanilla**: the service worker
(`src/background.js`) owns the offscreen document and mints tab-capture stream ids, and the
offscreen document (`public/offscreen.js`) runs the Web Audio graph. Each captured tab gets
its own chain of 11 biquad filters, glided click-free with `setTargetAtTime`. Per-site
memory and rules live in `chrome.storage`. Pure audio, preset, and rule math sits in
`src/lib` and is unit-tested with Vitest. The content security policy is strict
(`script-src 'self'; object-src 'self'`), so the production bundle has no remote code and
no `eval`.

See [`PROJECT.md`](PROJECT.md) for the full architecture reference and
[`CONTRIBUTING.md`](CONTRIBUTING.md) to work on it.

## Privacy

Everything runs on your computer. Umbra makes no network requests, has no analytics, and
never records or sends your audio. Settings and presets stay in your browser. Full details
in [`PRIVACY.md`](PRIVACY.md).

## Contributing

Issues and pull requests are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md), or open an
issue at <https://github.com/skyjacc/Umbra/issues>.

## Credits and licenses

- Application code: **MIT**, see [`LICENSE`](LICENSE).
- Fonts: **Inter** and **Geist Mono** under the SIL Open Font License 1.1
  ([`public/fonts/OFL-Inter.txt`](public/fonts/OFL-Inter.txt),
  [`public/fonts/OFL-GeistMono.txt`](public/fonts/OFL-GeistMono.txt)).
- UI: **React**, **Tailwind CSS**, **shadcn/ui** (MIT), **lucide-react** icons (ISC).
