# Changelog

All notable changes to Umbra EQ are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **Type the numbers instead of dragging them.** Pick a point on the curve and the readout under
  the graph becomes three fields — frequency, gain and Q — for that band. Tab moves between them,
  Enter accepts, Escape puts the old value back. On the curve itself the arrow keys still shape the
  band (up/down for gain, left/right for frequency, Shift for a bigger step, Alt for a smaller
  one); inside the number fields they move the cursor, the way they should.


- **A peak meter** down the right edge of the graph, reading the signal after the equalizer and
  your volume — so you can see when a boost has pushed the tab into clipping instead of guessing.
  A held marker shows the recent maximum and a dot lights when you go over. It only shows: it does
  not touch the sound. (Automatic limiting is a separate feature and is not part of this release —
  when the meter says you are over, pull the boost back or switch Auto Gain on.)


- **Auto Gain**, under More, off by default. Boosting bands makes everything louder, and louder
  reads as better whether or not the curve is any good — this subtracts what the curve added so you
  can judge the shape at matched level. It changes only what you hear: your volume and your saved
  profiles are untouched, and switching it off puts the level straight back.


- **A Reset button, next to Save.** After changing the curve there was no obvious way back. There
  is now: **Reset** puts the sound back to what it was when you opened Umbra — not one step back,
  all the way back. Edit again afterwards and it still returns to that same starting point. It
  stays on screen after an edit saves itself, which the earlier attempt did not: that one appeared
  while you dragged and vanished the moment you let go.


- **You can shape the curve while Bypass is on.** The graph used to go dead when you bypassed the
  equalizer, which no other EQ does. Now it stays live: drag bands while the tab plays unshaped,
  then switch Bypass off to hear what you built. The flat line on the graph turns solid while
  bypassed — that line is what you are actually hearing. Nothing is saved until you leave Bypass,
  so it is a scratch pad: switch it off and the work is written in one go.


- **The equalizer now says why it isn't running.** On a page Umbra can't work on (a browser system
  page), on a tab you stopped by hand, or when audio capture fails, the popup explains what is
  happening instead of showing a full-size equalizer that doesn't respond — which looked broken.

- **A keyboard shortcut to turn the equalizer on or off** without opening the popup. It has no
  default combination — assign one at `chrome://extensions/shortcuts`. Useful mainly in fullscreen,
  where the toolbar is hidden: enter fullscreen first, then switch Umbra on with the shortcut and
  fullscreen stays real.

- **Save for this site** — a button next to the equalizer turns the sound you are hearing into a
  rule for the site you are on, and puts your everywhere-sound back to what it was. On a site that
  already has a rule it says **Update** and replaces that rule's sound instead, leaving its name,
  its address patterns and whether it is switched on exactly as they were.

- **Bypass** — a button in the equalizer header plays the tab unchanged for a moment, so you can hear
  what your settings are actually doing. It changes nothing that is saved: switch it off and the
  sound comes straight back.

### Fixed

- **A curve shaped under Bypass could be lost by closing the popup right after switching Bypass
  off.** Nothing shaped while bypassed is written until you leave Bypass, so at that moment the
  work existed in one place only, and the save that follows is asynchronous — closing the popup in
  the same instant raced it. It is now recorded before the save, the same way an ordinary edit is,
  so it survives.

- **Restoring the everywhere-sound kept the curve but forgot which preset it came from.** Both
  Reset and the rollback that runs after Save for this site put the sound back and left the header
  reading "None" for a curve that was still, visibly, Vocal.


- **An old Undo button could appear on an unrelated message and roll back your rules.** After a
  profile reset, the offer to undo it never expired, while the message carrying it disappeared
  after five seconds — so the next "Saved" or "Copied" notice showed up with a live Undo attached
  that restored your rules as they were minutes earlier. The undo now belongs to the reset that
  created it: saving anything else replaces it, and the message that offers it is the one that
  armed it. It also has a permanent home under **More**, next to Reset, because deciding whether
  you wanted a reset takes longer than a toast stays on screen.


