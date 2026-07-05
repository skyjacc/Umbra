# Umbra EQ — Project reference (A→Z)

The single source of truth for **what this project is, how it works, and where it
stands**. For narrower docs see the [Documentation index](#15-documentation-index).

- **Name:** Umbra EQ — Equalizer & Bass Boost
- **Type:** Browser extension, Manifest V3 (Chromium: Chrome, Edge, Opera)
- **Version:** 1.0.1 (dev; bumped only for a real store release)
- **License:** MIT (author: skyjacc) — see `LICENSE`
- **Status:** feature-complete + security-audited; being prepped for public GitHub +
  Chromium-store release. Firefox is a planned separate port (see §13, `FIREFOX_PORT.md`)

> **Build note (react-migration):** the popup has been rewritten as a React + TypeScript
> app (Vite + CRXJS, Tailwind + shadcn/ui); the EQ graph is plain React SVG (Snap.svg
> dropped) and pure logic lives in `src/lib` (Vitest). The service worker + offscreen
> Web Audio engine are unchanged vanilla. Build → `dist/`, load that folder unpacked.
> Sections below that reference `popup.js`/Snap.svg describe the original vanilla popup;
> the engine details still apply. See `CONTRIBUTING.md` for the current build.

---

## 1. What it is

Umbra EQ is a browser toolbar extension that puts a **live 11-band parametric
equalizer + bass boost** on any tab's audio. You open the popup, press *EQ This
Tab*, and shape the sound in real time by dragging a response curve. It is
100 % local: no account, no ads, no analytics, no network — the audio never
leaves the device.

## 2. Who it's for / why

For anyone who wants to fix or enhance the sound of what plays in their browser —
boost weak bass, tame harsh highs, lift quiet vocals, or raise the volume past
100 % on a too-quiet video. A studio-grade tool in one click, with a design that
looks intentional rather than a generic dashboard.

## 3. Features

- **11-band parametric EQ** — drag nodes on a combined response curve (freq ×
  gain, Shift-drag = Q/width, double-click = reset a band).
- **Bass boost** + **master volume** (up to +10 dB).
- **Presets** — name/save/apply/delete, **Export/Import** as JSON, synced across
  the user's own Chrome via `storage.sync`.
- **Live spectrum** overlay (visual only — never alters the sound).
- **4 themes** — Eclipse (default), Nocturne, Aurora, Solar — with a custom,
  fully-themed dropdown.
- **Guide** and **Active-tabs** panels (overlays on the graph).
- **Onboarding** page on install. **Full-window** mode. Hearing-safety caution.
- **Offline & private** by design.

## 4. How it works (architecture)

Manifest V3 splits the extension into three contexts:

```
 ┌─────────────┐  toggleCapture / ensureOffscreen   ┌──────────────────┐
 │  popup.js   │ ─────────────────────────────────▶ │  background.js    │
 │  (UI + SVG  │ ◀───────── workspaceStatus ──────── │  (service worker) │
 │   graph)    │                                     │  owns offscreen   │
 └─────┬───────┘                                     │  + tabCapture id  │
       │ apply/modify/getStatus                      └────────┬──────────┘
       ▼                                                      │ getMediaStreamId
 ┌──────────────────────────────────────────────────┐        ▼
 │  offscreen.js  (Web Audio engine, hidden document)│  getUserMedia(streamId)
 │  MediaStreamSource → preGain → 11 biquads →       │
 │  postGain → speakers   (+ analyser for spectrum)  │
 └──────────────────────────────────────────────────┘
```

- **Service worker (`background.js`)** — has no DOM/Web Audio, so it only owns the
  offscreen document lifecycle and mints tab-capture stream ids
  (`chrome.tabCapture.getMediaStreamId`). It also mirrors the active-tab count on
  the toolbar badge.
- **Offscreen document (`offscreen.js`)** — the audio engine. Consumes the stream
  id via `getUserMedia`, builds a **static Web Audio graph** (source → preGain →
  11 BiquadFilters → postGain → destination). The chain is wired **once**; a
  0 dB biquad is transparent, so nothing is reconnected at runtime (reconnecting
  is a classic click source). Every parameter **glides** via `setTargetAtTime`
  (~12 ms) instead of a hard `.value =`, so dragging is click-free.
- **Popup (`popup.js`)** — the whole UI: the SVG equalizer (Snap.svg), drag
  interactions, presets, spectrum, themes, onboarding link. It renders from
  `chrome.storage` **first**, so the graph and handles always appear even if the
  engine is slow or asleep; the engine's status refines it when it lands.

**Binding model:** capture is authorized by the user opening the popup (Chrome
forbids zero-interaction tab capture). All captured tabs mix into ONE global EQ.

## 5. The EQ graph

- Coordinate transforms: **logarithmic** frequency axis (`xToFreq/freqToX`,
  power-of-4) spanning ~20 Hz–20 kHz; **linear** dB axis.
- Fixed vertical range **±60 dB** (dots clamp to ±30 and sit comfortably inside).
  The view does **not** auto-rescale while dragging — that caused a visible
  "jerk". Extreme summed curves simply **exit the top/bottom smoothly** (the SVG
  viewport clips them) instead of a flat plateau.
- ONE combined magnitude curve (sum of every band's dB response) drawn as fill +
  stroke, over always-on faint per-band ghost curves. Hover/drag a dot → its own
  bell + a live `freq / gain / Q` tooltip.
- **Spectrum** (when on) is resampled **per x-pixel** (the axis is log, the FFT
  bins are linear) and capped to the bottom half so it never hides the curve.

## 6. Storage & persistence

- `chrome.storage.local` — the live EQ state: `EQ_STATE` (an atomic snapshot of
  all 11 filters + gain + active-preset name) plus a `filter0..10` + `GAIN`
  compatibility mirror.
- `chrome.storage.sync` — named presets under the `PRESETS.` prefix (Chrome syncs
  them across the user's own signed-in browsers).
- **Restore on boot:** `renderFromStorage()` paints the saved curve immediately.
  A `pendingRestore` guard then **forces the engine to that state on its first
  status**, so a fresh/flat engine after a browser restart can never overwrite the
  restored curve with a flat one.
- Import is hardened against **prototype pollution** (`__proto__`/`prototype`/
  `constructor` filtered in every read/write path; null-proto accumulators).

## 7. Design system

- **Aesthetic:** near-black + a single restrained accent, edge-to-edge (the popup
  fills the window — no floating rounded card). Compact: ~**556 × 510 px**, fits a
  Chrome popup with **no scroll** in the default state.
- **Themes** are token-driven. The popup chrome uses CSS custom properties; the
  JS-drawn SVG graph reads its colors from `--screen/--axis/--peak/--shelf/--viz/
  --grab/--text/--glow` on `<body[data-theme]>` via `loadTheme()`. Each theme only
  swaps the accent + graph hues:
  - **Eclipse** (default) — brick red `#ce3535`
  - **Nocturne** — steel blue
  - **Aurora** — muted green
  - **Solar** — amber
  Any stale/old stored theme name falls back to Eclipse (`VALID_THEMES`).
- **Fonts (bundled, SIL OFL 1.1):** Inter Variable (UI) + Geist Mono (labels/axes).
  Self-hosted via `@font-face` — no Google Fonts / CDN. Licenses ship in
  `fonts/OFL-Inter.txt` and `fonts/OFL-GeistMono.txt`.
- **Icons:** Tabler-style, inlined as SVG (MIT). The logo is an **original
  crescent-eclipse mark** (the "umbra" shadow), drawn inline and tinted with the
  active theme accent.
- **Custom theme dropdown** — a native `<select>`'s open list can't be themed, so
  it's a small div/JS dropdown that opens upward and matches the design.
- **Hard rule:** never put a CSS `transform`/`filter` on any ancestor of the graph
  SVGs — the drag reads live element rectangles and a transformed ancestor breaks
  hit-testing.

## 8. Privacy & security

- **No data collected, transmitted, or leaked.** No analytics, no network calls of
  any kind. Captured audio is processed in-process and played back — never
  recorded, uploaded, or stored.
- **CSP:** `script-src 'self'; object-src 'self'` — no inline/remote script, no
  `eval`. All CSS/JS/fonts/icons are inlined or bundled.
- **Independent security audit verdict: GO for Chrome Web Store** — no critical/
  high findings; minimal, justified permissions; no obfuscated first-party code.
- See [`PRIVACY.md`](PRIVACY.md).

## 9. Permissions (all used, all justified)

| Permission   | Why |
| ------------ | --- |
| `activeTab`  | Access the current tab (audio/title/favicon) when the user clicks |
| `tabCapture` | Capture that tab's audio stream for the equalizer |
| `storage`    | Save EQ settings + presets locally / synced |
| `offscreen`  | Host the Web Audio graph (service workers can't use Web Audio) |

No `tabs`, no `host_permissions`, no `<all_urls>`.

## 10. File map

| File | Role |
| --- | --- |
| `manifest.json` | MV3 manifest: name, version, icons, permissions, CSP |
| `background.js` | Service worker: offscreen lifecycle, tab-capture ids, badge |
| `offscreen.js` / `offscreen.html` | Web Audio engine (11-band graph, presets, FFT) |
| `popup.js` / `popup.html` / `popup.css` | The UI: SVG EQ, drag, presets, themes |
| `onboarding.js` / `onboarding.html` | First-run guide (opens on install) |
| `snap.svg-min.js` | Snap.svg (Apache 2.0) — SVG helper |
| `icon16/32/48/128.png` | Toolbar + store icons |
| `fonts/` | Inter Variable + Geist Mono (+ their OFL licenses) |
| `build-zip.ps1` | Packages the store zip (runtime files only, forward-slash paths) |
| `test/` | 4 self-check suites + a visual harness (excluded from the zip) |
| `*.md`, `LICENSE` | Docs + license (most excluded from the zip; see index) |

## 11. Build & package

```powershell
powershell -ExecutionPolicy Bypass -File build-zip.ps1
# → dist/umbra-eq-<version>.zip
```

Whitelists only the ~17 runtime files (JS/HTML/CSS, icons, the two fonts + their
OFL licenses). Uses `System.IO.Compression` so zip entries use forward slashes
(Chrome rejects the backslashes `Compress-Archive` writes on Windows PowerShell).

## 12. Tests

Four browser suites in `test/` (served over http, opened in a browser, results
read from `window.__results`) plus `visual-harness.html` for screenshot/inspect
checks. Current: **53/53** — engine 16, ui 17, preset-persistence 8, legacy-preset
-clamp 12. All excluded from the store zip.

## 13. Status — done vs. pending

**Done / working:** MV3 tab capture, click-free 11-band engine, popup-side presets
with self-heal + prototype-pollution guards, boot-restore with the pendingRestore
guard, Eclipse design + 4 themes + custom dropdown, bundled OFL fonts, own crescent
logo, **red-crescent toolbar icons (16/32/48/128)**, onboarding (Eclipse-themed),
compact edge-to-edge no-scroll layout, security audit GO, 53/53 tests, CWS-valid zip.

**Done for release prep:** MIT `LICENSE` (author skyjacc), `PRIVACY.md` contact →
GitHub Issues, `manifest.json` author/homepage/`minimum_chrome_version: 116`, README
with browser-support matrix + badges, `CHANGELOG.md`, `CONTRIBUTING.md`, CI
(`.github/workflows/build.yml` builds the zip on a `v*` tag), issue templates,
`FIREFOX_PORT.md`, and Edge/Opera steps in `DEPLOY.md`/`STORE_LISTING.md`.

**Pending before publishing:**
1. `git init` + first commit, create the public `skyjacc/umbra-eq` repo, push
   (outward-facing — do this yourself; the code is now MIT/public).
2. Verify the name "Umbra EQ" is free on each store + not trademarked.
3. Prepare 1–5 store screenshots (1280×800 or 640×400).
4. Submit to Chrome Web Store, then reuse the same zip for Edge Add-ons + Opera.
5. Fill each store's data-safety form ("no data collected").
6. **Firefox:** separate content-script port — see `FIREFOX_PORT.md` (deferred).

## 14. Roadmap

Freemium-lite (planned, not built): core stays free forever; a small Pro tier
(preset cloud sync, extra themes, export collections) + a donation link. Payments
would use an external provider (Chrome removed built-in payments). See
[`MONETIZATION.md`](MONETIZATION.md).

## 15. Documentation index

| Doc | What it covers | In repo? |
| --- | --- | --- |
| `PROJECT.md` (this) | Whole-project A→Z reference | yes |
| `README.md` | Product/dev readme + browser-support matrix | yes |
| `CHANGELOG.md` | Versioned change history | yes |
| `CONTRIBUTING.md` | How to build, test, and contribute | yes |
| `PRIVACY.md` | Privacy policy (for the store listing) | yes |
| `STORE_LISTING.md` | Copy/paste fields for Chrome/Edge/Opera dashboards | yes |
| `DEPLOY.md` | Publishing checklist (all Chromium stores + GitHub release) | yes |
| `FIREFOX_PORT.md` | Deferred Firefox content-script architecture | yes |
| `MONETIZATION.md` | Donation + Pro-tier plan | yes |
| `LICENSE` + `fonts/OFL-*.txt` | App (MIT) + font licenses | yes |
| `ENGINE_STUDY.md` | Deep dive on the audio engine | **private** (gitignored) |
| `handoff.md` | Running dev/handoff state | **private** (gitignored) |
| `Chat.md` | Full build history/log | **private** (gitignored) |
