# Chrome Web Store listing — Umbra EQ

Copy/paste fields for the developer dashboard. Fill the `<...>` placeholders.

## Name (≤ 75 chars) — must match manifest "name"

Umbra EQ — Equalizer & Bass Boost

> Verify the name is not already taken on the Chrome Web Store and does not collide
> with an existing trademark before you commit to it. Alternates: "Umbra Sound EQ",
> "Curve EQ — Bass Boost", "Nightshade EQ".

## Summary / short description (≤ 132 chars)

Live 11-band equalizer and bass boost for any tab. Crank the bass, tame the highs,
lift vocals — all in real time. No ads, no tracking.

## Category

Tools (alternate: Accessibility)

## Single purpose (required by Chrome review)

Umbra EQ has one purpose: to let the user equalize and adjust the volume of audio
playing in their browser tabs in real time.

## Detailed description

Umbra EQ turns any browser tab into a studio-grade equalizer.

• 11-band parametric EQ — drag the response curve to boost or cut any frequency,
  live, while the audio plays.
• One combined response curve with a spectrum analyzer behind it, so you can see
  exactly what you are shaping.
• Master volume boost — go past 100% when a video is too quiet.
• One-click Bass Boost, plus save your own named presets.
• Works on any tab with sound: music, video, streams, calls.
• 100% local. No account, no ads, no tracking — your audio never leaves your device.

How to use:
1. Play audio in a tab.
2. Click the Umbra EQ icon, then "EQ This Tab".
3. Drag the dots: left/right = frequency, up/down = boost/cut. Shift-drag changes the
   width (Q). Double-click a dot to reset it.

## Permission justifications (paste into the review form)

- activeTab: to access the audio of the tab the user is on when they click the icon.
- tabCapture: to capture that tab's audio stream and pass it through the equalizer.
- storage: to save the user's EQ settings and presets locally.
- offscreen: to run the Web Audio processing graph (unavailable in service workers).

## Privacy

- Privacy policy URL: https://github.com/skyjacc/umbra-eq/blob/main/PRIVACY.md
  (or host it on GitHub Pages and use that URL).
- Support contact: https://github.com/skyjacc/umbra-eq/issues
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
