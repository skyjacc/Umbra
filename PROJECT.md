# Umbra EQ — Project reference (A→Z)

The single source of truth for **what this project is, how it works, and where it
stands**. For narrower docs see the [Documentation index](#15-documentation-index).

- **Name:** Umbra EQ — Equalizer & Bass Boost
- **Type:** Browser extension, Manifest V3 (Chromium: Chrome, Edge, Opera)
- **Source version:** 2.5.0, release ready (see `CHANGELOG.md` and §11)
- **License:** MIT (author: skyjacc) — see `LICENSE`
- **Status as of 2026-11-09:** release ready; Chrome Web Store review is pending submission.
  The [public Chrome Web Store listing](https://chromewebstore.google.com/detail/plkncppcgglcjdkmcdeajhbfccbnnoee)
  was last verified as **2.4.1** on 2026-11-08. Public repository: `skyjacc/Umbra`. A source version, GitHub
  release or uploaded ZIP does not establish store publication. See §13 for remaining checks.

> **Stack:** the popup is a **React + TypeScript** app (Vite + CRXJS, Tailwind +
> shadcn/ui); the EQ graph is plain React SVG and pure logic lives in `src/lib`
> (unit-tested with Vitest). The service worker (`src/background.js`) and offscreen
> Web Audio engine (`public/offscreen.js`) stay **vanilla JS**. Build → `dist/`, load
> that folder unpacked. See `CONTRIBUTING.md` for the dev loop.

---

## 1. What it is

Umbra EQ is a browser toolbar extension that puts a **live 11-band parametric
equalizer + bass boost** on tab audio. You open the popup, press *EQ This Tab*, and
shape the sound in real time by dragging a response curve. Audio is processed locally and never uploaded. There is no Umbra account, advertising,
analytics or server. Saved presets and rules may sync through Chrome when browser sync is enabled.

## 2. Who it's for / why

For anyone who wants to fix or enhance the sound of what plays in their browser —
boost weak bass, tame harsh highs, lift quiet vocals, or raise the volume past 100 %
on a too-quiet video. The original compact interface keeps the graph and volume
control together. Capture availability depends on the browser and media source.

## 3. Features

- **11-band parametric EQ** — drag nodes on a combined response curve (freq × gain,
  Shift-drag = Q/width for the nine peaking bands, double-click = reset a band).
  Exact frequency/gain fields are available for all bands; shelves do not use Q.
- **One global sound for captured tabs** — set the shared profile once; a site
  with a matching **rule** overrides it. (Replaces the old per-site "sticky EQ".)
- **Domain rules** — a pattern language assigns a preset or an inline curve to sites
  by hostname pattern; first matching rule wins (see §5b).
- **Built-in presets** — Bass Boost, Vocal, Movie, Warm ship out of the box
  (dismissible + restorable), alongside your own **named presets** (save / apply /
  delete, Export/Import JSON, **Share by code**), synced via `storage.sync`.
- **Bass boost** + **master volume** (−50 dB … +20 dB, amplitude dB).
- **Output limiter** — one shared stereo AudioWorklet after all tab chains, with 5 ms
  lookahead and a −1 dBFS sample-peak ceiling. This is not a true-peak limiter.
- **Output peak meter** — common stereo output after limiting; the FFT remains per tab.
- **Auto Gain** — optional EQ-based compensation, off by default. It does not measure
  source loudness or automatically normalize different videos; see §13.
- **Reset changes / Save for this site / Bypass** — restore the opening sound, save a
  site rule, or edit an unsaved EQ draft while listening without EQ.
- **Live spectrum** overlay + **Band guide** (one label per frequency zone) — both visual only.
- **Full-window mode** — opens as a **global-sound editor** on a bigger graph.
- **4 themes** (Eclipse / Nocturne / Aurora / Solar) + a custom OKLCH hue slider.
- **RU / EN UI** with an in-app language switch. **Onboarding** page on install.
  English/Russian manifest locales and store copy are prepared in `docs/store/`;
  publishing the dashboard's localized descriptions is a separate step.
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
 │  → postGain → shared bus → limiter → speakers     │
 │  FFT: per-tab postGain; meter: shared output       │
 └──────────────────────────────────────────────────┘
```

- **Service worker (`src/background.js`)** — no DOM/Web Audio, so it only owns the
  offscreen-document lifecycle (create / ping-for-zombie / recreate) and mints
  tab-capture stream ids (`chrome.tabCapture.getMediaStreamId`). It answers
  `getActiveTab`, tracks tabs the user **Stopped** (so auto-capture won't undo a Stop),
  and mirrors the live-capture count onto the toolbar badge.
- **Offscreen document (`public/offscreen.js`)** — the audio engine. For **each captured
  tab** it consumes the stream id via `getUserMedia` and builds an independent chain
  `source → preGain → 11 BiquadFilters → postGain → shared output bus`, so two tabs
  can hold two different curves at once. The chain is wired **once** (a 0 dB biquad is
  transparent — nothing is reconnected at runtime, a classic click source); every
  parameter **glides** via `setTargetAtTime` (~12 ms) instead of a hard `.value =`. The
  shared bus feeds a stereo AudioWorklet limiter before the destination. An analyser
  taps each tab’s `postGain` on demand for the spectrum and is dropped after ~1 s idle.
  Separate channel analysers measure the shared output, avoiding stereo phase cancellation.
- **Popup (React, `src/popup/`)** — the whole UI: the SVG equalizer, drag interactions,
  presets, rules, spectrum, themes, onboarding link, i18n.

**Model v2 — settings are resolved outside the audio engine.** The offscreen document has **no reliable
`chrome.storage`**, so it can NOT resolve a tab's sound: it is a **dumb applier** that
only builds/holds per-tab chains and echoes status + FFT. The **popup** holds the global
profile + rules, resolves each captured tab (`resolvedFor`: **rule → global profile →
flat**), and pushes the bands via `applySettings`. The service worker uses the same stored-sound
resolver to supply initial settings when capture starts, including keyboard shortcuts with no
popup open. Cross-site navigation stops the old capture until a fresh user gesture. Do NOT reintroduce rule/preset
resolution into the engine — it would silently no-op (no storage). See the invariants in
`CLAUDE.md`.

**State rule — every applied sound must have a path to storage.** Anything pushed to the audio
engine is either already persisted or has a *guaranteed* commit path. Live audio and persistence are
deliberately two paths (the engine is fed ~30×/s during a drag; storage is written once, debounced,
to protect the `storage.sync` quota) — but the second path must never be simply cancelled. If it is,
the tab keeps playing a curve that storage does not have: the user hears their edit, believes it
saved, and the next popup open resolves from storage and silently reverts it. The popup dies on any
focus loss, so the debounce is flushed on `pagehide` / visibility-hidden / unmount rather than
dropped. Any future writer of sound state (reset, per-site save, A/B) must satisfy the same rule.

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
- **Band guide** (opt-in) overlays one bass / mids / treble / air label per zone.

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
  from it. `AUTO_GAIN` is shared with the worker so shortcut-started captures use the
  same compensation preference. (Old v1 `DEQ.*` per-site keys may linger, unused.)
- **`chrome.storage.sync`** — named presets under the `PRESETS.` prefix, and the ordered
  `RULES` array. Chrome can sync these through the user's account when browser sync is enabled.
- **`chrome.storage.session`** (service worker) — `stoppedTabs`: the ids of tabs the user
  explicitly **Stopped**. In-memory only would not survive an MV3 service-worker eviction
  (~30 s idle), so a Stop would be silently undone the next time the popup auto-EQs the
  tab; the SW hydrates the Set on cold start before deciding. Cleared on browser restart.
- **`localStorage`** (per-install, shared by the popup and the onboarding page — same
  `chrome-extension://` origin) — UI prefs: `THEME`, `THEME_HUE`, `SHOW_VISUALIZER`,
  `SHOW_ROLES`, `HIDDEN_BUILTINS`, and `UMBRA_LANG` (the RU/EN choice behind the §3
  language switch; falls back to `navigator.language` when unset).
- **Resolution is live:** on every engine status the popup re-resolves and pushes each
  captured tab, so a rule / global-profile / preset change updates all EQ'd tabs at once
  (skipped mid-drag so a live edit isn't clobbered).
- Import is hardened against **prototype pollution** (`__proto__` / `prototype` /
  `constructor` filtered; null-proto accumulators) and share codes are sanitized
  (patterns coerced to text, curves validated, malformed rules dropped) before they
  touch storage or matching.

## 7. Design system

- **Direction:** preserve the original compact audio instrument. Dark cool neutrals,
  restrained lavender bell filters and teal shelves, round draggable points,
  master on the left, exact band fields below and navigation along the bottom.
- **Geometry:** popup 620 × 580 px, with independent scrolling in `main`; full-window
  editor centered at up to 960 px. Layout follows app state, not browser height.
- **Graph:** full `viewBox="0 0 524 252"`. Pointer coordinates scale with the actual
  rendered rectangle. Keep axes, target sizes and keyboard edits readable after resize.
- **Themes:** four CSS-token themes and a custom hue. Colors communicate filter roles;
  selection also has a visible ring. Preserve the crescent and the existing UI language.
- **Accessibility:** visible focus, labelled controls, keyboard-accessible menus,
  guide focus trapping with inert background, and a reduced-motion override.
- **Fonts:** the interface keeps its original system-sans stack. Onboarding bundles
  Inter and Geist Mono with OFL licenses; there are no font CDN calls.
- **Hard rule:** no transforms, filters or backdrop filters on graph ancestors.
- See [DESIGN.md](docs/DESIGN.md). The previous full redesign and A/B concepts were
  exploratory and are not the current interface.

## 8. Privacy & security

- **No audio upload or analytics.** The application makes no direct network calls. Saved
  presets and site rules can be synchronized by Chrome through the user’s Google account. Captured audio is processed in-process and played back — never recorded,
  uploaded, or stored.
- **CSP:** `script-src 'self'; object-src 'self'` — no inline/remote script, no `eval`.
  All CSS/JS/fonts/icons are bundled.
- Release checks cover dependency advisories, production license inclusion and absence of
  the temporary debug recorder. Store acceptance remains a separate review.
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
| `public/limiter-worklet.js` / `limiter-core.js` | Shared stereo sample-peak limiter |
| `src/popup/` | React popup: `App.tsx`, `useEngine.ts`, `i18n.tsx`, `theme.ts`, `components/*`, `index.html/.css` |
| `src/lib/` | Pure logic (Vitest): `audio.ts`, `presets.ts`, `builtins.ts`, `rules.ts`, `engine-io.ts` + `*.test.ts` |
| `public/onboarding.js` / `.html` | First-run guide (opens on install) |
| `public/_locales/en/` / `ru/` | Localized manifest name, summary and shortcut description |
| `docs/store/` | EN/RU descriptions, privacy-form notes and store asset brief |
| `public/icon16/32/48/128.png` | Toolbar + store icons |
| `public/fonts/` | Inter Variable + Geist Mono (+ their OFL licenses) |
| `build-zip.ps1` | Packages the store zip from `dist/` (forward-slash entries via System.IO.Compression) |
| `scripts/build-licenses.mjs` | Includes application, dependency and copied-component licenses in `dist/` |
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

- **`npm test`** (Vitest) — Node unit/background suites and jsdom component/hook suites.
  **`npm run typecheck`** (`tsc --noEmit`) checks TypeScript.
- **`npm run test:audio`** — native Chromium compares graph math with Web Audio and renders
  the shipped AudioWorklet at 44.1/48/96 kHz, including stereo and multiple tab chains.
- **`npm run test:ui`** — production extension UI smoke tests in an isolated Chromium profile.
  Install its browser with `npx playwright install chromium`.
- **CI** (`.github/workflows/build.yml`, Windows runner, Node 24) runs dependency audit,
  typecheck, unit/DOM tests, native Chromium audio/UI checks, build and package on
  push/PR to `main` and on `v*` tags; on a tag it verifies `manifest.version
  == tag`, packages the zip, and attaches it to the GitHub Release.
- **Repository settings:** verify the current required checks and branch rules on GitHub
  before merging; the workflow file alone does not establish branch protection.

## 13. Status — done vs. pending

**Implemented in source 2.5.0:** MV3 per-tab capture, an 11-band engine with smoothed parameters and an output limiter,
model-v2 popup resolution (global profile + rules), built-in + user presets with
self-heal + prototype-pollution guards, share-by-code, RU/EN UI, 4 themes + custom hue,
band guide, full-window global editor, onboarding, bundled OFL fonts, own crescent logo,
automated unit and DOM suites, CI and a public repository. The original compact UI is
retained with targeted readability, keyboard, focus and responsive-layout fixes.
State/runtime fixes cover stale capture completions, offscreen recovery, pending edits,
storage-read failures and conflicting save/reset/undo operations. EN/RU store metadata
and descriptions are prepared. These are implementation facts, not store-review approval.

**Published:** the Chrome Web Store listing was last verified as **2.4.1** on 2026-11-08.
The 2.5.0 release is ready; review has not yet been submitted. No 2.5.0 store publication
is established by this checkout.

**Real-site validation, 2026-11-09:** the production ZIP with SHA-256
`1e277e2921368937a27d79664aefbae07cf1046ecf6761fdca79cab4018b374c` was exercised in official
Chrome with an isolated profile and the native popup. YouTube Big Buck Bunny playback/live
FFT, Bypass state, master −50 → 0 dB output response, a saved/reopened `Soft vocals` preset
(2500 Hz, +4 dB, Q 0.9), a YouTube rule, and simultaneous MDN-loop/Bass Boost capture were
checked. Stopping MDN left YouTube active. Stopping the final YouTube capture kept EQ off
after reopening; restarting restored live FFT and the saved 2500 Hz / +4 dB curve, and
stopping again returned to off. Subjective listening, DRM and fullscreen were not tested.
Exact URLs and earlier automated evidence are in
[`docs/store/validation-2.5.0.md`](docs/store/validation-2.5.0.md).

**Saved privacy draft:** Website content, Web history and Personal communications selected;
four permission justifications, No remote code and all three certifications saved. Confirm
the final localized assets and public policy before Submit for Review. Saving the draft,
GitHub publication, store submission and store approval are separate states.

**Auto Gain:** compensation is calculated from the mean of band gains, in amplitude dB,
and applied before the common limiter without changing the stored master gain. It is an
estimate, not measured loudness matching; an engaged limiter can reduce its audible effect.

**Pending / optional:**
1. Confirm the final **EN/RU store descriptions** and matching release assets from
   [`docs/store/README.md`](docs/store/README.md). Additional languages remain optional;
   current aggregate store metrics do not establish which acquisition source caused growth.
2. Record a demo of the shipped UI if needed; do not use the withdrawn redesign as a release asset.
3. Prepare Edge Add-ons + Opera listings if pursuing those stores; complete their current
   privacy/data-use forms from actual behavior, including the local-audio / browser-sync distinction.
4. **Firefox:** separate content-script port — see `FIREFOX_PORT.md` (deferred).

## 14. Roadmap

The 2.5.0 release scope is the implemented feature set above. Night mode, headphone AutoEQ,
automatic loudness normalization and voice separation are not included. Earlier monetization
ideas are not implemented or part of this release; no paid tier is being announced here.

### Future work

- Show Auto Gain state and compensation beside the master control. Both now use amplitude dB;
  the stored master must remain unchanged.
- User-configurable graph keyboard shortcuts, with the Guide kept in sync.
- Review custom-hue theme persistence and redundant writes on a pointer click with no movement.
- Continue measuring popup layout during Reset/Undo and other dynamic states.

The 2.5.0 audit adds graph focus styles and behavioral hook/background tests. Earlier notes
that deferred those fixes or described the old half-scale master dB readout are superseded.

## 15. Documentation index

| Doc | What it covers | In repo? |
| --- | --- | --- |
| `PROJECT.md` (this) | Whole-project A→Z reference | yes |
| `README.md` | Product/dev readme + browser-support matrix | yes |
| `CHANGELOG.md` | Versioned change history | yes |
| `CONTRIBUTING.md` | How to build, test, and contribute | yes |
| `PRIVACY.md` | Privacy policy (for the store listing) | yes |
| `DEPLOY.md` | Publishing checklist (all Chromium stores + GitHub release) | yes |
| `docs/store/README.md` | Prepared EN/RU listing copy, privacy fields and asset brief | yes |
| `docs/DESIGN.md` | Retained original UI and current screenshots | yes |
| `FIREFOX_PORT.md` | Deferred Firefox content-script architecture | yes |
| `CLAUDE.md` | Agent build instructions + hard invariants | yes |
| `LICENSE` + `public/fonts/OFL-*.txt` | App (MIT) + font licenses | yes |
| Handoff · audit log | Internal development notes | **private** (`umbra-internal`) |