- **A tweaked preset no longer forgets it was a preset.** Nudging one band used to blank the name
  in the header, so a curve you built from Vocal became an anonymous "None" — and it happened
  twice over: once on the first pointer move, and again 200 ms later when the edit was saved. The
  header now reads **Based on Vocal**, and keeps reading it until you pick a different preset.
  Drag the band back and it says **Vocal** again. Sites without a rule remember this too, which
  they previously could not.


- **Site rules stopped saving once you had about a dozen of them.** All rules share a single
  synced storage slot with a hard 8 KB limit, and a hand-shaped curve was stored at full floating
  point precision — around 700 bytes each, so the eleventh site could push the whole set over the
  edge and every save after that failed. Curves are now rounded when they are written, to a grid
  finer than the equalizer can display: 0.1 dB, 0.1 Hz, and Q to three decimals. Same sound, less
  than half the space, roughly twice as many sites. Existing rules are untouched until you next
  save, and get the space back automatically at that point.


- **An EQ change made just before the popup closes is no longer lost.** Adjusting the sound and then
  immediately reloading the page or closing the popup could leave the tab playing the new sound
  while it was never actually saved — so it kept playing, seemed saved, and then reverted the next
  time you opened Umbra. Umbra now keeps a recovery copy of the change you are making and restores
  it the next time it opens.

### Changed

- **Reset no longer wipes a saved sound in one click.** The single Reset button deleted a site's
  rule, or flattened the sound played on every tab, with no confirmation and no way back. It has
  moved to **More**, asks twice, and can be undone from the message that follows.

- **Better multi-tab behaviour while editing.** Adjusting the sound on one tab no longer stops other
  tabs from picking up preset and rule changes.

## [2.4.1] — 2026-07-29

### Changed

- **Store title leads with the keyword** — the extension name is now
  "Equalizer + Bass Boost, per Tab — Umbra EQ" (was "Umbra EQ — Equalizer & Bass Boost"), so the
  Chrome Web Store's search-weighted title starts with the terms people actually search for, while
  keeping the Umbra EQ brand as a suffix. No functional change.

## [2.4.0] — 2026-07-29

### Changed

- **Band guide** — the guide printed a zone label under every one of the 11 dots, so it read
  "Bass Bass Bass Mids Mids Mids Mids…" and the words collided at the low end where the bands sit
  close together. It now renders one centered label per frequency zone (BASS / MIDS / TREBLE /
  AIR). The header toggle icon changed from `Tags` to `Captions`.
- **Onboarding rebuilt** — the welcome page now leads with a live mockup of the popup (real
  header, band guide, EQ curve, animated FFT spectrum, bottom nav). The pin-the-extension
  animation is now pure CSS (toolbar → extensions menu → cursor → pin) with a reduced-motion
  static fallback, replacing a baked WebP.
- **Higher-contrast UI text** — the bottom-navigation labels and helper / empty-state text now
  meet WCAG AA contrast.

### Added

- **Engine health warning** — if the popup and the audio engine ever fall out of sync, the popup
  now shows a clear "reload the extension" banner instead of silently misbehaving.

### Fixed

- A just-finished band edit could briefly revert (and be saved reverted) when another tab started
  or stopped playing.
- Stopping a tab from the **Tabs** list is now remembered, so it isn't automatically re-EQ'd the
  next time you open the popup.
- Keyboard focus no longer jumps to the top of the popup after you close a dropdown or the in-app
  guide; read-only equalizer controls now announce their disabled state to screen readers.
- A corrupt or foreign saved preset can no longer break the equalizer.
- A site rule set to a preset could briefly play flat right after the popup opened (until you
  switched views or toggled it), if the rule's preset was still loading — the popup now
  re-applies once presets and rules have loaded.

### Security

