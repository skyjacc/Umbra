# Umbra EQ — Project reference (A→Z)

The single source of truth for **what this project is, how it works, and where it
stands**. For narrower docs see the [Documentation index](#15-documentation-index).

- **Name:** Umbra EQ — Equalizer & Bass Boost
- **Type:** Browser extension, Manifest V3 (Chromium: Chrome, Edge, Opera)
- **Version:** 2.2.0 (see `CHANGELOG.md`; the version lives in six lock-step places — §11)
- **License:** MIT (author: skyjacc) — see `LICENSE`
- **Status:** feature-complete, security-audited, and **published** (public repo
  `skyjacc/Umbra`; GitHub Release + tag `v2.2.0`). Firefox is a planned separate port
  (see §13, `FIREFOX_PORT.md`).

> **Stack:** the popup is a **React + TypeScript** app (Vite + CRXJS, Tailwind +
> shadcn/ui); the EQ graph is plain React SVG and pure logic lives in `src/lib`
> (unit-tested with Vitest). The service worker (`src/background.js`) and offscreen
> Web Audio engine (`public/offscreen.js`) stay **vanilla JS**. Build → `dist/`, load
> that folder unpacked. See `CONTRIBUTING.md` for the dev loop.

---

## 1. What it is

Umbra EQ is a browser toolbar extension that puts a **live 11-band parametric
equalizer + bass boost** on tab audio. You open the popup, press *EQ This Tab*, and
shape the sound in real time by dragging a response curve. It is 100 % local: no
account, no ads, no analytics, no network — the audio never leaves the device.

## 2. Who it's for / why

For anyone who wants to fix or enhance the sound of what plays in their browser —
boost weak bass, tame harsh highs, lift quiet vocals, or raise the volume past 100 %
on a too-quiet video. A studio-grade tool in one click, with a design that looks
intentional rather than a generic dashboard.

## 3. Features

- **11-band parametric EQ** — drag nodes on a combined response curve (freq × gain,
  Shift-drag = Q/width, double-click = reset a band).
- **One global sound on every tab** — set the EQ once and it plays everywhere; a site
  with a matching **rule** overrides it. (Replaces the old per-site "sticky EQ".)
- **Domain rules** — a pattern language assigns a preset or an inline curve to sites
  by hostname pattern; first matching rule wins (see §5b).
- **Built-in presets** — Bass Boost, Vocal, Movie, Warm ship out of the box
  (dismissible + restorable), alongside your own **named presets** (save / apply /
  delete, Export/Import JSON, **Share by code**), synced via `storage.sync`.
- **Bass boost** + **master volume** (roughly −25 dB … +10 dB).
- **Output limiter** — a per-tab brick-wall limiter keeps big boosts loud but clean
  instead of clipping into crackle.
- **Live spectrum** overlay + **Band guide** (per-dot zone labels) — both visual only.
- **Full-window mode** — opens as a **global-sound editor** on a bigger graph.
- **4 themes** (Eclipse / Nocturne / Aurora / Solar) + a custom OKLCH hue slider.
- **RU / EN UI** with an in-app language switch. **Onboarding** page on install.
- **Offline & private** by design.

## 4. How it works (architecture)

Manifest V3 splits the extension into three contexts:

```
 ┌─────────────┐  toggleCapture / ensureOffscreen   ┌──────────────────┐
 │  popup       │ ─────────────────────────────────▶ │  background.js    │
 │  (React UI + │ ◀───────── getActiveTab ─────────── │  (service worker) │
 │   SVG graph) │                                     │  owns offscreen   │
 └─────┬───────┘   applySettings / modifyGain / FFT   │  + tabCapture id  │
       │           ─────────────────────────────────▶ └────────┬──────────┘
       ▼                                                        │ getMediaStreamId
 ┌──────────────────────────────────────────────────┐          ▼
 │  offscreen.js  (Web Audio engine, hidden document)│  getUserMedia(streamId)
 │  PER TAB: MediaStreamSource → preGain → 11 biquads │
 │  → postGain → limiter → speakers  (+ analyser FFT) │
 └──────────────────────────────────────────────────┘
```

- **Service worker (`src/background.js`)** — no DOM/Web Audio, so it only owns the
  offscreen-document lifecycle (create / ping-for-zombie / recreate) and mints
  tab-capture stream ids (`chrome.tabCapture.getMediaStreamId`). It answers
  `getActiveTab`, tracks tabs the user **Stopped** (so auto-capture won't undo a Stop),
  and mirrors the live-capture count onto the toolbar badge.
- **Offscreen document (`public/offscreen.js`)** — the audio engine. For **each captured
  tab** it consumes the stream id via `getUserMedia` and builds an independent chain
  `source → preGain → 11 BiquadFilters → postGain → limiter → destination`, so two tabs
  can hold two different curves at once. The chain is wired **once** (a 0 dB biquad is
  transparent — nothing is reconnected at runtime, a classic click source); every
  parameter **glides** via `setTargetAtTime` (~12 ms) instead of a hard `.value =`. The
  limiter is a `DynamicsCompressor` (threshold −1.5 dBFS, ratio 20, knee 0). An analyser
  taps `postGain` on demand for the spectrum and is dropped after ~1 s idle.
- **Popup (React, `src/popup/`)** — the whole UI: the SVG equalizer, drag interactions,
  presets, rules, spectrum, themes, onboarding link, i18n.

**Model v2 — the popup is the source of truth.** The offscreen document has **no reliable
`chrome.storage`**, so it can NOT resolve a tab's sound: it is a **dumb applier** that
only builds/holds per-tab chains and echoes status + FFT. The **popup** holds the global
profile + rules, resolves each captured tab (`resolvedFor`: **rule → global profile →
flat**), and pushes the bands via `applySettings`. Do NOT reintroduce rule/preset
resolution into the engine — it would silently no-op (no storage). See the invariants in
`CLAUDE.md`.

**Binding model:** capture is authorized by the user opening the popup (Chrome forbids
zero-interaction tab capture). Opening the popup auto-EQs the active tab (skipping tabs
the user explicitly Stopped). Each tab is captured and shaped **independently**.

## 5. The EQ graph

- 11 fixed bands at `DEFAULT_FREQUENCIES` (20 Hz … 20.48 kHz): band 0 is a low-shelf,
  band 10 a high-shelf, the middle 9 are peaking. Default Q `0.7071` (Butterworth).
- Coordinate transforms: **power-of-4** frequency axis (`xToFreq` / `freqToX`,
  ~20 Hz–22 kHz); **linear** dB axis. Dots clamp to ±30 dB inside a fixed ±60 dB view;
  the view does **not** auto-rescale while dragging (that caused a visible "jerk") —
  extreme summed curves just exit the top/bottom and the SVG clips them.
- ONE combined magnitude curve (sum of every band's dB response) over faint per-band
  ghost curves. Hover/drag a dot → its own bell + a live `freq / gain / Q` tooltip.
- **Spectrum** (opt-in) is resampled per x-pixel (log axis vs linear FFT bins),
  peak-held, capped to the lower part of the graph — visual only, never alters sound.
- **Band guide** (opt-in) overlays a bass / mids / treble / air label on each dot.

## 5b. Domain rules

A rule maps one or more hostname **patterns** to a target (a named/built-in **preset**
or an inline **curve** + gain). Patterns (dots are markers, `src/lib/rules.ts`):

| Pattern | Matches |
| --- | --- |
| `music.youtube.com` | exact host |
| `youtube.` | registrable name + any TLD, no subdomains (`youtube.com`, `youtube.gg`) |
| `.youtube.` | name anywhere: subdomains + any TLD (`music.youtube.com`) |
| `.youtube.com` | any subdomain, fixed TLD |
| `soundcloud` | bare word ≡ `soundcloud.` |

A rule may hold several patterns (OR); the **first enabled rule whose any pattern
matches wins**. A leading `www.` is normalized away so `www.site` and `site` are one.
Caveat: label-based, no Public Suffix List — multi-part TLDs (`.co.uk`) match
approximately. Rules live in one ordered `sync` array (`RULES`) so first-match order is
preserved; ids use `crypto.randomUUID()`.

## 6. Storage & persistence

- **`chrome.storage.local`** — `DEFAULT_EQ`: the **global profile** (the curve + gain
  played on every tab with no matching rule). The popup writes it and resolves each tab
  from it. (Old v1 `DEQ.*` per-site keys may linger, unused.)
- **`chrome.storage.sync`** — named presets under the `PRESETS.` prefix, and the ordered
  `RULES` array. Chrome syncs these across the user's signed-in browsers.
- **`localStorage`** (popup only, per-install) — UI prefs: `THEME`, `THEME_HUE`,
  `SHOW_VISUALIZER`, `SHOW_ROLES`, `HIDDEN_BUILTINS`.
- **Resolution is live:** on every engine status the popup re-resolves and pushes each
  captured tab, so a rule / global-profile / preset change updates all EQ'd tabs at once
  (skipped mid-drag so a live edit isn't clobbered).
- Import is hardened against **prototype pollution** (`__proto__` / `prototype` /
  `constructor` filtered; null-proto accumulators) and share codes are sanitized
  (patterns coerced to text, curves validated, malformed rules dropped) before they
  touch storage or matching.

## 7. Design system

- **Aesthetic:** near-black + a single restrained accent, edge-to-edge. Compact popup
  that fits a Chrome popup with no scroll in the default state.
- **Themes** are token-driven CSS custom properties; the SVG graph reads its colors from
  `--g-*` vars. Four preset themes (Eclipse default / Nocturne / Aurora / Solar) each
  swap the accent + graph hues, plus a **custom hue** slider derived at fixed OKLCH
  lightness/chroma so any color stays readable and equally bright.
- **Fonts (bundled, SIL OFL 1.1):** Inter Variable (UI) + Geist Mono (labels/axes),
  self-hosted via `@font-face` — no Google Fonts / CDN. Licenses ship in `public/fonts/`.
- **Icons:** lucide-react (MIT), plus an original inline **crescent-eclipse** logo mark
  tinted with the active accent. **No emoji** anywhere in the UI or docs.
- **Hard rule:** never put a CSS `transform` / `filter` on any ancestor of the graph
  SVG — the drag reads live element rectangles and a transformed ancestor breaks
  hit-testing.

## 8. Privacy & security

- **No data collected, transmitted, or leaked.** No analytics, no network calls of any
  kind. Captured audio is processed in-process and played back — never recorded,
  uploaded, or stored.
- **CSP:** `script-src 'self'; object-src 'self'` — no inline/remote script, no `eval`.
  All CSS/JS/fonts/icons are bundled.
- **Independent security audit verdict: GO for Chrome Web Store** — no critical/high
  findings; minimal, justified permissions; no obfuscated first-party code.
- See [`PRIVACY.md`](PRIVACY.md).

## 9. Permissions (all used, all justified)

| Permission   | Why |
| ------------ | --- |
| `activeTab`  | Access the current tab (audio/title/favicon) when the user clicks |
| `tabCapture` | Capture that tab's audio stream for the equalizer |
| `storage`    | Save the global profile, presets, and rules locally / synced |
| `offscreen`  | Host the Web Audio graph (service workers can't use Web Audio) |

No `tabs`, no `host_permissions`, no `<all_urls>`.

## 10. File map

| File | Role |
| --- | --- |
| `src/manifest.config.ts` | MV3 manifest (CRXJS `defineManifest`): name, version, icons, permissions, CSP |
| `src/background.js` | Service worker: offscreen lifecycle, tab-capture ids, active-tab, badge (vanilla) |
| `public/offscreen.js` / `.html` | Web Audio engine — per-tab 11-band chains, limiter, FFT (vanilla, dumb applier) |
| `src/popup/` | React popup: `App.tsx`, `useEngine.ts`, `i18n.tsx`, `theme.ts`, `components/*`, `index.html/.css` |
| `src/lib/` | Pure logic (Vitest): `audio.ts`, `presets.ts`, `builtins.ts`, `rules.ts`, `engine-io.ts` + `*.test.ts` |
| `public/onboarding.js` / `.html` | First-run guide (opens on install) |
| `public/icon16/32/48/128.png` | Toolbar + store icons |
| `public/fonts/` | Inter Variable + Geist Mono (+ their OFL licenses) |
| `build-zip.ps1` | Packages the store zip from `dist/` (forward-slash entries via System.IO.Compression) |
| `.github/workflows/build.yml` | CI: typecheck + test + build + package on push/PR to main and `v*` tags |
| `*.md`, `LICENSE` | Docs + license (see §15) |

## 11. Build, version & package

```powershell
npm ci
npm run build            # → dist/  (load unpacked, or zip it)
powershell -ExecutionPolicy Bypass -File build-zip.ps1   # → release/umbra-eq-<version>.zip
```

- **Dev loop:** `npm run build` → Reload on the extension card → Ctrl+R the open popup /
  full-window page. (After `vite` dev, delete `node_modules/.vite` + `dist` before a
  prod `vite build`, or `dist` can stay a dev stub.)
- **Version bump = SIX places, in lock-step:** `package.json`,
  `src/manifest.config.ts`, `src/background.js` (`BUILD`), `public/offscreen.js`
  (`BUILD`), `src/lib/engine-io.ts` (`BUILD`), `CHANGELOG.md`. The popup compares its
  `BUILD` to the engine's — a mismatch shows "STALE — reload extension". CWS rejects a
  non-higher version. Fixes → patch, user-facing → minor.
- `build-zip.ps1` zips the built `dist/` with forward-slash entry names (Chrome rejects
  the backslashes `Compress-Archive` writes on Windows PowerShell).

## 12. Tests & CI

- **`npm test`** (Vitest) — pure-logic suites in `src/lib`: `logic.test.ts`,
  `rules.test.ts`, `share.test.ts` (**46 tests**). **`npm run typecheck`** (`tsc
  --noEmit`) must pass.
- **CI** (`.github/workflows/build.yml`, Windows runner) runs typecheck + test + build +
  package on push/PR to `main` and on `v*` tags; on a tag it verifies `manifest.version
  == tag`, packages the zip, and attaches it to the GitHub Release.
- **Branch protection:** `main` requires a PR + a green `build` check before merge; no
  force-push, no deletion.

## 13. Status — done vs. pending

**Done / working:** MV3 per-tab capture, click-free 11-band engine + output limiter,
model-v2 popup resolution (global profile + rules), built-in + user presets with
self-heal + prototype-pollution guards, share-by-code, RU/EN UI, 4 themes + custom hue,
band guide, full-window global editor, onboarding, bundled OFL fonts, own crescent logo,
security audit GO, 46/46 tests, CWS-valid zip, **public repo + GitHub Release**.

**Pending / optional:**
1. Verify the name "Umbra EQ" is free on each store + not trademarked.
2. Prepare 1–5 store screenshots (1280×800 or 640×400).
3. Submit to Chrome Web Store, then reuse the same zip for Edge Add-ons + Opera; fill
   each store's data-safety form ("no data collected").
4. **Firefox:** separate content-script port — see `FIREFOX_PORT.md` (deferred).

## 14. Roadmap

Freemium-lite (planned, not built): core stays free forever; a small Pro tier (preset
cloud sync, extra themes, export collections) + a donation link, via an external provider
(Chrome removed built-in payments).

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
| `CLAUDE.md` | Agent build instructions + hard invariants | yes |
| `docs/AUDIT.md` | Fix / findings history | yes |
| `LICENSE` + `public/fonts/OFL-*.txt` | App (MIT) + font licenses | yes |
| `ENGINE_STUDY.md` · `handoff.md` · `Chat.md` | Deep engine notes / dev state / build log | **private** (gitignored) |
