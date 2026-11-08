# 2.5.0 release-candidate validation

Validated locally on 2026-11-08 with Node 24.12.0, a clean `npm ci`, and the built extension.

| Check | Result |
|---|---|
| Dependency audit | 0 reported vulnerabilities |
| TypeScript | Passed |
| Unit and DOM regression tests | 491 passed across 27 files |
| Native filter-response comparison | 6,075 comparisons; maximum error 0.00001404 dB |
| Native AudioWorklet renders | 15 scenarios across 44.1, 48 and 96 kHz; sample ceiling, quiet-signal delay and stereo relation verified |
| Production build | Passed; application and production dependency licenses included |
| Built-extension UI smoke | Passed: responsive editing, preset controls, rule listbox, language switching, popup geometry/navigation; no page errors |
| Manifest locales | English and Russian messages resolve in Chromium; summaries fit the 132-character limit |
| Native tab capture | Two actual audio tabs captured concurrently, with nonzero output and spectrum; stopping one preserved the other, then both stopped |

The native-capture smoke used an isolated Chromium profile, two local Web Audio tone pages (440 and 880 Hz), and the DevTools `Extensions.triggerAction` command to invoke the real extension action. Chrome APIs were not mocked. Playback remained available after returning focus to the source tabs. This checks capture/offscreen routing and stop behavior; it is not a subjective listening test or a compatibility certification for third-party streaming services.

## Remaining before store submission

- Listen to representative real content on the sites the publisher intends to support, including fullscreen and any protected media that will be advertised.
- Confirm the Chrome Web Store draft uses the new package, both localized descriptions, accurate privacy selections, and screenshots of the shipped interface.
- Confirm the public privacy-policy URL shows the updated policy.

GitHub Actions validates the committed candidate independently. Its result and the merged commit should be checked on the pull request before preparing the release draft. A passing build or a GitHub Release does not establish Chrome Web Store approval.
