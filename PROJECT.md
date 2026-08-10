# Umbra EQ — Project reference (A→Z)

The single source of truth for **what this project is, how it works, and where it
stands**. For narrower docs see the [Documentation index](#15-documentation-index).

- **Name:** Umbra EQ — Equalizer & Bass Boost
- **Type:** Browser extension, Manifest V3 (Chromium: Chrome, Edge, Opera)
- **Version:** 2.5.0 (see `CHANGELOG.md`; the version lives in six lock-step places — §11)
- **License:** MIT (author: skyjacc) — see `LICENSE`
- **Status:** feature-complete, security-audited, and **live on the Chrome Web Store**
  (item `plkncppcgglcjdkmcdeajhbfccbnnoee`, version 2.5.0; public repo `skyjacc/Umbra`,
  GitHub Release + tag `v2.5.0`). Firefox is a planned separate port
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

- **Aesthetic:** near-black + a single restrained accent, edge-to-edge. Compact popup
  that fits a Chrome popup with no scroll in the default state.
- **Themes** are token-driven CSS custom properties; the SVG graph reads its colors from
  `--g-*` vars. Four preset themes (Eclipse default / Nocturne / Aurora / Solar) each
  swap the accent + graph hues, plus a **custom hue** slider derived at fixed OKLCH
  lightness/chroma so any color stays readable and equally bright.
- **Fonts (bundled, SIL OFL 1.1):** Inter Variable (UI) + Geist Mono (labels/axes),
  self-hosted via `@font-face` — no Google Fonts / CDN. Licenses ship in `public/fonts/`.
- **Icons:** lucide-react (ISC), plus an original inline **crescent-eclipse** logo mark
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
  `rules.test.ts`, `share.test.ts`, `invariants.test.ts`, plus the one DOM suite `band-editing.test.tsx` (**419 tests in 24 files**). **`npm run typecheck`** (`tsc
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
two adversarial audits closed, 419/419 tests, CI + branch protection, **public repo +
GitHub Release**, and **published on the Chrome Web Store** with store assets and a
keyword-dense listing.

**In flight:** branch `release/2.5.0`. The code is frozen and the version is bumped; what
remains before the store upload is the browser smoke run against the production `dist/`
(see `DEPLOY.md`), taking the debug recorder out, and the store assets. One finding from
that run was measured, understood and deliberately left in — the popup growing after Reset;
see the 2.6 backlog.

One open question beside it: **Auto Gain was reported inaudible by ear** on a heavily
boosted curve. Its arithmetic is right (verified: mean band lift +5.85 dB → master −5.85 dB
→ net 0.000) and the message reaches the engine, but the master lands on `postGain`, which
sits *before* the limiter — and at ratio 20:1 a 5.85 dB cut ahead of an engaged limiter
becomes ~0.3 dB at the output. That would leave the feature working only while the limiter
is idle, i.e. everywhere except the case it exists for. Unconfirmed: the discriminating
test (modest boosts, master at 0 dB) has not been run. Any fix means moving the
compensation after the limiter — an audio-chain change, not a 2.5 one.

**Pending / optional:**
1. **Localize the store listing** (RU, RO, ES, DE, PT-BR). Discovery is the bottleneck:
   the listing draws almost no organic store-search traffic.
2. Record the demo GIF (the README placeholder is still commented out).
3. Reuse the same zip for Edge Add-ons + Opera listings; fill each store's data-safety
   form ("no data collected").
4. **Firefox:** separate content-script port — see `FIREFOX_PORT.md` (deferred).

## 14. Roadmap

Freemium-lite (planned, not built): core stays free forever; a small Pro tier (preset
cloud sync, extra themes, export collections) + a donation link, via an external provider
(Chrome removed built-in payments).

### 2.6 backlog

Found during the 2.5 release smoke. None of these is a 2.5.0 defect; the mechanics are
correct in every case. Kept out of 2.5 deliberately.

#### UX / feedback

**Auto Gain gives no sign it is on outside the More view.**

Auto Gain changes how everything sounds, and the only thing in the interface that says so is
its own toggle on another screen (`App.tsx`, the More view). On the EQ screen there is
nothing: `VerticalVolume` is handed `eng.gain`, the stored master, so the readout says the
same number whether compensation is active or not.

*Do not change the Auto Gain model.* The stored master stays exactly as the user set it, and
`outputGain` keeps being computed for the engine alone. The slider must not move — a
compensated value fed back into storage would duck the tab further on every message, which is
the whole reason `lib/auto-gain.ts` keeps the two numbers apart. This item is about showing
state, not about changing it.

Preferred shape: a small `AG` indicator beside the master volume, present only while the
feature is on and absent entirely when it is off. Not a second control — More owns the
control, the EQ screen shows the state, so the two can never disagree. A hover tooltip along
the lines of *"Auto Gain is active — playback level is being compensated without changing
your saved volume."*

Worth pairing with the amount, which answers the question the indicator raises ("I set +10 dB
and it did not get 10 dB louder"):

```
+10.0 dB      <- the saved master, unchanged
 −2.9 AG      <- the compensation, live, stored nowhere
```

**MIND THE SCALE.** The two dB numbers in this codebase are not the same unit, and an
indicator written from a sketch will get this wrong. The master readout prints
`masterGainToDb = 10*log10(g)`, so a stored gain of `10` shows as `+10.0 dB`. The
compensation in *that* scale is `compensationDb(bands) / 2`. The un-halved
`compensationDb` — amplitude dB, the band convention — is roughly twice as large and belongs
to a scale in which the same master would read `+20 dB`. Printing the un-halved figure next
to the master readout invites the user to subtract two numbers that do not share a unit.

Cheap to build: `compensationDb` is already exported, and `eng.autoGain` and `eng.bands` are
already in `App.tsx`. Popup-only, no engine or storage change.

Explicitly NOT wanted: rewriting the master figure itself (`10 → 4.2`); presenting the
compensation as if it were stored; a second slider; text on the graph; a persistent block of
copy; any change to the mean-of-all-bands algorithm.

#### Features

- **Let the user rebind the graph's keyboard shortcuts.** The steps and modifiers in
  `lib/band-input.ts` are fixed; Shift is coarse, Alt is fine, and Q has no binding at all.
- **Make the Guide follow those bindings once they are configurable.** The keycaps in
  `GuideOverlay.tsx` are literals today. They were written by reading the code because the
  component's own header had been describing a binding that did not exist — a static guide
  beside a configurable binding is the same failure with more steps.

#### Accessibility

**Keyboard focus indicator for the EQ points.**

Since the 2.5 fix that made the arrow keys reachable, pressing a dot focuses it
programmatically — `dotDown` calls `preventDefault` for the drag, which is exactly what used
to suppress the focus that made keyboard shaping work. Focus is therefore load-bearing now,
and Chrome draws its own ring around the focused `<circle>` because the project has no focus
styling at all: `outline`, `:focus` and `:focus-visible` appear nowhere in `popup/index.css`.
The result is a system-blue rounded square on the graph after every click.

For 2.6, replace the browser outline with a focus state of Umbra's own. Requirements:

- keyboard accessibility stays complete — Tab must still show, unmistakably, where focus is;
- do not stop focusing the dot; that is what makes the arrow keys work;
- never `outline: none` without an alternative indicator in the same change;
- a pointer press must not look like a stray system outline;
- the indicator follows the theme tokens, like everything else on the graph;
- the graph's geometry does not change — no layout shift, no re-measured dots.

**Not to be attempted before 2.5.0 ships.** Hiding the ring with CSS is a two-line change
that converts a cosmetic regression into an accessibility one, and the release is not the
place to find that out.

#### Layout

**Resetting the saved sound grows the popup by 34 px.** Measured, not inferred: the Undo
block in More is 54 px tall plus a 4 px `mt-1`, so it adds 58 px of flow; the shell's
`min-h-[500px]` floor (`App.tsx`) absorbs the first 24 of them because More's own content is
only 476 px, and the remaining 34 push the window. Nothing is clipped, no scrollbar appears
and Chrome's 600 px ceiling is never reached — the window simply jumps under the pointer.
Accepted for 2.5.0 rather than fixed under freeze.

Two candidate fixes, neither obviously better:

- Give the More view its own 534 px floor. Reset then moves nothing, and switching EQ→More
  becomes +18 px where today it is −16 — the same magnitude of movement that already exists.
  No overlay, no change to how Undo behaves.
- Float the Undo the way the notice floats, anchored above the nav. Costs zero layout, but
  it covers the bottom of whatever is behind it, and an undo still armed when the user walks
  to the EQ screen would sit over the graph.

What must NOT change either way: the Undo has to outlive the toast. It is not on a five
second timer, it is cleared by the next save, because deciding whether you wanted a reset
means listening to something. Folding it back into the notice would restore a bug that was
already fixed once — see the toast entry in `CHANGELOG.md` for 2.5.0.

#### Technical

- **Typed band values are only clamped when they commit.** A field accepts `-3120.0` dB or a
  Q of `32` and silently corrects it on blur (to `-30` and `11`). Both were typed during the
  2.5 smoke. Limiting entry as it is typed is a behaviour change, not a fix.
- **Moving the Custom hue slider leaves `data-theme` on the previous preset.** `setHue` calls
  `applyCustomHue` directly and bypasses `applyThemeId`, so accent colours change immediately
  but the base palette does not — until the next popup open, when boot runs
  `applyThemeId('custom')` and switches the base to `eclipse`. Cosmetic; the theme you see
  after dragging is not the theme you get next time.
- **A pointer press on a graph dot writes even when nothing moved.** `eqUp` commits whenever
  `dragIdx` is set, and `dotDown` sets it on pointerdown regardless of movement, so a bare
  click costs one redundant `chrome.storage.local` write. Harmless — `writeDefaultEq` stores
  raw values, so the write is identical but for `updatedAt` — but `band-editing.test.tsx`
  never fires `pointerUp`, so nothing covers it.
- **`useEngine` has no behavioural harness.** Its planners are pure and well covered, but the
  hook that sequences them — commit debounce, storage-change refresh, undo arming, the
  two-window paths — is only ever exercised by hand. Every P1 in the 2.5 cycle lived in
  wiring of exactly that kind, and `band-editing.test.tsx` exists because source-text
  assertions could not hold the two that reached components.

## 15. Documentation index

| Doc | What it covers | In repo? |
| --- | --- | --- |
| `PROJECT.md` (this) | Whole-project A→Z reference | yes |
| `README.md` | Product/dev readme + browser-support matrix | yes |
| `CHANGELOG.md` | Versioned change history | yes |
| `CONTRIBUTING.md` | How to build, test, and contribute | yes |
| `PRIVACY.md` | Privacy policy (for the store listing) | yes |
| `DEPLOY.md` | Publishing checklist (all Chromium stores + GitHub release) | yes |
| `FIREFOX_PORT.md` | Deferred Firefox content-script architecture | yes |
| `CLAUDE.md` | Agent build instructions + hard invariants | yes |
| `LICENSE` + `public/fonts/OFL-*.txt` | App (MIT) + font licenses | yes |
| Handoff · audit log · store copy | Internal development notes | **private** (`umbra-internal`) |
