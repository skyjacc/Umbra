# Chrome Web Store listing — Umbra EQ

Copy/paste fields for the developer dashboard. Fill the `<...>` placeholders.

## Name (≤ 75 chars) — must match manifest "name"

Umbra EQ — Equalizer & Bass Boost

> Verify the name is not already taken on the Chrome Web Store and does not collide
> with an existing trademark before you commit to it. Alternates: "Umbra Sound EQ",
> "Curve EQ — Bass Boost", "Nightshade EQ".

## Summary / short description (≤ 132 chars)

One equalizer for every tab — boost bass, fix harsh or quiet audio, save presets. Per-site rules. Works on Netflix & Spotify.

## Category

Tools (alternate: Accessibility)

## Single purpose (required by Chrome review)

Umbra EQ has one purpose: to let the user equalize and adjust the volume of audio
playing in their browser tabs in real time.

## Detailed description

Umbra EQ adds a real 11-band equalizer to any browser tab. Shape the sound of what you're
listening to live — boost the bass, tame harsh highs, or lift a video that's mixed too
quiet — and hear the change while you drag.

One sound, everywhere. Set your EQ once and it applies to every tab you turn it on for.
Give specific sites their own sound with rules (first match wins), and each tab keeps its
own chain — so a movie and a music tab can sound different at the same time. It works on
Netflix, Spotify, and other streaming sites where audio EQ extensions often go silent.

Features:
• 11-band parametric EQ with a live spectrum behind the curve.
• Bass boost, volume past 100%, and a brick-wall limiter so big boosts stay clean.
• Per-site rules and per-tab sound.
• Presets — Bass Boost, Vocal, Movie, Warm, plus your own; export as a file or a share code.
• Full-window editor, band guide, four themes, English and Russian.
• Keyboard and screen-reader friendly.

100% local — no account, no network, no analytics. Your audio is never recorded or sent.

How to use:
1. Play audio in a tab.
2. Click the Umbra EQ icon, then "EQ This Tab".
3. Drag the dots: left/right = frequency, up/down = boost/cut; Shift-drag changes the
   width (Q); double-click resets. Add a rule like "youtube." to give a site its own sound.

## Permission justifications (paste into the review form)

- activeTab: to access the audio of the tab the user is on when they click the icon.
- tabCapture: to capture that tab's audio stream and pass it through the equalizer.
- storage: to save the user's EQ settings and presets locally.
- offscreen: to run the Web Audio processing graph (unavailable in service workers).

## Privacy

- Privacy policy URL: https://github.com/skyjacc/Umbra/blob/main/PRIVACY.md
  (or host it on GitHub Pages and use that URL).
- Support contact: https://github.com/skyjacc/Umbra/issues
- Data usage disclosures: does NOT collect or use any user data. Check "I do not
  collect user data" where applicable (audio is processed locally and never sent).

## Other Chromium stores (same package)

The exact `dist/umbra-eq-<version>.zip` is accepted by all three; only the listing
dashboards differ:

- **Microsoft Edge Add-ons** — https://partner.microsoft.com/dashboard/microsoftedge
  Reuse the name, summary, description, screenshots, and permission justifications above.
- **Opera add-ons** — https://addons.opera.com/developer/
  Reuse the same assets. Opera reviews are manual and can take longer.

## Assets to prepare

- Store icon: 128×128 (use icon128.png).
- Screenshots: 1280×800 or 640×400, 1–5 images (use the popup renders; a hero shot of
  the EQ curve reads best).
- Small promo tile (optional): 440×280.
- Marquee (optional): 1400×560.
