# Umbra EQ 2.5.0

More precise audio controls and more reliable saved settings, with Umbra's original compact interface.

## Changes

- Enter exact band frequency, gain, and bell-filter Q values. The plotted response now matches Web Audio's filters, and master volume uses the correct amplitude-decibel scale.
- Added a shared stereo output limiter and an output peak meter covering all captured tabs. Auto Gain estimates compensation from the EQ curve without changing your saved master volume.
- Improved Reset and editable Bypass, keyboard navigation, focus visibility, resizing, and English/Russian labels while keeping the original layout.
- Fixed capture startup, Stop, navigation, and recovery races. Keyboard-started captures use saved global/site settings; stopping a tab remains effective when the popup reopens.
- Protected newer edits from delayed saves, recovered pending edits more reliably, and made storage/import failures visible. Shared rules include their referenced presets.
- Added English/Russian store metadata and clarified privacy documentation, including optional Chrome Sync and temporary local diagnostic logs.

## Known limitations

- Chrome 116 or later is required. Audio capture depends on the browser and media source; protected media and browser-internal pages may not work. Chrome may restrict fullscreen during capture.
- Processing covers captured tab playback, not microphone input or system-wide sound. Each new capture requires the user to invoke Umbra for that tab.
- Auto Gain estimates EQ compensation; it does not measure programme loudness or normalize different videos. Umbra does not isolate speech from background music.
- The limiter uses a −1 dBFS sample-peak ceiling and 5 ms lookahead. It is not a true-peak limiter and cannot repair distortion already present in the source.
- Audio is processed locally and is not saved as recordings or uploaded. Presets and site rules can sync through Chrome. Temporary in-memory diagnostics may include full tab URLs; see the [privacy policy](https://github.com/skyjacc/Umbra/blob/main/PRIVACY.md).

The release package is `umbra-eq-2.5.0.zip`. Publishing this GitHub Release does **not** mean that Chrome Web Store has reviewed, approved, or published 2.5.0. Check the [store listing](https://chromewebstore.google.com/detail/plkncppcgglcjdkmcdeajhbfccbnnoee?utm_source=github&utm_medium=referral&utm_campaign=release_2_5_0) for its currently available version.
