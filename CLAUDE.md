# Umbra EQ — project instructions

MV3 Chrome extension: per-tab parametric equalizer + bass boost. React popup +
vanilla audio engine (service worker + offscreen Web Audio). Loadable/uploadable
artifact is the **`dist/`** folder from `npm run build`.

## ⚠️ MANDATORY: keep the Obsidian vault in sync
There is a knowledge-base vault at **`C:\Users\oblako\Documents\Umbra`** (Obsidian,
linked markdown notes). It mirrors the code and the fix history.

- **On any code change** that alters behavior, update the affected vault note(s) in the
  SAME session — and log the fix in both `docs/AUDIT.md` (in-repo) and the vault's
  `Fixes & Findings.md`.
- **On every version bump**, also update the version in the vault (`Umbra EQ.md` home) and
  the release summary.
- The vault's `Maintenance.md` is the full protocol; `Code Map.md` is the fast
  file/symbol/message/storage index — read it before deep code changes.

## Versioning (bump = SIX places, in lock-step)
`package.json`, `src/manifest.config.ts`, `src/background.js` (`BUILD`),
`public/offscreen.js` (`BUILD`), `src/lib/engine-io.ts` (`BUILD`), `CHANGELOG.md`.
The popup compares its `BUILD` to the engine's → mismatch shows "STALE — reload extension".
CWS rejects a non-higher version. Fixes → patch, user-facing → minor. Also update the vault.

## Invariants (don't break)
- **Model v2 — popup is the source of truth.** The offscreen document has NO reliable
  `chrome.storage`, so the engine can't resolve a tab's sound. The POPUP resolves each tab
  (`resolvedFor`: rule → global profile → flat) and pushes bands via `applySettings`;
  `public/offscreen.js` is a DUMB APPLIER (builds/holds per-tab chains, echoes status/FFT).
  Do NOT reintroduce rule/DEQ resolution into the engine — it silently no-ops (no storage).
- `public/offscreen.js` is a static `<script>` outside the bundler — vanilla JS only, no
  `import`. No matcher/preset mirror lives here anymore (the popup owns `rules.ts`/`builtins.ts`).
- 11 bands, fixed `DEFAULT_FREQUENCIES`. Clamps duplicated in `audio.ts` + `offscreen.js`.
- UI text lives in `src/popup/i18n.tsx` — add to BOTH `en` and `ru`.

## Commands
`npm run typecheck` (must pass, runs in CI) · `npm test` (vitest) · `npm run build` (→ dist/).
Dev loop: build → Reload on the extension card → Ctrl+R the open popup/full-window page.