- The **Tabs** list no longer loads site icons over the network: favicons render only from local
  data, and the extension's content-security policy now blocks any remote image or connection —
  keeping the "100% local, no network" guarantee airtight.

### Performance

- The live spectrum stops polling the audio engine when the equalizer view isn't visible (saves
  CPU / battery, most noticeably in the full-window editor).

### Removed

- `public/onboarding-pin.webp` and `public/onboarding-pin-static.webp` — no longer referenced
  after the onboarding rebuild.

## [2.3.0] — 2026-07-11

Two rounds of a production audit (specialized sub-agents, adversarially verified) drove a
hardening pass; the second round caught and fixed regressions the first round's fixes introduced.

### Added
- **Keyboard control for the equalizer** — the master fader and every band dot are now focusable
  sliders: arrow keys move gain/frequency, Shift+arrow changes Q, PageUp/Down and Home/End on the
  fader, Enter/Delete resets a band. Proper `role="slider"` + live value semantics for screen readers.
- **Rebuilt onboarding** — a pin-the-extension guide with an arrow to the toolbar and a baked,
  self-contained animation of the extensions-menu pin flow (no external assets); reduced-motion aware.

### Changed
- **Rules: a "Custom sound" rule can be switched to a preset** (and back) — it used to be a dead end.
- **Build:** `@crxjs/vite-plugin` moved off the deprecated beta to the stable line (2.7.x).
- Volume and EQ dragging, and the spectrum FFT, do less work per frame (coalesced updates, lighter
  FFT payload), and the spectrum poll no longer re-renders the whole popup.

### Fixed
- A **Stopped** tab is no longer silently re-equalized after the service worker is evicted
  (the Stopped set now persists in `chrome.storage.session`).
- **Tab-capture streams no longer leak** on init failure, mid-capture disconnect, or a chain error.
- Holding a key to nudge a band/volume no longer risks blowing the sync-storage write quota and
  silently dropping the final save (commits are debounced).
- A rule pattern edited in one window is no longer overwritten by a stale edit in another; the
  pattern field also commits on Enter and shows the normalized value.
- Opera/other internal pages (`opera://`, `view-source:`, `chrome-untrusted://`) are correctly
  treated as not-capturable; a health-checking ping no longer tears down live captures during a slow
  engine start; an imported rule with a preset named like `__proto__` can no longer crash resolution.
- The **toolbar badge** shows the live capture count again (it read a stale field and was always empty).
- The top band (20.48 kHz) is no longer clamped down, so a flat preset round-trips cleanly.
- The themed dropdowns are keyboard-navigable and the in-app guide is a proper focus-trapped dialog;
  action toasts are announced to screen readers.

## [2.2.0] — 2026-07-08

Umbra now works like one sound system: a single EQ plays on **every** tab, and rules override
it for the sites you choose. This replaces the old per-site "sticky EQ" memory — you just edit
what you hear, and it goes to the right place.

### Added
- **One global sound on every tab** — set the EQ once and it plays everywhere. On a site with
  a rule you edit that rule; everywhere else you edit the global sound.
- **Built-in presets** — **Bass Boost**, **Vocal**, **Movie**, and **Warm** ship in the Presets
  tab, so there's a good sound with zero setup. Dismiss one with ×; bring them back with
  **Restore built-ins**.
- **Full window is now a global-sound editor** — open it to shape the sound-everywhere profile
  on a bigger graph; changes apply to every tab you have EQ on.
- **Band guide** — a toggle next to Spectrum labels each dot's zone (Bass / Mids / Treble /
  Air) so it's clear what you're dragging.
- **Active preset** is shown in the EQ header.
- **Output limiter** — an automatic brick-wall limiter on each tab keeps big boosts loud but
  clean instead of clipping into crackle.

### Changed
- **Rules and the global sound take effect live** — change one and every EQ'd tab updates right
  away, instead of only on the next capture.
