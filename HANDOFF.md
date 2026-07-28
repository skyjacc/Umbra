# Handoff — Umbra EQ

> The one document a developer needs to pick this project up. Clone the repo, read this
> file top to bottom, and you have everything: what it is, how it is built, how to run it,
> how to ship it, what is broken, and what to do next.

**Last updated:** 2026-07-13 · **Version in code:** `2.3.0` · **Live on the Chrome Web Store:** `2.3.0`

---

## 1. What this project is

Umbra EQ is a Manifest V3 browser extension (Chrome, Edge, Opera) that gives **every browser
tab its own parametric equalizer**. Eleven bands, a live spectrum, bass boost, volume past
100 % behind a limiter, and per-site rules. Everything runs on the user's machine — no
account, no backend, no analytics, no network calls of any kind.

| | |
| --- | --- |
| Repo | <https://github.com/skyjacc/Umbra> — **public**, `main` is protected |
| Store listing | <https://chromewebstore.google.com/detail/plkncppcgglcjdkmcdeajhbfccbnnoee> |
| Store item id | `plkncppcgglcjdkmcdeajhbfccbnnoee` |
| License | MIT (fonts under SIL OFL — see `THIRD-PARTY-NOTICES.md`) |
| Knowledge base | Obsidian vault — see [§13](#13-obsidian-knowledge-base) |

---

## 2. Current state

| Channel | Version | Notes |
| ------- | ------- | ----- |
| Code (six lock-step places) | `2.3.0` | see [§8](#8-versioning) |
| GitHub tag + release | `v2.3.0` | zip attached by CI |
| Chrome Web Store (live) | `2.3.0` | approved and public |
| Branch `feat/2.4.0-band-guide-onboarding` | unreleased | see [§11](#11-in-flight) |

**Health:** 64 Vitest tests green · `tsc --noEmit` clean · CI green on push and PR · two full
adversarial audits closed with 0 critical / 0 high findings remaining.

**Traction (updated 2026-07-28, ~28-day window, from the store listing's own GA4 property
544778898):** ~70 active / 72 new users · 5.0 rating · healthy ~45 % view→install. The
bottleneck is discovery (top-of-funnel volume), not conversion or retention.
**Acquisition — this corrects an earlier "100 % extension menu / zero organic" claim:** ~24 %
of users arrive via web search engines (Google / DuckDuckGo / Bing landing on the store page),
~33 % via the browser's extension menu (mostly returning users), the rest direct / referral.
Geography leads with the **US (~20 %)**, then a long diverse tail — Romania is ~6 %, not the
21–28 % once assumed; English is 54 % of users. (Small sample — treat percentages as directional
and re-check monthly.) The full data-grounded plan lives in the vault's Discovery Plan; it should
drive the roadmap ([§12](#12-roadmap)).

---

## 3. Architecture

Three execution contexts, one rule that governs all of them.

```
┌──────────────────────────────────────────────────────────────────┐
│  POPUP  (React + TypeScript, bundled)          SOURCE OF TRUTH   │
│  · resolves each tab: site rule → global profile → flat          │
│  · owns presets, rules, themes, i18n                             │
│  · pushes the resolved bands down with applySettings             │
└───────────────┬──────────────────────────────────────────────────┘
                │ chrome.runtime messages
┌───────────────▼──────────────────────────────────────────────────┐
│  SERVICE WORKER  (src/background.js, vanilla)                    │
│  · owns the offscreen document lifecycle                         │
│  · mints tab-capture stream ids                                  │
│  · tracks stopped tabs in chrome.storage.session                 │
│  · paints the toolbar badge                                      │
└───────────────┬──────────────────────────────────────────────────┘
                │ chrome.runtime messages
┌───────────────▼──────────────────────────────────────────────────┐
│  OFFSCREEN DOCUMENT  (public/offscreen.js, vanilla Web Audio)    │
│  · DUMB APPLIER — holds one filter chain per captured tab        │
│  · 11 biquads → master gain → brick-wall limiter → destination   │
│  · echoes status + FFT frames back to the popup                  │
└──────────────────────────────────────────────────────────────────┘
```

### The invariant that matters most

**Model v2 — the popup is the source of truth.** The offscreen document has no reliable
access to `chrome.storage`, so it *cannot* resolve which sound a tab should get. The popup
does that resolution and pushes the finished band list down.

> **Do not reintroduce rule or preset resolution into the engine.** It will not throw — it
> will silently no-op, because the storage it would read is not there. This has been
> re-broken before; it is the single most expensive mistake available in this codebase.

### Other structural facts

- `public/offscreen.js` is a static `<script>` **outside the bundler**. Vanilla JS only —
  no `import`, no TypeScript, no npm packages.
- **11 fixed bands**: band 0 is a lowshelf, bands 1–9 are peaking, band 10 is a highshelf.
  Frequencies 20 Hz … 20480 Hz (`DEFAULT_FREQUENCIES`).
- Gain/frequency/Q **clamps are duplicated** in `src/lib/audio.ts` and `public/offscreen.js`
  because the two files cannot share a module. They must stay numerically identical;
  `src/lib/invariants.test.ts` guards this.
- Parameter changes are **glided**, never stepped, so dragging a band never clicks.
- CSP is `script-src 'self'; object-src 'self'`. No `eval`, no remote code, no content
  scripts, no host permissions.
- Storage split: named presets and rules live in `chrome.storage.sync`; the global profile
  (`DEFAULT_EQ`) and settings live in `chrome.storage.local`; stopped tabs live in
  `chrome.storage.session`; UI preferences live in `localStorage`.

---

## 4. Stack

| Layer | Technology |
| ----- | ---------- |
| Shell | Manifest V3 — service worker + offscreen document |
| Audio | Web Audio API — 11 biquad filters per tab + brick-wall limiter |
| Popup | React 18, TypeScript |
| Build | Vite + [CRXJS](https://crxjs.dev) |
| UI | Tailwind CSS, shadcn/ui primitives, lucide-react icons |
| Tests | Vitest (64) |
| CI/CD | GitHub Actions — build + test on push and PR, release zip on `v*` tags |

**Runtime dependencies:** `react`, `react-dom`, `lucide-react`, `clsx`, `tailwind-merge`,
`class-variance-authority`, `@radix-ui/react-slot`.
**Build dependencies:** `vite`, `@crxjs/vite-plugin`, `typescript`, `tailwindcss`,
`tailwindcss-animate`, `postcss`, `autoprefixer`, `vitest`, `@types/chrome`.

---

## 5. Project structure

```
src/
  background.js              service worker — offscreen lifecycle, capture ids, badge, BUILD
  manifest.config.ts         the MV3 manifest (consumed by CRXJS), version lives here
  raw.d.ts                   type shim for Vite ?raw imports (used by the invariants test)
  lib/                       pure, framework-free logic — this is the unit-tested core
    audio.ts                 clamps, biquad response math, filter sanitizing
    rules.ts                 site-rule pattern matching + www/host normalization
    presets.ts               preset normalize / merge / compare, storage hardening
    builtins.ts              the built-in presets (Bass Boost, Vocal, Movie, Warm)
    engine-io.ts             message contracts, share-code encode/decode, BUILD
    utils.ts                 small shared helpers
    logic.test.ts            audio + preset + biquad tests
    rules.test.ts            matcher tests
    share.test.ts            share-code round-trip tests
    invariants.test.ts       guards the six-place version + the duplicated clamps
  popup/
    index.html               popup entry
    main.tsx                 React root
    App.tsx                  shell, tab switching, header, EQ/Presets/Rules/Tabs/More
    useEngine.ts             all engine state: resolution, messaging, debounce, rAF coalescing
    i18n.tsx                 EN + RU strings — add every new string to BOTH
    theme.ts                 four themes + custom accent hue
    index.css                Tailwind entry + CSS variables
    components/
      EqGraph.tsx            the response curve, dots, spectrum, band-guide zone labels
      VerticalVolume.tsx     master volume slider (keyboard accessible)
      RulesView.tsx          site rules editor
      Select.tsx             accessible listbox
      BottomNav.tsx          the five-tab bar
      GuideOverlay.tsx       in-app guide modal (focus-trapped)
      ShareRow.tsx           copy / paste share codes
public/
  offscreen.html/.js         the Web Audio engine (vanilla, outside the bundler)
  onboarding.html/.js        post-install welcome page (EN/RU, CSP-clean, no inline script)
  icon16/32/48/128.png       toolbar + store icons
  fonts/                     Inter + Geist Mono, with their OFL licenses
docs/
  AUDIT.md                   internal fix log from the adversarial audits
.github/
  workflows/build.yml        CI: typecheck, test, build, package, attach to release
  ISSUE_TEMPLATE/            bug + feature templates
build-zip.ps1                packages dist/ into release/umbra-eq-<version>.zip
```

**Docs in the repo:** `README.md` / `README.ru.md` (public), `PROJECT.md` (architecture),
`DEPLOY.md` (release checklist), `STORE_LISTING.md` (store copy), `CONTRIBUTING.md`,
`PRIVACY.md`, `CHANGELOG.md`, `FIREFOX_PORT.md`, `THIRD-PARTY-NOTICES.md`, and this file.

---

## 6. Running it locally

**Requirements:** Node 20+ (developed on 24), npm, Chrome 116 or newer (the engine needs the
offscreen-document API). Windows is assumed only for `build-zip.ps1`; everything else is
cross-platform. **There are no API keys, no environment variables, and no services to
provision** — clone, install, build.

```bash
npm install
npm run build      # → dist/   the loadable, CSP-clean MV3 extension
npm test           # 64 Vitest unit tests
npm run typecheck  # tsc --noEmit, also runs in CI
npm run dev        # HMR dev build
```

Load it: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick the
**`dist`** folder (not the repo root).

**Dev loop:** `npm run build` → press **Reload** on the extension card → `Ctrl+R` the popup
or the full-window page.

> **CRXJS gotcha — this will bite you.** After any `vite dev` run, delete
> `node_modules/.vite` and `dist` before a real `vite build`. Otherwise `dist/` stays a
> "Vite Dev Mode" stub: the service worker fails to register and the popup cannot reach the
> engine. Symptom: the extension loads but does nothing.
> ```bash
> rm -rf node_modules/.vite dist && npm run build
> ```

---

## 7. Build and release pipeline

**Local package:**

```bash
npm run build
powershell -ExecutionPolicy Bypass -File build-zip.ps1
# → release/umbra-eq-<version>.zip   (~635 KB)
```

The zip is the built `dist/` tree: `manifest.json`, the service-worker loader and the
`assets/*` bundle, `offscreen.html/.js`, `onboarding.html/.js`, `src/popup/index.html`, the
four icons, and the bundled fonts with their OFL notices. No docs, no tests, no source maps.
**The same zip is accepted by Chrome, Edge, and Opera.**

**CI** (`.github/workflows/build.yml`) runs on every push and PR: typecheck, tests, build,
package. On a `v*` tag it verifies the manifest version matches the tag and attaches the zip
to the GitHub Release.

**Store release** — full checklist in `DEPLOY.md`. The essentials:

1. Bump the version in all six places ([§8](#8-versioning)) and add a `CHANGELOG.md` entry.
2. `rm -rf node_modules/.vite dist && npm ci && npm test && npm run build`, then smoke-test
   `dist/` unpacked against a real audio tab.
3. `powershell -ExecutionPolicy Bypass -File build-zip.ps1`.
4. `git tag vX.Y.Z && git push origin vX.Y.Z` → CI publishes the GitHub Release.
5. Chrome Web Store dashboard → **Package** → upload the zip. **You never type a version
   number in the dashboard** — it is read out of the manifest inside the zip, and it must be
   strictly higher than the live one.
6. Paste the description from `STORE_LISTING.md` if it changed. Permissions have not changed
   since 2.0, so the permission-justification form can stay as is.
7. Submit for review. Tick "publish automatically after review", otherwise an approved item
   sits unpublished and the approval expires after 30 days.
8. Update the Obsidian vault ([§13](#13-obsidian-knowledge-base)).

Review usually takes days, not the "weeks" the dialog warns about, because the permission
set is narrow (`activeTab`, `tabCapture`, `storage`, `offscreen` — no host permissions).

---

## 8. Versioning

The version string lives in **six places and they must move in lock-step:**

1. `package.json` → `"version"`
2. `src/manifest.config.ts` → `version`
3. `src/background.js` → `const BUILD`
4. `public/offscreen.js` → `const BUILD`
5. `src/lib/engine-io.ts` → `export const BUILD`
6. `CHANGELOG.md` → a new `## [x.y.z] — <date>` section

The popup compares its own `BUILD` against the engine's on every status message. If they
drift, the UI shows **"STALE — reload extension"** and refuses to operate — a deliberate
guard against a half-reloaded extension silently misbehaving.
`src/lib/invariants.test.ts` fails the build if the six drift apart.

Bug fixes → patch (`x.y.`**`z`**). User-facing changes → minor (`x.`**`y`**`.0`).
The Chrome Web Store rejects any upload whose version is not strictly higher than the live one.

---

## 9. Testing

```bash
npm test           # 64 tests, ~2s
npm run typecheck  # strict tsc
```

| File | Covers |
| ---- | ------ |
| `src/lib/logic.test.ts` | clamps (including the band-11 20480 Hz round-trip), biquad response, filter sanitizing, preset comparison |
| `src/lib/rules.test.ts` | site-rule matching, www normalization, first-match-wins ordering |
| `src/lib/share.test.ts` | share-code encode/decode round-trips, size cap, malformed input |
| `src/lib/invariants.test.ts` | the six-place version lock-step and the duplicated clamp constants, read via Vite `?raw` imports |

There are **no UI or end-to-end tests**. The popup, the service worker, and the offscreen
engine are only covered by manual smoke-testing — see the checklist in `DEPLOY.md`. This is
the largest gap in the test strategy ([§14](#14-technical-debt-and-known-limitations)).

---

## 10. What is implemented

- 11-band parametric EQ — drag the curve, or drive every band from the keyboard
  (arrows for gain/frequency, `Shift` for Q, `Enter` to reset)
- Live spectrum analyzer behind the curve; opt-in band guide with zone labels
- One global sound plus per-site rules (address patterns, first match wins), and an
  independent filter chain per tab
- Bass boost, master volume past 100 %, brick-wall output limiter
- Presets: four built-ins plus user presets, exported as a file or a copy-paste share code
- Full-window editor for the global sound; in-app guide overlay
- Four themes plus a custom accent hue; English and Russian throughout
- Keyboard and screen-reader accessible (roles, ARIA values, focus traps, roving focus)
- Post-install onboarding page with a pin guide
- CI, branch protection, issue templates, a keyword-dense store listing

---

## 11. In flight

**Branch `feat/2.4.0-band-guide-onboarding`** (pushed, not merged, not released):

1. **Band-guide fix** — `src/popup/App.tsx`, `src/popup/components/EqGraph.tsx`.
   The guide printed a zone label under *every* dot, so it read "Bass Bass Bass Mids Mids
   Mids Mids…" and the words overlapped at the low end where the bands sit close together.
   Now it renders one centered label per zone (BASS / MIDS / TREBLE / AIR) as a subtle
   legend. The header toggle icon changed from lucide `Tags` to `Captions`.
2. **Onboarding rebuild** — `public/onboarding.html`, `public/onboarding.js`.
   The page now leads with a live mockup of the popup itself (real header, band guide, EQ
   curve, animated FFT spectrum, bottom nav) so the product is visible immediately. The
   pin-flow is a pure-CSS animation (toolbar → extensions menu → cursor → pin) instead of a
   baked WebP; the two dead `onboarding-pin*.webp` assets were deleted. Reduced-motion falls
   back to a static open menu.

Both are built and verified locally. **To ship them:** bump to `2.4.0` per [§8](#8-versioning),
update `CHANGELOG.md` and the vault, open a PR into `main`, then follow [§7](#7-build-and-release-pipeline).

---

## 12. Roadmap

**Next — discovery, not features.** The product converts well and is rated 5.0; almost
nobody finds it. Ranked by expected impact:

1. **Store-listing reach, data-corrected.** Publish **Edge Add-ons + Opera** listings (same zip
   and copy) to add two searchable surfaces. **Localization** is **English-first → Spanish →
   Russian** (RU strings already ship) — the old "Romania 21–28 %, localize RU/RO/ES/DE/PT"
   priority was not supported by the GA4 data (Romania ~6 %, US #1, English 54 %). Draft copy for
   en + es/ru/ro/de/pt-BR is in the vault (`store-listing/`). The single highest lever is the
   keyword-led **store rename** — see item 3, now recommended (not just "reconsider").
2. **Record the demo GIF.** There is none today — the README falls back to two static screenshots. A 10–15 s
   loop of dragging the curve on a playing tab is the most persuasive asset the project can
   have, and it feeds the README, the store's video slot, and social posts.
3. **Reconsider the store name.** "Umbra EQ — Equalizer & Bass Boost" leads with a brand
   term that has no search volume; competitors lead with the keyword. Renaming a live
   listing carries risk, so treat this as a considered experiment, not a quick win.

**Later:** Firefox port (needs a content-script engine — Firefox has neither `tabCapture`
nor `offscreen`; see `FIREFOX_PORT.md`) · separate Edge Add-ons and Opera listings using the
same zip · another accessibility pass · more built-in presets.

---

## 13. Obsidian knowledge base

Durable notes about how the system works and every bug ever fixed live in an Obsidian vault,
kept in its **own private git repository** (the code repo is public and must not carry
internal audit notes).

Start at **`Umbra EQ.md`** — it is the map of content and links to everything else:
`Overview`, `Architecture`, `Audio Engine`, `Code Map`, `Rules & Matching`,
`Presets, Memory & Share Codes`, `Security`, `Testing`, `Release & Versioning`,
`Fixes & Findings`, `Maintenance`, `Glossary`, the dated audit notes, plus the working notes
`Handoff`, `Next Steps`, `Development Environment`, `Problems & Solutions`, and `Debug Notes`.

**Read `Code Map.md` before any deep code change** — it is the fast file/symbol/message/storage
index.

> **Vault sync is mandatory.** On any change that alters behavior, update the affected notes
> in the same session and log the fix in both `docs/AUDIT.md` and the vault's
> `Fixes & Findings.md`. On any version bump, update the version in `Umbra EQ.md` and
> `Release & Versioning.md`. `Maintenance.md` holds the full protocol.

---

## 14. Technical debt and known limitations

| Item | Why it matters |
| ---- | -------------- |
| **No UI or E2E tests** | The 64 tests cover `src/lib` only. Every regression in the popup, the service worker, or the engine is caught by hand. A Playwright smoke test that loads the unpacked extension and drives one band would cover the riskiest path. |
| **Clamps duplicated in two files** | `src/lib/audio.ts` and `public/offscreen.js` must agree numerically but cannot share a module (the engine is outside the bundler). `invariants.test.ts` guards it, but it is still copy-paste. |
| **`build-zip.ps1` is PowerShell-only** | Releasing from macOS or Linux needs a rewrite of the packaging step. |
| **No demo GIF** | The README ships static screenshots only (`docs/screenshot-eq.png`, `docs/screenshot-rules.png`). A short loop of the curve being dragged is the single most persuasive asset the project lacks. |
| **Store listing is English-only** | Directly caps discovery (see [§12](#12-roadmap)). |
| **`public/offscreen.js` is unbundled and untyped** | Deliberate — the offscreen document cannot take module imports — but it means no type safety on the audio hot path. |
| **Manual smoke-test checklist** | `DEPLOY.md` lists roughly fifteen manual checks per release. Slow, and easy to skip under pressure. |

---

## 15. Conventions

- **No emoji** anywhere in the UI or the docs — use lucide icons or i18n text.
- **Every UI string goes into both `en` and `ru`** in `src/popup/i18n.tsx`.
- `main` is protected: branch → PR → CI green → rebase merge. No direct pushes.
- Commits are authored by the maintainer alone; no co-author trailers or tool footers.
- Keep `README.md` short. Internal and maintainer-facing detail belongs in this file,
  `PROJECT.md`, or the vault — not in the README.