- **www sites** — `www.youtube.com` and `youtube.com` count as the same site, so a rule made on
  a `www.` tab actually matches it (two of the three quick-add scopes used to miss).
- **Bass Boost** is louder and cleaner — low shelf moved to 90 Hz (was 340 Hz).
- **Share-code import** is hardened: patterns coerced to text, curves validated, malformed
  rules dropped — a bad pasted code can't break the popup.
- Rule ids now use `crypto.randomUUID()` (no same-millisecond id collisions).

### Removed
- **Per-site "sticky EQ" memory** and the **Remember EQ per site** toggle — replaced by the
  global sound + rules. (Any old saved data is left in place, unused.)
- The **Default sound** card and the **Remembered sites** list in **More**.

### Fixed
- **Applying a preset** changes the sound immediately (it used to update the graph but leave
  the audio flat until you nudged a band by hand).
- **Save preset** — a just-saved preset no longer occasionally vanished from the list.
- **Full window** opens as a centered, framed panel and no longer jumps when you switch views.

### Internal
- The audio engine is now a thin applier: the popup resolves each tab's sound (rule → global →
  flat) and pushes it, so all rule/preset logic lives in one place. Removed the dead per-site
  memory + in-engine resolver code. `npm run typecheck` runs in CI; share-code round-trip tests.

## [2.1.0] — 2026-07-06

### Added
- **Per-tab EQ** — the audio engine now builds an independent filter chain for every
  captured tab, so two tabs (e.g. a film tab and a music tab) can hold two different EQ
  curves at the same time. The popup edits whichever tab is currently active.
- **Per-site memory (sticky EQ)** — a tab's shaped curve is remembered under its
  hostname and, while **Remember EQ per site** is on, re-applied automatically the next
  time that site's tab is captured. Manage or forget saved sites in **More → Remembered
  sites**; the popup previews a site's saved curve before you even press EQ This Tab.
- **Domain rules** — a pattern language assigns a preset or a saved curve to sites by
  hostname pattern: `youtube.` (name + any TLD), `.youtube.` (subdomains + any TLD),
  `.youtube.com` (any subdomain, fixed TLD), exact hosts, and multi-pattern rules
  (`film. / kino.`) that group several sites under one preset. First matching rule wins;
  a hand-tweaked site always overrides its rule. Managed in a new **Rules** tab with an
  inline guide and a one-click "rule for this site". Rules sync across the user's
  browsers. Matcher is unit-tested (14 cases); multi-part TLDs (.co.uk) match
  approximately (no public-suffix list).
- **Russian & English UI** — full RU/EN localization with an in-app **Language** switch
  (More → Language), defaulting to the browser language. The Rules guide is written in
  plain, jargon-free language (no "TLD"/"hostname" wording).
- **Custom accent color** — a hue slider (More → Theme → Custom) alongside the four
  presets. It's a hue picker, not raw RGB: the accent is derived at fixed OKLCH
  lightness/chroma, so any color stays readable and equally bright.
- **In-app Guide** — a detailed, translated "How to use" overlay (More → Guide) covering
  the graph, volume, spectrum, presets, rules, per-tab EQ, and privacy.
- **Share by code** — Copy code / Paste code (Presets and Rules) exchange presets and/or
  rules as a self-contained offline base64 string — no server, no link.
- **Reset scope** — **Reset** (EQ view) flattens the current tab and forgets its saved
  curve; each row in **Tabs** has its own **Reset**; **Clear all** (More) flattens every
  live tab and wipes all remembered sites.

### Changed
- Native `<select>` dropdowns replaced with a themed glass dropdown that matches the dark
  UI (the browser-gray popup couldn't be styled).
- Popup housekeeping: the Spectrum toggle is now an icon-only button; the "Remember EQ
  per site" switch moved from More to the Rules tab; the Remembered-sites list and the
  engine-status footer were removed; Full window is a compact button; the EQ view is
  non-selectable so text can't be highlighted by accident.
- The EQ graph and volume fader are read-only until the active tab is captured (dots and
  handle dim) — edits target a live per-tab chain.
- Live-drag no longer triggers a full status broadcast, and per-domain writes are
  debounced (250 ms, flushed on stop), cutting messaging + storage churn during drags.
- Service worker reports the active tab (id + hostname) to the popup; capture now carries
  the tab URL so the engine can key per-domain memory.

## [2.0.0] — 2026-07-06

Major release: the popup is rebuilt as a React + TypeScript app (Vite + CRXJS,
Tailwind + shadcn/ui) with a dark frosted-glass interface, a horizontal-per-bin
"Ears-style" spectrum, a thin vertical volume fader, and a bottom-tab layout. The
audio engine (service worker + offscreen Web Audio) is unchanged. Load the **`dist/`**
folder unpacked.

### Highlights
- Bottom-nav app (EQ / Presets / Tabs / More); glass volume fader with a 0 dB detent;
  high-resolution spectrum (per-bin, 60fps, silence-safe); refined glass theme + 4
  color themes; onboarding page restyled to match.

### Changed
- **Popup migrated to React + TypeScript** (Vite + CRXJS, Tailwind + shadcn/ui). The
  audio engine stays vanilla (service worker + offscreen Web Audio). Pure audio/preset
  math moved to `src/lib` and unit-tested with Vitest; the EQ graph is plain React SVG
  (Snap.svg dropped). Build → `dist/`; package via `build-zip.ps1` → `release/` zip.
  Load the **`dist/`** folder unpacked. Old flat-file vanilla popup + browser test
  harnesses removed on this build.
- **New bottom-nav app UI** — `popup.html`, `popup.css`, and the popup's view wiring
  rewritten from scratch. The single-screen layout is replaced by four full views
  (EQ / Presets / Tabs / More) switched by a bottom tab bar; the old chip-overlays and
  preset drawer are gone. Styled as a **dark frosted-glass** interface: muted,
  low-saturation accents (no neon), a cool near-black ground with soft radial depth,
  and backdrop-blur panels (kept off every EQ-graph ancestor so drag hit-testing still
  works). The four color themes (Eclipse/Nocturne/Aurora/Solar) recolor the graph +
  accent, all muted. The audio engine is untouched and all 53 tests still pass. Views
  toggle by display/opacity only — never transform — so drag keeps working.
- `test/visual-harness.html` updated to the new markup.

### Added
- **Clearer master-volume strip** — a recessed rounded track, a level fill that shows
  deviation from unity (accent above 0 dB, dim below), a chunky grabbable handle, and a
  live signed dB readout (e.g. "+4"). Widened for easier grabbing.
- **More readable EQ graph** — axis labels use the readable text color (were dark-on-dark),
  a dashed 0 dB baseline marks the boost/cut reference, and band dots are larger.
- MIT license; project open-sourced.
- Multi-store packaging guidance for Chrome, Edge, and Opera (single Chromium zip).
- GitHub scaffolding: CI build-on-tag, issue templates, contributing guide.
- `FIREFOX_PORT.md` documenting the planned Firefox content-script engine.

## [1.0.1] — 2026-07-06

Initial public release candidate.

### Added
- 11-band parametric EQ with a draggable combined response curve (freq × gain,
  Shift-drag = Q, double-click = reset a band).
- Bass boost preset and master volume up to +10 dB.
- Named presets with export/import (JSON) and `storage.sync` across the user's browser.
- Live spectrum overlay (visual only).
- Four themes (Eclipse, Nocturne, Aurora, Solar) with a custom themed dropdown.
- Guide and Active-tabs overlays, onboarding page, full-window mode.
- Manifest V3 architecture: service worker + offscreen Web Audio engine, click-free
  parameter glides, boot-restore with a `pendingRestore` guard.
- Prototype-pollution hardening on all preset read/write paths.
